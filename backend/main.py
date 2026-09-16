"""应用入口：FastAPI + 静态前端。

- 启动时初始化 SQLite（可通过环境变量 SEED_DEMO=1 写入演示数据）。
- /api/* 提供 REST 接口，其余路径返回前端页面。
- 通过环境变量 PORT / WORK_DB_PATH 控制端口与数据库位置。
- 注册全局校验异常处理器：消毒 NaN/Infinity 等非有限浮点，保证校验错误以
  422 返回，避免 JSON 序列化二次异常导致 500。
"""

import math
import os
import sys
import threading
import webbrowser
from pathlib import Path

from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
import uvicorn

from backend import database as db
from backend.routers import works, stats, data_io, presets, monthly, push


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期：启动时初始化 SQLite（可选写演示数据）。"""
    db.init_db(with_demo=os.environ.get("SEED_DEMO", "0") == "1")
    yield


# 静态资源目录：开发时指向 frontend/，打包为 exe 时指向 _MEIPASS 内置资源
def _static_dir() -> Path:
    if getattr(sys, "frozen", False):  # PyInstaller 打包环境
        base = Path(getattr(sys, "_MEIPASS", Path(sys.executable).parent))
        return base / "frontend"
    return Path(__file__).resolve().parent.parent / "frontend"


STATIC_DIR = _static_dir()

app = FastAPI(
    title="个人工作管理工作台",
    description="本地 DB 存储的工作录入、日程看板与工时收入统计",
    version="1.0.0",
    lifespan=lifespan,
)


app.include_router(works.router)
app.include_router(stats.router)
app.include_router(data_io.router)
app.include_router(presets.router)
app.include_router(monthly.router)
app.include_router(push.router)


@app.get("/api/health")
def health():
    return {"status": "ok", "db": str(db.get_db_path())}


@app.get("/", include_in_schema=False)
def index():
    return FileResponse(STATIC_DIR / "index.html")


def _sanitize_errors(obj):
    """递归消毒校验错误内容，保证最终 JSON 可序列化。

    背景：Python 的 json.loads 默认接受 NaN/Infinity（非标准 JSON），
    pydantic 校验会拒绝并抛出 RequestValidationError；错误上下文里既可能
    携带 input: nan 这类非有限浮点（默认处理器 json.dumps(allow_nan=False)
    序列化会抛 ValueError 二次异常 → 500），也可能携带校验器抛出的异常
    对象（同样不可 JSON 序列化）。此处统一转成可序列化形态后返回 422。
    """
    if isinstance(obj, float):
        return str(obj) if not math.isfinite(obj) else obj
    if isinstance(obj, dict):
        return {k: _sanitize_errors(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_sanitize_errors(v) for v in obj]
    if obj is None or isinstance(obj, (bool, int, str)):
        return obj
    return str(obj)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """全局校验错误处理：返回 422 + 消毒后的错误详情（不因 NaN 崩溃）。"""
    return JSONResponse(
        status_code=422,
        content={"detail": _sanitize_errors(exc.errors())},
    )


@app.exception_handler(404)
async def not_found_handler(request, exc):
    """前端路由兜底：/api 与 /static 路径返回 JSON 404，其余返回 index.html（便于单页应用）。"""
    path = request.url.path
    if path.startswith("/api") or path.startswith("/static"):
        return JSONResponse({"detail": "Not Found"}, status_code=404)
    index_file = STATIC_DIR / "index.html"
    if index_file.exists():
        return FileResponse(index_file)
    return JSONResponse({"detail": "Not Found"}, status_code=404)


# 静态资源（css/js）
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


def _open_browser(port: int) -> None:
    """延迟打开默认浏览器（打包为 exe 时使用）。"""
    webbrowser.open(f"http://127.0.0.1:{port}")


def main() -> None:
    """入口：供 `python -m backend.main` 或打包后的 exe 调用。"""
    port = int(os.environ.get("PORT", "8000"))
    # Docker 部署需监听 0.0.0.0；本地默认仅监听 127.0.0.1，避免数据暴露到局域网
    host = os.environ.get("HOST", "127.0.0.1")
    print("=" * 56)
    print("  个人工作管理工作台")
    print(f"  访问地址: http://127.0.0.1:{port}")
    print(f"  数据库文件: {db.get_db_path()}")
    print("  按 Ctrl+C 停止服务")
    print("=" * 56)

    # 打包为 exe 时自动打开浏览器；开发模式下不打扰
    if getattr(sys, "frozen", False):
        threading.Timer(1.2, _open_browser, args=(port,)).start()

    uvicorn.run(app, host=host, port=port, log_level="info")


if __name__ == "__main__":
    main()
