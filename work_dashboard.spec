# ============================================================
# 个人工作管理工作台 - PyInstaller 打包配置
#
# 生成 Windows 单文件 exe（无控制台黑框，含前端/图标/数据库文件）。
# 使用方式：
#   pip install pyinstaller
#   pyinstaller work_dashboard.spec
# 产物位于 dist/WorkDashboard.exe，双击即启动服务并打开浏览器，
# 状态栏图标可打开页面或退出程序。
# ============================================================

import sys
from pathlib import Path

project_root = Path(SPECPATH)

a = Analysis(
    [str(project_root / "run_exe.py")],
    pathex=[str(project_root)],
    binaries=[],
    datas=[
        (str(project_root / "frontend"), "frontend"),
        (str(project_root / "assets"), "assets"),
    ],
    hiddenimports=[
        "uvicorn",
        "uvicorn.logging",
        "uvicorn.loops",
        "uvicorn.loops.auto",
        "uvicorn.loops.asyncio",
        "uvicorn.protocols",
        "uvicorn.protocols.http",
        "uvicorn.protocols.http.auto",
        "uvicorn.protocols.http.h11_impl",
        "uvicorn.protocols.websockets",
        "uvicorn.protocols.websockets.auto",
        "uvicorn.protocols.websockets.wsproto_impl",
        "uvicorn.lifespan",
        "uvicorn.lifespan.on",
        "uvicorn.config",
        # 数据导入（FastAPI Form/File 依赖 python-multipart，运行时按需加载）
        "python_multipart",
        "multipart",
        # Windows 系统托盘 + 图标
        "pystray",
        "pystray._win32",
        "PIL",
        "PIL.Image",
        "PIL.ImageDraw",
    ],
    hookspath=[],
    runtime_hooks=[],
    excludes=["tkinter", "pytest", "setuptools._distutils"],
    noarchive=False,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name="WorkDashboard",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=False,          # 无控制台黑框；日志写入 logs/app.log
    icon=str(project_root / "assets" / "app.ico"),
)
