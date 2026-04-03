@echo off
:: Screen Pilot — 双击停止

cd /d "%~dp0"

where pwsh >nul 2>&1
if %errorlevel% equ 0 (
    pwsh -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\dev\stop-local-agent.ps1"
) else (
    powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\dev\stop-local-agent.ps1"
)

if %errorlevel% neq 0 (
    echo.
    echo Press any key to close...
    pause >nul
)
