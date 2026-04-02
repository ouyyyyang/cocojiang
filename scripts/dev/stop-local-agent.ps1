$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir = Split-Path -Parent (Split-Path -Parent $ScriptDir)
$RuntimeDir = Join-Path $RootDir "runtime/agent"
$PidFile = Join-Path $RuntimeDir "agent.pid"
$PortFile = Join-Path $RuntimeDir "agent.port"

function Resolve-AgentPid {
    if (Test-Path $PidFile) {
        $pidText = (Get-Content $PidFile -Raw).Trim()
        if ($pidText) {
            try {
                $process = Get-Process -Id ([int]$pidText) -ErrorAction Stop
                return $process.Id
            } catch {
            }
        }
    }

    if (Test-Path $PortFile) {
        $portText = (Get-Content $PortFile -Raw).Trim()
        if ($portText) {
            $escaped = [regex]::Escape(":$portText")
            $match = netstat -ano -p tcp | Select-String "$escaped\s+.*LISTENING" | Select-Object -First 1
            if ($match) {
                $parts = ($match -replace "\s+", " ").Trim().Split(" ")
                if ($parts.Count -gt 0) {
                    return [int]$parts[-1]
                }
            }
        }
    }

    return $null
}

function Resolve-AgentPort {
    if (Test-Path $PortFile) {
        $portText = (Get-Content $PortFile -Raw).Trim()
        if ($portText) {
            return [int]$portText
        }
    }

    foreach ($candidate in 8788..8792) {
        $escaped = [regex]::Escape(":$candidate")
        if (netstat -ano -p tcp | Select-String "$escaped\s+.*LISTENING") {
            return $candidate
        }
    }

    return $null
}

$pid = Resolve-AgentPid
$port = Resolve-AgentPort

if (-not $pid) {
    Write-Host "No local agent PID file found."
    exit 0
}

if ($port) {
    try {
        Invoke-WebRequest -UseBasicParsing -Method Post -Uri "http://127.0.0.1:$port/api/local-control/stop" -TimeoutSec 5 | Out-Null
        for ($attempt = 0; $attempt -lt 15; $attempt += 1) {
            try {
                $null = Get-Process -Id $pid -ErrorAction Stop
                Start-Sleep -Seconds 1
            } catch {
                break
            }
        }
    } catch {
    }
}

try {
    $process = Get-Process -Id $pid -ErrorAction Stop
    Stop-Process -Id $process.Id -Force
} catch {
}

Remove-Item -Force -ErrorAction SilentlyContinue $PidFile, $PortFile
Write-Host "Local agent stopped."
