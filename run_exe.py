"""Windows 桌面入口：无控制台运行、自动打开浏览器、系统托盘常驻。

打包为单文件 exe（PyInstaller console=False）后双击运行：
- 无黑色命令行窗口（所有日志写入 logs/app.log）
- 后台自动启动 FastAPI + SQLite 服务
- 服务就绪后自动打开默认浏览器
- 状态栏（系统托盘）显示程序图标：
  - 左键单击 / 双击：打开浏览器页面
  - 右键菜单：打开工作台、退出程序
- 重复启动时自动复用已有实例，仅打开浏览器

开发调试：
  pythonw run_exe.py                 # 无控制台模式
  python run_exe.py                  # 有控制台（便于看报错）
  AUTO_OPEN_BROWSER=0 python run_exe.py  # 启动服务但不自动弹浏览器
"""

import logging
import logging.config
import os
import socket
import sys
import threading
import time
import urllib.request
import webbrowser
from pathlib import Path
from typing import Callable

import uvicorn
from PIL import Image, ImageDraw

# 确保能找到 backend 包（源码运行 / 打包后均可）
PROJECT_ROOT = Path(__file__).resolve().parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from backend.main import app  # noqa: E402


# ---------------------------------------------------------------------------
# 路径与常量
# ---------------------------------------------------------------------------
def _runtime_dir() -> Path:
    """用户数据目录（数据库、日志等可写文件）。

    - 源码运行时：项目根目录
    - PyInstaller 打包后：exe 所在目录（避免写到 _MEIPASS 临时目录）
    """
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    return PROJECT_ROOT


def _resource_dir() -> Path:
    """只读资源目录（图标、前端文件）。打包后位于 _MEIPASS 内。"""
    if getattr(sys, "frozen", False):
        meipass = getattr(sys, "_MEIPASS", None)
        if meipass:
            return Path(meipass) / "assets"
        return Path(sys.executable).resolve().parent / "assets"
    return PROJECT_ROOT / "assets"


PORT = int(os.environ.get("PORT", "8000"))
# 默认仅监听本机回环地址，避免个人数据暴露到局域网；
# 如需局域网访问可设置环境变量 HOST=0.0.0.0
HOST = os.environ.get("HOST", "127.0.0.1")
APP_URL = f"http://127.0.0.1:{PORT}"

RUNTIME_DIR = _runtime_dir()
LOG_DIR = RUNTIME_DIR / "logs"
LOG_DIR.mkdir(parents=True, exist_ok=True)
LOG_FILE = LOG_DIR / "app.log"

_uvicorn_server: uvicorn.Server | None = None
_tray_icon: "pystray.Icon | None" = None


# ---------------------------------------------------------------------------
# 日志：全部写入文件（因为无控制台窗口）
# ---------------------------------------------------------------------------
def _log_config(log_path: Path) -> dict:
    log_path.parent.mkdir(parents=True, exist_ok=True)
    return {
        "version": 1,
        "disable_existing_loggers": False,
        "formatters": {
            "default": {"format": "%(asctime)s %(levelname)s [%(name)s] %(message)s"},
        },
        "handlers": {
            "file": {
                "class": "logging.FileHandler",
                "filename": str(log_path),
                "encoding": "utf-8",
                "formatter": "default",
            },
        },
        "root": {"handlers": ["file"], "level": "INFO"},
        "loggers": {
            "uvicorn": {"handlers": ["file"], "level": "INFO", "propagate": False},
            "uvicorn.error": {"handlers": ["file"], "level": "INFO", "propagate": False},
            "uvicorn.access": {"handlers": ["file"], "level": "INFO", "propagate": False},
        },
    }


def _setup_logging() -> logging.Logger:
    logging.config.dictConfig(_log_config(LOG_FILE))
    return logging.getLogger("WorkDashboard")


# ---------------------------------------------------------------------------
# 图标：优先使用 assets/app.png，否则动态绘制
# ---------------------------------------------------------------------------
def _create_tray_image() -> Image.Image:
    png_path = _resource_dir() / "app.png"
    if png_path.exists():
        img = Image.open(png_path)
        # 托盘图标建议 64px
        if img.size != (64, 64):
            img = img.resize((64, 64), Image.LANCZOS)
        return img.convert("RGBA")
    return _draw_fallback_icon(64)


def _draw_fallback_icon(size: int) -> Image.Image:
    """没有资源文件时，动态绘制一个简洁的时钟图标。"""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    s = size / 256.0

    def S(v: float) -> float:
        return v * s

    margin = S(10)
    d.rounded_rectangle(
        [margin, margin, size - margin, size - margin],
        radius=S(56),
        fill=(15, 23, 42, 255),
    )

    cx, cy = S(132), S(126)
    r = S(74)
    d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=(34, 211, 238, 255), width=max(2, int(S(14))))
    d.line([cx, cy, cx, cy - S(48)], fill=(226, 232, 240, 255), width=max(2, int(S(11))))
    d.line([cx, cy, cx - S(38), cy + S(22)], fill=(226, 232, 240, 255), width=max(2, int(S(11))))
    d.ellipse([cx - S(10), cy - S(10), cx + S(10), cy + S(10)], fill=(226, 232, 240, 255))
    return img


