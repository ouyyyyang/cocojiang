#!/bin/zsh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
RUNTIME_DIR="$ROOT_DIR/runtime/agent"
PID_FILE="$RUNTIME_DIR/agent.pid"
PORT_FILE="$RUNTIME_DIR/agent.port"

lookup_pid() {
  local port

  if [[ -f "$PID_FILE" ]]; then
    PID_FROM_FILE="$(<"$PID_FILE")"
    if [[ -n "$PID_FROM_FILE" ]] && kill -0 "$PID_FROM_FILE" 2>/dev/null; then
      echo "$PID_FROM_FILE"
      return 0
    fi
  fi

  if [[ -f "$PORT_FILE" ]]; then
    PORT="$(<"$PORT_FILE")"
    PID_BY_FILE_PORT="$(lsof -tiTCP:"$PORT" -sTCP:LISTEN -n -P | head -n 1 || true)"
    if [[ -n "$PID_BY_FILE_PORT" ]]; then
      echo "$PID_BY_FILE_PORT"
      return 0
    fi
  fi

  for port in 8788 8789 8790 8791 8792; do
    PID_BY_PORT="$(lsof -tiTCP:"$port" -sTCP:LISTEN -n -P | head -n 1 || true)"
    if [[ -n "$PID_BY_PORT" ]]; then
      echo "$PID_BY_PORT"
      return 0
    fi
  done

  pgrep -f "build/node/core/agent/src/server.js" | head -n 1
}

PID="$(lookup_pid || true)"

if [[ -z "$PID" ]]; then
  echo "No local agent PID file found."
  exit 0
fi

if [[ -n "$PID" ]] && kill -0 "$PID" 2>/dev/null; then
  kill "$PID"

  for _ in {1..10}; do
    if ! kill -0 "$PID" 2>/dev/null; then
      break
    fi

    sleep 1
  done

  if kill -0 "$PID" 2>/dev/null; then
    kill -9 "$PID"
  fi

  echo "Local agent stopped."
else
  echo "Local agent was not running."
fi

rm -f "$PID_FILE" "$PORT_FILE"
