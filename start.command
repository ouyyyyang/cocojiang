#!/bin/zsh
# Screen Pilot — 双击启动
# macOS 可能会提示"无法验证开发者"，请右键此文件 -> 打开 -> 打开。
# 只需要做一次，之后双击就能直接运行了。

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# 确保脚本自身和内部脚本有执行权限
chmod +x "$SCRIPT_DIR/scripts/dev/start-local-agent.command" 2>/dev/null || true
chmod +x "$SCRIPT_DIR/scripts/dev/stop-local-agent.command" 2>/dev/null || true

exec "$SCRIPT_DIR/scripts/dev/start-local-agent.command"
