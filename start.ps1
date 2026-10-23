<#
.SYNOPSIS
    BuildTrack — Unified Server Startup Script for Windows (PowerShell)
.DESCRIPTION
    Launches API Gateway, Stream Worker, MQTT Consumer, Video Handler, and Frontend in 1 command.
.PARAMETER WithSim
    Launches the live IoT sensor simulator alongside the server roles.
.PARAMETER BackendOnly
    Skips starting the frontend UI.
.EXAMPLE
    .\start.ps1
    .\start.ps1 -WithSim
#>

[CmdletBinding()]
param (
    [switch]$WithSim,
    [switch]$BackendOnly
)

$ErrorActionPreference = "Stop"
$Host.UI.RawUI.WindowTitle = "BuildTrack — Construction Monitoring Server"

$RootDir = $PSScriptRoot
$BackendDir = Join-Path $RootDir "backend"
$FrontendDir = Join-Path $RootDir "frontend"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "    🏗️  BUILDTRACK REAL-TIME MONITORING SERVER (WINDOWS)  " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host ""

# 1. Check Python
$PythonExe = Get-Command "python" -ErrorAction SilentlyContinue
if (-not $PythonExe) {
    $PythonExe = Get-Command "py" -ErrorAction SilentlyContinue
}
if (-not $PythonExe) {
    Write-Host "[ERROR] Python is not installed or not in your Windows PATH." -ForegroundColor Red
    Write-Host "Please install Python 3.10+ from https://www.python.org/downloads/ and check 'Add python.exe to PATH'." -ForegroundColor Yellow
    exit 1
}

# 2. Check Virtual Environment
$VenvPython = Join-Path $BackendDir ".venv\Scripts\python.exe"
if (-not (Test-Path $VenvPython)) {
    Write-Host "[SETUP] Virtual environment not found. Creating backend\.venv..." -ForegroundColor Yellow
    & $PythonExe.Source -m venv (Join-Path $BackendDir ".venv")
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERROR] Failed to create virtual environment." -ForegroundColor Red
        exit 1
    }
    Write-Host "[SETUP] Installing Python requirements..." -ForegroundColor Yellow
    & $VenvPython -m pip install --upgrade pip
    & $VenvPython -m pip install -r (Join-Path $BackendDir "requirements.txt")
    Write-Host "[SETUP] Dependencies installed successfully." -ForegroundColor Green
}

# 3. Check .env
$EnvFile = Join-Path $BackendDir ".env"
$EnvExample = Join-Path $BackendDir ".env.example"
if (-not (Test-Path $EnvFile)) {
    Write-Host "[SETUP] backend\.env not found. Copying from .env.example..." -ForegroundColor Yellow
    Copy-Item $EnvExample $EnvFile
    Write-Host "[SETUP] backend\.env initialized." -ForegroundColor Green
}

# 4. Check Backing Services
Write-Host "[CHECK] Testing infrastructure connections..." -ForegroundColor Cyan

function Test-PortConnection ($port, $serviceName) {
    try {
        $tcp = New-Object System.Net.Sockets.TcpClient
        $iar = $tcp.BeginConnect("127.0.0.1", $port, $null, $null)
        $wait = $iar.AsyncWaitHandle.WaitOne(1500, $false)
        if ($wait -and $tcp.Connected) {
            $tcp.EndConnect($iar)
            $tcp.Close()
            Write-Host "   ✅ $serviceName (port $port): ACTIVE" -ForegroundColor Green
            return $true
        } else {
            $tcp.Close()
            Write-Host "   ⚠️  $serviceName is not responding on 127.0.0.1:$port" -ForegroundColor Yellow
            return $false
        }
    } catch {
        Write-Host "   ⚠️  $serviceName is not responding on 127.0.0.1:$port" -ForegroundColor Yellow
        return $false
    }
}

Test-PortConnection 5432 "PostgreSQL" | Out-Null
Test-PortConnection 27017 "MongoDB" | Out-Null
Test-PortConnection 6379 "Redis" | Out-Null
Test-PortConnection 1883 "Mosquitto MQTT" | Out-Null
Write-Host ""

