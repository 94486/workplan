"""应用入口：FastAPI + 静态前端。

- 启动时初始化 SQLite（可通过环境变量 SEED_DEMO=1 写入演示数据）。
- /api/* 提供 REST 接口，其余路径返回前端页面。
- 通过环境变量 PORT / WORK_DB_PATH 控制端口与数据库位置。
"""

import os
import sys
import threading
import webbrowser
from pathlib import Path

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
import uvicorn

from backend import database as db
from backend.routers import works, stats, data_io, presets


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


@app.get("/api/health")
def health():
    return {"status": "ok", "db": str(db.get_db_path())}


@app.get("/", include_in_schema=False)
def index():
    return FileResponse(STATIC_DIR / "index.html")


@app.exception_handler(404)
async def not_found_handler(request, exc):
    """前端路由兜底：非 /api 路径一律返回 index.html（便于单页应用）。"""
    if request.url.path.startswith("/api"):
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
