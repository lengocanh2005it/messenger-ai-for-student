#!/usr/bin/env bash
set -euo pipefail

if [ -z "${SSH_PRIVATE_KEY:-}" ] || [ -z "${VPS_HOST:-}" ] || [ -z "${VPS_USER:-}" ]; then
  echo "SSH_PRIVATE_KEY, VPS_HOST, VPS_USER are required"
  exit 1
fi

TARGET_DIR="${VPS_TARGET_DIR:-/home/ngoc_anh/messenger-bot}"
SCRIPT_PATH="${1:-${TARGET_DIR}/vps-deploy.sh}"
MAX_ATTEMPTS="${SSH_MAX_ATTEMPTS:-5}"
CONNECT_TIMEOUT="${SSH_CONNECT_TIMEOUT:-45}"

mkdir -p ~/.ssh
printf '%s\n' "$SSH_PRIVATE_KEY" > ~/.ssh/deploy_key
chmod 600 ~/.ssh/deploy_key

HOST="${VPS_USER}@${VPS_HOST}"
SSH_OPTS=(
  -i ~/.ssh/deploy_key
  -o StrictHostKeyChecking=no
  -o UserKnownHostsFile=/dev/null
  -o ServerAliveInterval=15
  -o ServerAliveCountMax=4
  -o ConnectTimeout="${CONNECT_TIMEOUT}"
)

quote() {
  printf '%q' "$1"
}

REMOTE_CMD=$(
  cat <<EOF
set -euo pipefail
export IMAGE=$(quote "${IMAGE:-}")
export DEPLOY_MODE=$(quote "${DEPLOY_MODE:-}")
export FORCE_RECREATE=$(quote "${FORCE_RECREATE:-false}")
export GHCR_PULL_TOKEN=$(quote "${GHCR_PULL_TOKEN:-}")
export GHCR_USER=$(quote "${GHCR_USER:-}")
chmod +x $(quote "${SCRIPT_PATH}")
bash $(quote "${SCRIPT_PATH}")
EOF
)

for attempt in $(seq 1 "$MAX_ATTEMPTS"); do
  echo "SSH attempt ${attempt}/${MAX_ATTEMPTS}..."
  if ssh "${SSH_OPTS[@]}" "$HOST" "$REMOTE_CMD"; then
    echo "SSH deploy succeeded on attempt ${attempt}"
    exit 0
  fi
  if [ "$attempt" -lt "$MAX_ATTEMPTS" ]; then
    sleep $((attempt * 15))
  fi
done

echo "ERROR: SSH deploy failed after ${MAX_ATTEMPTS} attempts"
exit 1
