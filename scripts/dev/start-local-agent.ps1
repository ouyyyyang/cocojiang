$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir = Split-Path -Parent (Split-Path -Parent $ScriptDir)
$RuntimeDir = Join-Path $RootDir "runtime/agent"
$AppDataDir = Join-Path $RuntimeDir "app_data"
$LogFile = Join-Path $RuntimeDir "agent.log"
$PidFile = Join-Path $RuntimeDir "agent.pid"
$PortFile = Join-Path $RuntimeDir "agent.port"

# -- preflight checks -------------------------------------------------

$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCmd) {
    Write-Error "Node.js is not installed.`n`nInstall it from: https://nodejs.org/"
    exit 1
}

$nodeMajor = [int](node -e "console.log(process.versions.node.split('.')[0])")
if ($nodeMajor -lt 18) {
    Write-Error "Node.js 18.18+ is required, but you have $(node -v).`nPlease upgrade: https://nodejs.org/"
    exit 1
}

# -- setup -------------------------------------------------------------

New-Item -ItemType Directory -Force -Path $RuntimeDir | Out-Null
New-Item -ItemType Directory -Force -Path $AppDataDir | Out-Null
if (-not (Test-Path $LogFile)) {
    New-Item -ItemType File -Path $LogFile | Out-Null
}

# auto npm install if node_modules is missing
if (-not (Test-Path (Join-Path $RootDir "node_modules"))) {
    Write-Host "First run detected - installing dependencies..."
    Push-Location $RootDir
    try { npm install } finally { Pop-Location }
}

# -- helper functions --------------------------------------------------

function Test-AgentPid {
    param([string]$PidText)

    if ([string]::IsNullOrWhiteSpace($PidText)) {
        return $false
    }

    try {
        $null = Get-Process -Id ([int]$PidText) -ErrorAction Stop
        return $true
    } catch {
        return $false
    }
}

function Test-PortListening {
    param([int]$Port)

    $escaped = [regex]::Escape(":$Port")
    return [bool](netstat -ano -p tcp | Select-String "$escaped\s+.*LISTENING")
}

function Find-FreePort {
    foreach ($candidate in 8788..8792) {
        if (-not (Test-PortListening -Port $candidate)) {
            return $candidate
        }
    }

    throw "No available port found in 8788-8792."
}

# -- check for existing agent ------------------------------------------

if (Test-Path $PidFile) {
    $existingPid = (Get-Content $PidFile -Raw).Trim()
    if (Test-AgentPid -PidText $existingPid) {
        $port = "8788"
        if (Test-Path $PortFile) {
            $savedPort = (Get-Content $PortFile -Raw).Trim()
            if ($savedPort) {
                $port = $savedPort
            }
        }

        $url = "http://127.0.0.1:$port"
        Write-Host "Agent is already running at $url"
        Write-Host "Desktop console: $url/desktop"
        Start-Process "$url/desktop"
        exit 0
    }

    Remove-Item -Force -ErrorAction SilentlyContinue $PidFile, $PortFile
}

# -- find port & build -------------------------------------------------

$port = Find-FreePort
$url = "http://127.0.0.1:$port"

Add-Content -Path $LogFile -Value "=== $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') starting local agent ==="
Add-Content -Path $LogFile -Value "Root: $RootDir"
Add-Content -Path $LogFile -Value "Port: $port"

Push-Location $RootDir
try {
    Write-Host "Building..."
    npm run build *>> $LogFile
} finally {
    Pop-Location
}

# -- start agent -------------------------------------------------------

Set-Content -Path $PortFile -Value $port
Remove-Item -Force -ErrorAction SilentlyContinue $PidFile

$serverCommand = @(
    "`$env:PORT='$port'"
    "`$env:APP_DATA_DIR='$AppDataDir'"
    "`$env:SCREEN_PILOT_PID_FILE='$PidFile'"
    "`$env:SCREEN_PILOT_PORT_FILE='$PortFile'"
    "Set-Location '$RootDir'"
    "node build/node/core/agent/src/server.js"
) -join "; "

$process = Start-Process `
    -FilePath "powershell.exe" `
    -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", $serverCommand) `
    -WorkingDirectory $RootDir `
    -WindowStyle Hidden `
    -RedirectStandardOutput $LogFile `
    -RedirectStandardError $LogFile `
    -PassThru

Set-Content -Path $PidFile -Value $process.Id

Write-Host "Starting agent..."
for ($attempt = 0; $attempt -lt 30; $attempt += 1) {
    if ($process.HasExited) {
        Write-Error "Agent exited early. Check: $LogFile"
        Remove-Item -Force -ErrorAction SilentlyContinue $PidFile, $PortFile
        exit 1
    }

    try {
        Invoke-WebRequest -UseBasicParsing -Uri "$url/api/config" -TimeoutSec 3 | Out-Null
        $tokenFile = Join-Path $AppDataDir "pairing-token.txt"
        if (Test-Path $tokenFile) {
            $token = (Get-Content $tokenFile -Raw).Trim()
            if ($token) {
                try {
                    Set-Clipboard -Value $token
                    Write-Host "Pairing token copied to clipboard: $token"
                } catch {
                    Write-Host "Pairing token: $token"
                }
            }
        }

        Write-Host ""
        Write-Host "Agent is ready at $url"
        Write-Host "Desktop console: $url/desktop"
        Start-Process "$url/desktop"
        exit 0
    } catch {
        Start-Sleep -Seconds 1
    }
}

Write-Error "Agent did not become ready in time. Check: $LogFile"
exit 1
