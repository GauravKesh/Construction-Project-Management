# PowerShell launcher for running all services locally as separate jobs

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir = Split-Path -Parent $ScriptDir
Set-Location $RootDir

$PythonPath = Join-Path $RootDir ".venv\Scripts\python.exe"
if (-not (Test-Path $PythonPath)) {
    $PythonPath = "python"
}

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " Starting Construction Monitoring System (Separate Roles) " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

Write-Host ">> Running database migrations & initialization..." -ForegroundColor Yellow
& $PythonPath -m app.cli migrate

$Jobs = @()

try {
    Write-Host ">> Launching API Server (FastAPI + Socket.IO)..." -ForegroundColor Green
    $Jobs += Start-Job -ScriptBlock { param($p, $dir) Set-Location $dir; & $p -m app.cli api } -ArgumentList $PythonPath, $RootDir

    Write-Host ">> Launching Processing Worker..." -ForegroundColor Green
    $Jobs += Start-Job -ScriptBlock { param($p, $dir) Set-Location $dir; & $p -m app.cli worker } -ArgumentList $PythonPath, $RootDir

    Write-Host ">> Launching MQTT Ingestion Consumer..." -ForegroundColor Green
    $Jobs += Start-Job -ScriptBlock { param($p, $dir) Set-Location $dir; & $p -m app.cli mqtt-consumer } -ArgumentList $PythonPath, $RootDir

    Write-Host ">> Launching Video Stream & CV Inference Handler..." -ForegroundColor Green
    $Jobs += Start-Job -ScriptBlock { param($p, $dir) Set-Location $dir; & $p -m app.cli video-handler } -ArgumentList $PythonPath, $RootDir

    Write-Host "==========================================================" -ForegroundColor Cyan
    Write-Host " All services running. Press Ctrl+C to terminate all.     " -ForegroundColor Cyan
    Write-Host "==========================================================" -ForegroundColor Cyan

    while ($true) {
        Start-Sleep -Seconds 2
    }
}
finally {
    Write-Host "`n>> Stopping background services..." -ForegroundColor Yellow
    foreach ($job in $Jobs) {
        Stop-Job $job -ErrorAction SilentlyContinue
        Remove-Job $job -ErrorAction SilentlyContinue
    }
    Write-Host ">> All processes terminated." -ForegroundColor Green
}
