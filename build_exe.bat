@echo off
chcp 65001 >nul
REM ============================================================
REM  个人工作管理工作台 - Windows 一键构建脚本
REM  构建产物: dist\WorkDashboard.exe（双击即可运行）
REM  特点:
REM    - 无黑色命令行窗口（console=False）
REM    - 自动在后台启动服务，就绪后打开浏览器
REM    - 状态栏图标：左键/双击打开页面，右键可退出
REM  数据文件: exe 同级的 data\works.db
REM  日志文件: exe 同级的 logs\app.log
REM ============================================================
setlocal

echo [1/3] 检查依赖...
python -m pip install -r requirements.txt -q
python -m pip install pyinstaller -q

echo [2/3] 清理旧构建产物...
if exist build rmdir /s /q build
if exist dist rmdir /s /q dist

echo [3/3] 打包中（约 1-3 分钟）...
python -m PyInstaller --noconfirm work_dashboard.spec

echo.
echo ============================================================
echo  构建完成: dist\WorkDashboard.exe
echo.
echo  使用说明:
echo    1. 双击 exe 即可启动（无黑框，自动打开浏览器）
echo    2. 状态栏会出现程序图标：
echo       - 左键单击 / 双击图标：打开浏览器页面
echo       - 右键图标：打开工作台 / 退出程序
echo    3. 数据文件: 与 exe 同级的 data\works.db
echo    4. 日志文件: 与 exe 同级的 logs\app.log
echo.
echo  注意: 如要查看启动问题，打开 logs\app.log 查看日志。
echo ============================================================
pause