# 5. Run Database Migrations
Write-Host "[DB] Running database migrations..." -ForegroundColor Cyan
Push-Location $BackendDir
try {
    & $VenvPython -m app.cli migrate
} catch {
    Write-Host "[WARN] Migration warning: $_" -ForegroundColor Yellow
}
Pop-Location

Write-Host ""
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " 🚀 LAUNCHING BUILDTRACK SERVER ROLES..." -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 6. Launch Backend Server Roles in New Console Windows
Write-Host ">> [1/4] Starting REST API Gateway & Socket.IO (http://localhost:8000)..." -ForegroundColor White
Start-Process "cmd.exe" -ArgumentList "/k", "title BuildTrack - API Gateway && cd /d `"$BackendDir`" && `"$VenvPython`" -m app.cli api"

Write-Host ">> [2/4] Starting Stream Processing & Rollup Worker..." -ForegroundColor White
Start-Process "cmd.exe" -ArgumentList "/k", "title BuildTrack - Stream Worker && cd /d `"$BackendDir`" && `"$VenvPython`" -m app.cli worker"

Write-Host ">> [3/4] Starting MQTT Ingestion Consumer..." -ForegroundColor White
Start-Process "cmd.exe" -ArgumentList "/k", "title BuildTrack - MQTT Consumer && cd /d `"$BackendDir`" && `"$VenvPython`" -m app.cli mqtt-consumer"

Write-Host ">> [4/4] Starting Video Stream & CV PPE Safety Handler..." -ForegroundColor White
Start-Process "cmd.exe" -ArgumentList "/k", "title BuildTrack - Video Handler && cd /d `"$BackendDir`" && `"$VenvPython`" -m app.cli video-handler"

# 7. Optional Simulator
if ($WithSim) {
    Write-Host ">> [OPTIONAL] Starting Live IoT Sensor Simulator..." -ForegroundColor Magenta
    Start-Process "cmd.exe" -ArgumentList "/k", "title BuildTrack - Device Simulator && cd /d `"$BackendDir`" && `"$VenvPython`" scripts\mqtt_sensor_simulator.py"
}

# 8. Frontend Launch
if (-not $BackendOnly) {
    $NpmCmd = Get-Command "npm" -ErrorAction SilentlyContinue
    if ($NpmCmd -and (Test-Path $FrontendDir)) {
        Write-Host ">> [FRONTEND] Launching Next.js Web UI (http://localhost:3000)..." -ForegroundColor Green
        if (-not (Test-Path (Join-Path $FrontendDir "node_modules"))) {
            Write-Host "   Installing frontend dependencies (npm install)..." -ForegroundColor Yellow
            Push-Location $FrontendDir
            & npm install
            Pop-Location
        }
        Start-Process "cmd.exe" -ArgumentList "/k", "title BuildTrack - Frontend (Next.js) && cd /d `"$FrontendDir`" && npm run dev"
    } else {
        Write-Host "[NOTE] To run the frontend manually: cd frontend; npm run dev" -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "==========================================================" -ForegroundColor Green
Write-Host " 🚀 BUILDTRACK SYSTEM IS FULLY OPERATIONAL ON WINDOWS" -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green
Write-Host " • Frontend UI:        http://localhost:3000" -ForegroundColor White
Write-Host " • Swagger API Docs:   http://localhost:8000/docs" -ForegroundColor White
Write-Host " • ReDoc:              http://localhost:8000/redoc" -ForegroundColor White
Write-Host " • WebSocket Server:   ws://localhost:8000/socket.io" -ForegroundColor White
Write-Host " • Liveness Health:    http://localhost:8000/health/live" -ForegroundColor White
Write-Host "==========================================================" -ForegroundColor Green
Write-Host " Demo Credentials:" -ForegroundColor Cyan
Write-Host " - Admin:          admin@buildtrack.com / Admin@123456" -ForegroundColor White
Write-Host " - Safety Officer: safety@buildtrack.com / Safety@123456" -ForegroundColor White
Write-Host " - Project Mgr:    pm@buildtrack.com / Manager@123456" -ForegroundColor White
Write-Host "==========================================================" -ForegroundColor Green
Write-Host "Each service runs in its own window. Close a window to stop that service." -ForegroundColor Gray
Write-Host ""
