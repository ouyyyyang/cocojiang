#!/bin/zsh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
RUNTIME_DIR="$ROOT_DIR/runtime/agent"
APP_DATA_DIR="$RUNTIME_DIR/app_data"
LOG_FILE="$RUNTIME_DIR/agent.log"
PID_FILE="$RUNTIME_DIR/agent.pid"
PORT_FILE="$RUNTIME_DIR/agent.port"

mkdir -p "$RUNTIME_DIR" "$APP_DATA_DIR"
touch "$LOG_FILE"

if [[ -f "$PID_FILE" ]]; then
  EXISTING_PID="$(<"$PID_FILE")"
  if [[ -n "$EXISTING_PID" ]] && kill -0 "$EXISTING_PID" 2>/dev/null; then
    PORT="8788"
    if [[ -f "$PORT_FILE" ]]; then
      PORT="$(<"$PORT_FILE")"
    fi

    URL="http://127.0.0.1:$PORT"
    LOCAL_CONSOLE_URL="$URL/mac"
    echo "Agent is already running at $URL"
    echo "Desktop console: $LOCAL_CONSOLE_URL"

    if [[ "${NO_OPEN:-0}" != "1" ]]; then
      open "$LOCAL_CONSOLE_URL"
    fi

    exit 0
  fi

  rm -f "$PID_FILE" "$PORT_FILE"
fi

find_port() {
  local candidate
  for candidate in 8788 8789 8790 8791 8792; do
    if ! lsof -iTCP:"$candidate" -sTCP:LISTEN -n -P >/dev/null 2>&1; then
      echo "$candidate"
      return 0
    fi
  done

  return 1
}

PORT="$(find_port)" || {
  echo "No available port found in 8788-8792."
  exit 1
}

URL="http://127.0.0.1:$PORT"
LOCAL_CONSOLE_URL="$URL/mac"

{
  echo "=== $(date '+%Y-%m-%d %H:%M:%S') starting local agent ==="
  echo "Root: $ROOT_DIR"
  echo "Port: $PORT"
} >> "$LOG_FILE"

cd "$ROOT_DIR"

if ! npm run build >> "$LOG_FILE" 2>&1; then
  echo "Build failed. Check: $LOG_FILE"
  exit 1
fi

echo "$PORT" > "$PORT_FILE"
rm -f "$PID_FILE"
nohup /bin/zsh -lc "cd '$ROOT_DIR'; echo '$PORT' > '$PORT_FILE'; echo \$\$ > '$PID_FILE'; exec env PORT='$PORT' APP_DATA_DIR='$APP_DATA_DIR' SCREEN_PILOT_PID_FILE='$PID_FILE' SCREEN_PILOT_PORT_FILE='$PORT_FILE' node build/node/core/agent/src/server.js >> '$LOG_FILE' 2>&1" >/dev/null 2>&1 &

for _ in {1..30}; do
  if [[ -f "$PID_FILE" ]]; then
    PID="$(<"$PID_FILE")"
    if [[ -n "$PID" ]] && ! kill -0 "$PID" 2>/dev/null; then
      echo "Agent exited early. Check: $LOG_FILE"
      rm -f "$PID_FILE" "$PORT_FILE"
      exit 1
    fi
  fi

  if curl -fsS "$URL/api/config" >/dev/null 2>&1; then
    TOKEN_FILE="$APP_DATA_DIR/pairing-token.txt"
    if [[ -f "$TOKEN_FILE" ]]; then
      TOKEN="$(<"$TOKEN_FILE")"
      printf "%s" "$TOKEN" | pbcopy
      echo "Pairing token copied to clipboard: $TOKEN"
    fi

    echo "Agent is ready at $URL"
    echo "Desktop console: $LOCAL_CONSOLE_URL"

    if [[ "${NO_OPEN:-0}" != "1" ]]; then
      open "$LOCAL_CONSOLE_URL"
    fi

    exit 0
  fi

  sleep 1
done

echo "Agent did not become ready in time. Check: $LOG_FILE"
exit 1
