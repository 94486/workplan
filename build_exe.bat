@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

REM ============================================================
REM  Personal Work Dashboard - Windows build script
REM  Output: dist\WorkDashboard.exe
REM  Notes : Does NOT auto-install dependencies.
REM          Backs up dist\data\works.db before build and
REM          restores it afterwards, so your data is never lost.
REM ============================================================

set "PROJECT_DIR=%~dp0"
set "SPEC_FILE=%PROJECT_DIR%work_dashboard.spec"
set "DIST_EXE=%PROJECT_DIR%dist\WorkDashboard.exe"
set "DIST_DB=%PROJECT_DIR%dist\data\works.db"
set "DB_BACKUP=%PROJECT_DIR%_db_backup.tmp"

echo ============================================================
echo   Personal Work Dashboard - EXE Build
echo ============================================================
echo.

REM ------------------------------------------------------------
REM [1/5] Check PyInstaller
REM ------------------------------------------------------------
echo [1/5] Checking build environment...
python -c "import PyInstaller" >nul 2>&1
if errorlevel 1 (
    echo [ERROR] PyInstaller not found.
    echo         Please install it first: pip install pyinstaller
    pause
    exit /b 1
)
echo        PyInstaller is ready.

REM ------------------------------------------------------------
REM [2/5] Backup existing database
REM ------------------------------------------------------------
echo.
echo [2/5] Checking and backing up data...
set "HAS_OLD_DB=0"
if exist "%DIST_DB%" (
    copy /y "%DIST_DB%" "%DB_BACKUP%" >nul
    set "HAS_OLD_DB=1"
    echo        Backed up dist\data\works.db
) else (
    echo        No old data; a new database will be created on first run.
)

REM ------------------------------------------------------------
REM [3/5] Kill running instance and clean, then build
REM ------------------------------------------------------------
echo.
echo [3/5] Stopping old program, cleaning, building (1-3 min)...
taskkill /f /im WorkDashboard.exe >nul 2>&1
if errorlevel 1 ( echo        No running instance ) else ( echo        Old instance stopped )
timeout /t 1 /nobreak >nul
if exist "%PROJECT_DIR%build" rmdir /s /q "%PROJECT_DIR%build"
if exist "%PROJECT_DIR%dist\WorkDashboard.exe" del /q "%PROJECT_DIR%dist\WorkDashboard.exe"
echo        Cleaned. Building...
echo.
python -m PyInstaller --noconfirm "%SPEC_FILE%"
if errorlevel 1 (
    echo.
    echo [ERROR] Build failed. Check messages above.
    if exist "%DB_BACKUP%" del /q "%DB_BACKUP%"
    pause
    exit /b 1
)

REM ------------------------------------------------------------
REM [4/5] Restore database
REM ------------------------------------------------------------
echo.
echo [4/5] Restoring data...
if not exist "%PROJECT_DIR%dist\data" mkdir "%PROJECT_DIR%dist\data"
if "%HAS_OLD_DB%"=="1" (
    copy /y "%DB_BACKUP%" "%DIST_DB%" >nul
    del /q "%DB_BACKUP%"
    echo        Database restored.
) else (
    echo        No old data; new database will be created on first run.
)

REM ------------------------------------------------------------
REM [5/5] Verify output
REM ------------------------------------------------------------
if not exist "%DIST_EXE%" (
    echo [ERROR] Output not found: %DIST_EXE%
    pause
    exit /b 1
)
for %%f in ("%DIST_EXE%") do set "EXE_SIZE=%%~zf"
set /a EXE_MB=%EXE_SIZE% / 1048576

echo.
echo ============================================================
echo   BUILD OK
echo   Path: %DIST_EXE%
echo   Size: ~!EXE_MB! MB
echo   Data: preserved (backup/restore)
echo ============================================================
echo.
echo Run WorkDashboard.exe to start.
echo If the browser does not open, visit http://127.0.0.1:8000
echo.
pause
