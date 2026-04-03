@echo off
:: Screen Pilot — 双击启动
:: Windows 会自动处理 PowerShell 执行策略，直接双击即可。

cd /d "%~dp0"

where pwsh >nul 2>&1
if %errorlevel% equ 0 (
    pwsh -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\dev\start-local-agent.ps1"
) else (
    powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\dev\start-local-agent.ps1"
)

if %errorlevel% neq 0 (
    echo.
    echo Something went wrong. Press any key to close...
    pause >nul
)
