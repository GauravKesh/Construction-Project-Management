@echo off
setlocal enabledelayedexpansion

REM ==============================================================================
REM BuildTrack — Unified Server Startup Script for Windows
REM Launches all required backend services, workers, and frontend in 1 click.
REM ==============================================================================

title BuildTrack — Construction Monitoring Server

set "ROOT_DIR=%~dp0"
set "BACKEND_DIR=%ROOT_DIR%backend"
set "FRONTEND_DIR=%ROOT_DIR%frontend"

echo ==========================================================
echo     BUILDTRACK REAL-TIME MONITORING SERVER (WINDOWS)
echo ==========================================================
echo.

REM 1. Verify Python Installation
where python >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python is not installed or not in your Windows PATH.
    echo Please install Python 3.10+ from https://www.python.org/downloads/
    echo Make sure to check "Add python.exe to PATH" during installation.
    echo.
    pause
    exit /b 1
)

REM 2. Verify or Create Python Virtual Environment
set "PYTHON=%BACKEND_DIR%\.venv\Scripts\python.exe"
if not exist "%PYTHON%" (
    echo [SETUP] Virtual environment not found. Creating backend\.venv...
    python -m venv "%BACKEND_DIR%\.venv"
    if %errorlevel% neq 0 (
        echo [ERROR] Failed to create virtual environment.
        pause
        exit /b 1
    )
    echo [SETUP] Upgrading pip and installing dependencies...
    "%PYTHON%" -m pip install --upgrade pip
    "%PYTHON%" -m pip install -r "%BACKEND_DIR%\requirements.txt"
    if %errorlevel% neq 0 (
        echo [ERROR] Failed to install requirements.txt.
        pause
        exit /b 1
    )
    echo [SETUP] Python dependencies successfully installed.
)

REM 3. Check and Initialize .env configuration
if not exist "%BACKEND_DIR%\.env" (
    echo [SETUP] backend\.env not found. Creating from .env.example...
    copy "%BACKEND_DIR%\.env.example" "%BACKEND_DIR%\.env" >nul
    echo [SETUP] Created backend\.env with default development settings.
)

REM 4. Check Backing Services (PostgreSQL, MongoDB, Redis, Mosquitto MQTT)
echo [CHECK] Checking infrastructure backing services...

set "CHECK_SCRIPT=import socket, sys; s = socket.socket(); s.settimeout(1.5); sys.exit(0 if s.connect_ex(('127.0.0.1', int(sys.argv[1]))) == 0 else 1)"

"%PYTHON%" -c "%CHECK_SCRIPT%" 5432 >nul 2>&1
if %errorlevel% equ 0 (
    echo    [OK] PostgreSQL (port 5432): ACTIVE
) else (
    echo    [WARN] PostgreSQL is not responding on 127.0.0.1:5432
    echo           Please ensure PostgreSQL service is running.
)

"%PYTHON%" -c "%CHECK_SCRIPT%" 27017 >nul 2>&1
if %errorlevel% equ 0 (
    echo    [OK] MongoDB (port 27017): ACTIVE
) else (
    echo    [WARN] MongoDB is not responding on 127.0.0.1:27017
    echo           Please ensure MongoDB service is running.
)

"%PYTHON%" -c "%CHECK_SCRIPT%" 6379 >nul 2>&1
if %errorlevel% equ 0 (
    echo    [OK] Redis (port 6379): ACTIVE
) else (
    echo    [WARN] Redis is not responding on 127.0.0.1:6379
    echo           Please ensure Redis / Memurai service is running.
)

"%PYTHON%" -c "%CHECK_SCRIPT%" 1883 >nul 2>&1
if %errorlevel% equ 0 (
    echo    [OK] Mosquitto MQTT (port 1883): ACTIVE
) else (
    echo    [WARN] Mosquitto MQTT is not responding on 127.0.0.1:1883
    echo           Please ensure Mosquitto service is running.
)

echo.

REM 5. Run Database Migrations
echo [DB] Running database migrations...
cd /d "%BACKEND_DIR%"
"%PYTHON%" -m app.cli migrate
if %errorlevel% neq 0 (
    echo [WARN] Migration encountered an error or database is connecting.
)

echo.
echo ==========================================================
echo  LAUNCHING BUILDTRACK SERVICES...
echo ==========================================================

REM 6. Launch Backend Server Roles in Dedicated Windows
echo >> [1/4] Starting REST API Gateway & Socket.IO (http://localhost:8000)...
start "BuildTrack - API Gateway" /D "%BACKEND_DIR%" cmd /k ""%PYTHON%" -m app.cli api"

echo >> [2/4] Starting Stream Processing & Rollup Worker...
start "BuildTrack - Stream Worker" /D "%BACKEND_DIR%" cmd /k ""%PYTHON%" -m app.cli worker"

echo >> [3/4] Starting MQTT Ingestion Consumer...
start "BuildTrack - MQTT Consumer" /D "%BACKEND_DIR%" cmd /k ""%PYTHON%" -m app.cli mqtt-consumer"

echo >> [4/4] Starting Video Stream & CV PPE Safety Handler...
start "BuildTrack - Video Handler" /D "%BACKEND_DIR%" cmd /k ""%PYTHON%" -m app.cli video-handler"

REM 7. Optional IoT Sensor Simulator
if "%1"=="--with-sim" (
    echo >> [OPTIONAL] Starting IoT Sensor Simulator...
    start "BuildTrack - Device Simulator" /D "%BACKEND_DIR%" cmd /k ""%PYTHON%" scripts\mqtt_sensor_simulator.py"
)

REM 8. Frontend Check & Launch
where npm >nul 2>&1
if %errorlevel% equ 0 (
    if exist "%FRONTEND_DIR%\package.json" (
        echo >> [FRONTEND] Launching Next.js Web UI (http://localhost:3000)...
        if not exist "%FRONTEND_DIR%\node_modules" (
            echo    Installing npm dependencies in frontend...
            cd /d "%FRONTEND_DIR%"
            call npm install
        )
        start "BuildTrack - Frontend (Next.js)" /D "%FRONTEND_DIR%" cmd /k "npm run dev"
    )
) else (
    echo [NOTE] npm not detected in PATH. To run frontend: cd frontend ^&^& npm run dev
)

cd /d "%ROOT_DIR%"

echo.
echo ==========================================================
echo  BUILDTRACK SYSTEM IS RUNNING ON WINDOWS
echo ==========================================================
echo  - Frontend Web App:     http://localhost:3000
echo  - API Swagger Docs:     http://localhost:8000/docs
echo  - ReDoc:                http://localhost:8000/redoc
echo  - WebSocket Server:     ws://localhost:8000/socket.io
echo  - Health Check:         http://localhost:8000/health/live
echo ==========================================================
echo  Demo Credentials:
echo  - Admin: admin@buildtrack.com / Admin@123456
echo ==========================================================
echo.
echo Separate terminal windows have been opened for each service.
echo To stop a service, simply close its terminal window.
echo.
pause
