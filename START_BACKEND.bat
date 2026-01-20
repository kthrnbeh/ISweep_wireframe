@echo off
REM Start ISweep Backend Server

echo ========================================
echo ISweep Backend Starter
echo ========================================
echo.
echo Starting backend on http://127.0.0.1:8001
echo.

cd /d c:\ISweep_wireframe\isweep-backend

REM Check if Python is available
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Python is not installed or not in PATH
    echo Please install Python 3.11+ and add it to your PATH
    pause
    exit /b 1
)

echo Python found. Starting server...
echo.
python -m app --port 8001 --no-reload

pause
