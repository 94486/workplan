@echo off
chcp 65001 >nul
setlocal

REM ============================================================
REM  个人工作管理工作台 - Windows 打包脚本
REM  产物: dist\WorkDashboard.exe
REM  说明: 不自动安装依赖；打包前自动备份 dist 中的数据库，
REM        打包完成后恢复，确保重新打包不丢失已录入数据。
REM ============================================================

set "PROJECT_DIR=%~dp0"
set "SPEC_FILE=%PROJECT_DIR%work_dashboard.spec"
set "DIST_EXE=%PROJECT_DIR%dist\WorkDashboard.exe"
set "DIST_DB=%PROJECT_DIR%dist\data\works.db"
set "DB_BACKUP=%PROJECT_DIR%_db_backup.tmp"

echo ============================================================
echo   个人工作管理工作台 - EXE 打包
echo ============================================================
echo.

REM ------------------------------------------------------------
REM [1/4] 检测 PyInstaller
REM ------------------------------------------------------------
echo [1/4] 检测打包环境...
python -c "import PyInstaller" >nul 2>&1
if errorlevel 1 (
    echo [错误] 未检测到 PyInstaller。
    echo        请先执行: pip install pyinstaller
    echo        或使用你平时打包其他程序的 Python 环境。
    pause
    exit /b 1
)
echo       PyInstaller 已就绪。

REM ------------------------------------------------------------
REM [2/4] 备份已有数据库
REM ------------------------------------------------------------
echo.
echo [2/4] 检查并备份已有数据...
set "HAS_OLD_DB=0"
if exist "%DIST_DB%" (
    copy /y "%DIST_DB%" "%DB_BACKUP%" >nul
    set "HAS_OLD_DB=1"
    echo       已备份 dist\data\works.db
) else (
    echo       无旧数据，打包后将自动创建新数据库
)

REM ------------------------------------------------------------
REM [3/4] 清理旧产物并打包
REM ------------------------------------------------------------
echo.
echo [3/4] 清理旧产物并打包（约 1-3 分钟）...
if exist "%PROJECT_DIR%build" rmdir /s /q "%PROJECT_DIR%build"
if exist "%PROJECT_DIR%dist" rmdir /s /q "%PROJECT_DIR%dist"
echo       清理完成，开始打包...
echo.
python -m PyInstaller --noconfirm "%SPEC_FILE%"
if errorlevel 1 (
    echo.
    echo [错误] 打包失败，请查看上方错误信息。
    if exist "%DB_BACKUP%" del /q "%DB_BACKUP%"
    pause
    exit /b 1
)

REM ------------------------------------------------------------
REM [4/4] 恢复数据库并验证
REM ------------------------------------------------------------
echo.
echo [4/4] 恢复数据...
if not exist "%PROJECT_DIR%dist\data" mkdir "%PROJECT_DIR%dist\data"
if "%HAS_OLD_DB%"=="1" (
    copy /y "%DB_BACKUP%" "%DIST_DB%" >nul
    del /q "%DB_BACKUP%"
    echo       已恢复原有数据库
) else (
    echo       无旧数据，首次运行将自动创建
)

echo.
if not exist "%DIST_EXE%" (
    echo [错误] 未找到产物: %DIST_EXE%
    pause
    exit /b 1
)

for %%f in ("%DIST_EXE%") do set "EXE_SIZE=%%~zf"
set /a EXE_MB=%EXE_SIZE% / 1048576

echo ============================================================
echo   打包成功
echo   路径: %DIST_EXE%
echo   大小: 约 %EXE_MB% MB
echo.
if "%HAS_OLD_DB%"=="1" (
echo   数据: 已沿用原有数据库（dist\data\works.db）
) else (
echo   数据: 首次运行将自动创建新数据库
)
echo ============================================================
echo.

set /p "OPEN_DIR=打开产物目录? (Y/N): "
if /i "%OPEN_DIR%"=="Y" explorer "%PROJECT_DIR%dist"

endlocal
exit /b 0
