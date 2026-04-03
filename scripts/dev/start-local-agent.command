#!/bin/zsh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
RUNTIME_DIR="$ROOT_DIR/runtime/agent"
APP_DATA_DIR="$RUNTIME_DIR/app_data"
LOG_FILE="$RUNTIME_DIR/agent.log"
PID_FILE="$RUNTIME_DIR/agent.pid"
PORT_FILE="$RUNTIME_DIR/agent.port"
NODE_DIR="$ROOT_DIR/runtime/node"
REQUIRED_NODE_MAJOR=18

# ── resolve node ────────────────────────────────────────────────────
# Priority: system node (if >= 18) > project-local node > auto-install
# Project-local node lives in runtime/node/ and never touches system PATH.

resolve_node() {
  # 1. Check system node
  if command -v node &>/dev/null; then
    local sys_major
    sys_major="$(node -e 'console.log(process.versions.node.split(".")[0])')"
    if (( sys_major >= REQUIRED_NODE_MAJOR )); then
      NODE_BIN="$(command -v node)"
      NPM_BIN="$(command -v npm)"
      echo "Using system Node.js $(node -v)"
      return 0
    fi
    echo "System Node.js $(node -v) is too old (need >= $REQUIRED_NODE_MAJOR)."
  fi

  # 2. Check project-local node
  if [[ -x "$NODE_DIR/bin/node" ]]; then
    local local_major
    local_major="$("$NODE_DIR/bin/node" -e 'console.log(process.versions.node.split(".")[0])')"
    if (( local_major >= REQUIRED_NODE_MAJOR )); then
      NODE_BIN="$NODE_DIR/bin/node"
      NPM_BIN="$NODE_DIR/bin/npm"
      export PATH="$NODE_DIR/bin:$PATH"
      echo "Using project-local Node.js $("$NODE_BIN" -v) from runtime/node/"
      return 0
    fi
    echo "Project-local Node.js is too old, re-downloading..."
    rm -rf "$NODE_DIR"
  fi

  # 3. Auto-install into runtime/node/
  install_node_local
}

install_node_local() {
  echo ""
  echo "Node.js >= $REQUIRED_NODE_MAJOR is not found on this machine."
  echo "Screen Pilot will download Node.js into the project directory (runtime/node/)."
  echo "This does NOT modify your system environment. Delete runtime/node/ to remove it."
  echo ""

  local arch
  arch="$(uname -m)"
  case "$arch" in
    arm64|aarch64) arch="arm64" ;;
    x86_64)        arch="x64" ;;
    *)
      echo "Unsupported architecture: $arch"
      exit 1
      ;;
  esac

  local node_version="v22.16.0"
  local tarball="node-${node_version}-darwin-${arch}.tar.gz"
  local url="https://nodejs.org/dist/${node_version}/${tarball}"
  local tmp_dir
  tmp_dir="$(mktemp -d)"

  echo "Downloading Node.js ${node_version} (${arch})..."
  if ! curl -fSL --progress-bar -o "$tmp_dir/$tarball" "$url"; then
    echo "Download failed. Check your network connection."
    echo "You can also install Node.js manually: https://nodejs.org/"
    rm -rf "$tmp_dir"
    exit 1
  fi

  echo "Extracting to runtime/node/..."
  mkdir -p "$NODE_DIR"
  tar -xzf "$tmp_dir/$tarball" -C "$NODE_DIR" --strip-components=1
  rm -rf "$tmp_dir"

  NODE_BIN="$NODE_DIR/bin/node"
  NPM_BIN="$NODE_DIR/bin/npm"
  export PATH="$NODE_DIR/bin:$PATH"

  echo "Installed Node.js $("$NODE_BIN" -v) into runtime/node/ (project-local only)"
  echo ""
}

# ── preflight ───────────────────────────────────────────────────────

mkdir -p "$RUNTIME_DIR" "$APP_DATA_DIR"
touch "$LOG_FILE"

resolve_node

# auto npm install if node_modules is missing
if [[ ! -d "$ROOT_DIR/node_modules" ]]; then
  echo "First run detected — installing dependencies..."
  cd "$ROOT_DIR" && "$NPM_BIN" install
fi

# ── check for existing agent ────────────────────────────────────────

if [[ -f "$PID_FILE" ]]; then
  EXISTING_PID="$(<"$PID_FILE")"
  if [[ -n "$EXISTING_PID" ]] && kill -0 "$EXISTING_PID" 2>/dev/null; then
    PORT="8788"
    if [[ -f "$PORT_FILE" ]]; then
      PORT="$(<"$PORT_FILE")"
    fi

    URL="http://127.0.0.1:$PORT"
    LOCAL_CONSOLE_URL="$URL/desktop"
    echo "Agent is already running at $URL"
    echo "Desktop console: $LOCAL_CONSOLE_URL"

    if [[ "${NO_OPEN:-0}" != "1" ]]; then
      open "$LOCAL_CONSOLE_URL"
    fi

    exit 0
  fi

  rm -f "$PID_FILE" "$PORT_FILE"
fi

# ── find port ────────────────────────────────────────────────────────

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
LOCAL_CONSOLE_URL="$URL/desktop"

{
  echo "=== $(date '+%Y-%m-%d %H:%M:%S') starting local agent ==="
  echo "Root: $ROOT_DIR"
  echo "Port: $PORT"
  echo "Node: $NODE_BIN"
} >> "$LOG_FILE"

# ── build & start ────────────────────────────────────────────────────

cd "$ROOT_DIR"

echo "Building..."
if ! "$NPM_BIN" run build >> "$LOG_FILE" 2>&1; then
  echo "Build failed. Check: $LOG_FILE"
  exit 1
fi

echo "$PORT" > "$PORT_FILE"
rm -f "$PID_FILE"

NODE_ABS="$(cd "$(dirname "$NODE_BIN")" && pwd)/$(basename "$NODE_BIN")"
nohup /bin/zsh -lc "cd '$ROOT_DIR'; export PATH='$(dirname "$NODE_ABS"):$PATH'; echo '$PORT' > '$PORT_FILE'; echo \$\$ > '$PID_FILE'; exec env PORT='$PORT' APP_DATA_DIR='$APP_DATA_DIR' SCREEN_PILOT_PID_FILE='$PID_FILE' SCREEN_PILOT_PORT_FILE='$PORT_FILE' '$NODE_ABS' build/node/core/agent/src/server.js >> '$LOG_FILE' 2>&1" >/dev/null 2>&1 &

echo "Starting agent..."
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

    echo ""
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
