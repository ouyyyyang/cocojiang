#!/bin/zsh
# Screen Pilot — 双击停止

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

chmod +x "$SCRIPT_DIR/scripts/dev/stop-local-agent.command" 2>/dev/null || true

exec "$SCRIPT_DIR/scripts/dev/stop-local-agent.command"