# ---------------------------------------------------------------------------
# 服务与浏览器
# ---------------------------------------------------------------------------
def _is_port_open(port: int, host: str = "127.0.0.1", timeout: float = 0.3) -> bool:
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except OSError:
        return False


def _health_ok(url: str, timeout: float = 1.5) -> bool:
    try:
        with urllib.request.urlopen(f"{url}/api/health", timeout=timeout) as resp:
            return resp.status == 200
    except Exception:
        return False


def _open_browser(_icon=None, _item=None) -> None:
    """打开默认浏览器访问工作台。"""
    try:
        webbrowser.open(APP_URL)
    except Exception:
        pass


def _start_uvicorn() -> uvicorn.Server:
    """在后台线程启动 uvicorn。"""
    global _uvicorn_server
    config = uvicorn.Config(
        app,
        host=HOST,
        port=PORT,
        log_config=_log_config(LOG_FILE),
        access_log=True,
    )
    server = uvicorn.Server(config)
    _uvicorn_server = server
    t = threading.Thread(target=server.run, daemon=True, name="uvicorn-server")
    t.start()
    return server


def _wait_ready(timeout: float = 30.0) -> bool:
    deadline = time.time() + timeout
    while time.time() < deadline:
        if _health_ok(APP_URL):
            return True
        time.sleep(0.15)
    return False


# ---------------------------------------------------------------------------
# 系统托盘
# ---------------------------------------------------------------------------
def _on_open(_icon, _item) -> None:
    _open_browser()


def _on_exit(icon, _item) -> None:
    """右键菜单 - 退出：停止服务并退出程序。"""
    global _uvicorn_server
    if _uvicorn_server is not None:
        _uvicorn_server.should_exit = True
        # 通知 uvicorn 立即结束；join 最多等 3 秒
        _uvicorn_server.force_exit = True
        for _ in range(30):
            if _uvicorn_server.started:
                break
            time.sleep(0.1)
    icon.stop()
    os._exit(0)


def _setup_tray(logger: logging.Logger) -> None:
    """启动系统托盘图标，阻塞主线程。"""
    global _tray_icon

    try:
        import pystray
    except Exception as exc:
        logger.error("无法加载 pystray: %s", exc)
        # 托盘不可用则保持后台服务运行
        while True:
            time.sleep(60)

    menu = pystray.Menu(
        pystray.MenuItem("打开工作台", _on_open),
        pystray.Menu.SEPARATOR,
        pystray.MenuItem("退出", _on_exit),
    )
    icon = pystray.Icon(
        "WorkDashboard",
        _create_tray_image(),
        "个人工作管理工作台",
        menu,
    )
    icon.on_activate = _open_browser  # 左键单击/双击打开页面
    _tray_icon = icon
    logger.info("系统托盘图标已创建")
    icon.run()


# ---------------------------------------------------------------------------
# 单实例保护
# ---------------------------------------------------------------------------
def _single_instance() -> bool:
    """Windows 互斥体：防止同时运行多个 exe 实例。"""
    if sys.platform != "win32":
        return True
    try:
        import ctypes
        kernel32 = ctypes.windll.kernel32
        mutex = kernel32.CreateMutexW(None, False, "WorkDashboard_SingleInstance_Mutex")
        return kernel32.GetLastError() != 183  # ERROR_ALREADY_EXISTS
    except Exception:
        # 互斥体失败时回退到端口检测
        return not _is_port_open(PORT)


# ---------------------------------------------------------------------------
# 主流程
# ---------------------------------------------------------------------------
def main() -> None:
    logger = _setup_logging()
    logger.info("个人工作管理工作台启动 | exe=%s | port=%d", sys.executable, PORT)

    # 1. 单实例检查：已有实例在运行则只打开浏览器
    if not _single_instance():
        logger.info("检测到已有实例，仅打开浏览器页面")
        _open_browser()
        return

    # 2. 端口冲突检查（例如用户已手动启动 python -m backend.main）
    port_taken = _is_port_open(PORT)
    if port_taken:
        if _health_ok(APP_URL):
            logger.info("端口 %d 已有健康服务，打开浏览器并创建托盘", PORT)
            _open_browser()
            _setup_tray(logger)
            return
        else:
            logger.error("端口 %d 已被占用但非本服务，请先释放端口", PORT)
            sys.exit(1)

    # 3. 启动后台服务
    logger.info("正在启动后台服务 %s:%d ...", HOST, PORT)
    _start_uvicorn()

    # 4. 等待就绪，自动打开浏览器
    if _wait_ready():
        logger.info("服务已就绪: %s", APP_URL)
        if os.environ.get("AUTO_OPEN_BROWSER", "1") != "0":
            _open_browser()
    else:
        logger.error("服务启动超时，请查看日志: %s", LOG_FILE)
        sys.exit(1)

    # 5. 进入托盘消息循环（主线程阻塞，直到用户点退出）
    _setup_tray(logger)


if __name__ == "__main__":
    main()
