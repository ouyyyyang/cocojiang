$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir = Split-Path -Parent (Split-Path -Parent $ScriptDir)
$RuntimeDir = Join-Path $RootDir "runtime/agent"
$AppDataDir = Join-Path $RuntimeDir "app_data"
$LogFile = Join-Path $RuntimeDir "agent.log"
$PidFile = Join-Path $RuntimeDir "agent.pid"
$PortFile = Join-Path $RuntimeDir "agent.port"
$NodeDir = Join-Path $RootDir "runtime/node"
$RequiredNodeMajor = 18

# -- resolve node ------------------------------------------------------
# Priority: system node (if >= 18) > project-local node > auto-install
# Project-local node lives in runtime\node\ and never touches system PATH.

function Get-NodeMajor {
    param([string]$NodeExe)
    try {
        $raw = & $NodeExe -e "console.log(process.versions.node.split('.')[0])" 2>$null
        return [int]$raw
    } catch {
        return 0
    }
}

function Test-AgentPid {
    param([string]$PidText)
    if ([string]::IsNullOrWhiteSpace($PidText)) { return $false }
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
        if (-not (Test-PortListening -Port $candidate)) { return $candidate }
    }
    throw "No available port found in 8788-8792."
}

function Resolve-Node {
    # 1. Check system node
    $sysNode = Get-Command node -ErrorAction SilentlyContinue
    if ($sysNode) {
        $major = Get-NodeMajor -NodeExe $sysNode.Source
        if ($major -ge $RequiredNodeMajor) {
            $script:NodeBin = $sysNode.Source
            $script:NpmBin = (Get-Command npm -ErrorAction SilentlyContinue).Source
            Write-Host "Using system Node.js $(& node -v)"
            return
        }
        Write-Host "System Node.js $(& node -v) is too old (need >= $RequiredNodeMajor)."
    }

    # 2. Check project-local node
    $localNode = Join-Path $NodeDir "node.exe"
    if (Test-Path $localNode) {
        $major = Get-NodeMajor -NodeExe $localNode
        if ($major -ge $RequiredNodeMajor) {
            $script:NodeBin = $localNode
            $script:NpmBin = Join-Path $NodeDir "npm.cmd"
            $env:PATH = "$NodeDir;$env:PATH"
            Write-Host "Using project-local Node.js $(& $localNode -v) from runtime\node\"
            return
        }
        Write-Host "Project-local Node.js is too old, re-downloading..."
        Remove-Item -Recurse -Force $NodeDir
    }

    # 3. Auto-install
    Install-NodeLocal
}

function Install-NodeLocal {
    Write-Host ""
    Write-Host "Node.js >= $RequiredNodeMajor is not found on this machine."
    Write-Host "Screen Pilot will download Node.js into the project directory (runtime\node\)."
    Write-Host "This does NOT modify your system environment. Delete runtime\node\ to remove it."
    Write-Host ""

    $arch = if ([Environment]::Is64BitOperatingSystem) {
        if ($env:PROCESSOR_ARCHITECTURE -eq "ARM64") { "arm64" } else { "x64" }
    } else { "x86" }

    $nodeVersion = "v22.16.0"
    $zipName = "node-$nodeVersion-win-$arch.zip"
    $url = "https://nodejs.org/dist/$nodeVersion/$zipName"
    $tmpDir = Join-Path ([System.IO.Path]::GetTempPath()) "screen-pilot-node-$(Get-Random)"

    New-Item -ItemType Directory -Force -Path $tmpDir | Out-Null
    $zipPath = Join-Path $tmpDir $zipName

    Write-Host "Downloading Node.js $nodeVersion ($arch)..."
    try {
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        $wc = New-Object System.Net.WebClient
        $wc.DownloadFile($url, $zipPath)
    } catch {
        Write-Error "Download failed. Check your network connection.`nYou can also install Node.js manually: https://nodejs.org/"
        Remove-Item -Recurse -Force $tmpDir -ErrorAction SilentlyContinue
        exit 1
    }

    Write-Host "Extracting to runtime\node\..."
    Expand-Archive -Path $zipPath -DestinationPath $tmpDir -Force

    $extracted = Get-ChildItem -Path $tmpDir -Directory | Where-Object { $_.Name -like "node-*" } | Select-Object -First 1
    if (-not $extracted) {
        Write-Error "Extraction failed: no node directory found."
        Remove-Item -Recurse -Force $tmpDir -ErrorAction SilentlyContinue
        exit 1
    }

    New-Item -ItemType Directory -Force -Path (Split-Path $NodeDir) | Out-Null
    Move-Item -Path $extracted.FullName -Destination $NodeDir -Force
    Remove-Item -Recurse -Force $tmpDir -ErrorAction SilentlyContinue

    $script:NodeBin = Join-Path $NodeDir "node.exe"
    $script:NpmBin = Join-Path $NodeDir "npm.cmd"
    $env:PATH = "$NodeDir;$env:PATH"

    Write-Host "Installed Node.js $(& $script:NodeBin -v) into runtime\node\ (project-local only)"
    Write-Host ""
}

# -- preflight ---------------------------------------------------------

New-Item -ItemType Directory -Force -Path $RuntimeDir | Out-Null
New-Item -ItemType Directory -Force -Path $AppDataDir | Out-Null
if (-not (Test-Path $LogFile)) {
    New-Item -ItemType File -Path $LogFile | Out-Null
}

Resolve-Node

# auto npm install if node_modules is missing
if (-not (Test-Path (Join-Path $RootDir "node_modules"))) {
    Write-Host "First run detected - installing dependencies..."
    Push-Location $RootDir
    try { & $NpmBin install } finally { Pop-Location }
}

# -- check for existing agent ------------------------------------------

if (Test-Path $PidFile) {
    $existingPid = (Get-Content $PidFile -Raw).Trim()
    if (Test-AgentPid -PidText $existingPid) {
        $port = "8788"
        if (Test-Path $PortFile) {
            $savedPort = (Get-Content $PortFile -Raw).Trim()
            if ($savedPort) { $port = $savedPort }
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
Add-Content -Path $LogFile -Value "Node: $NodeBin"

Push-Location $RootDir
try {
    Write-Host "Building..."
    & $NpmBin run build *>> $LogFile
} finally {
    Pop-Location
}

# -- start agent -------------------------------------------------------

Set-Content -Path $PortFile -Value $port
Remove-Item -Force -ErrorAction SilentlyContinue $PidFile

$nodeAbsolute = (Resolve-Path $NodeBin).Path
$serverCommand = @(
    "`$env:PORT='$port'"
    "`$env:APP_DATA_DIR='$AppDataDir'"
    "`$env:SCREEN_PILOT_PID_FILE='$PidFile'"
    "`$env:SCREEN_PILOT_PORT_FILE='$PortFile'"
    "Set-Location '$RootDir'"
    "& '$nodeAbsolute' build/node/core/agent/src/server.js"
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
