#!/usr/bin/env bash
set -euo pipefail

if [ -z "${SSH_PRIVATE_KEY:-}" ] || [ -z "${VPS_HOST:-}" ] || [ -z "${VPS_USER:-}" ]; then
  echo "SSH_PRIVATE_KEY, VPS_HOST, VPS_USER are required"
  exit 1
fi

TARGET_DIR="${VPS_TARGET_DIR:-/home/ngoc_anh/messenger-bot}"
SOURCE_PATH="${1:-upload-bundle}"
SSH_PORT="${VPS_SSH_PORT:-22}"
MAX_ATTEMPTS="${SCP_MAX_ATTEMPTS:-5}"
CONNECT_TIMEOUT="${SCP_CONNECT_TIMEOUT:-45}"

mkdir -p ~/.ssh
printf '%s\n' "$SSH_PRIVATE_KEY" > ~/.ssh/deploy_key
chmod 600 ~/.ssh/deploy_key

HOST="${VPS_USER}@${VPS_HOST}"
SSH_OPTS=(
  -i ~/.ssh/deploy_key
  -P "${SSH_PORT}"
  -o StrictHostKeyChecking=no
  -o UserKnownHostsFile=/dev/null
  -o ServerAliveInterval=15
  -o ServerAliveCountMax=4
  -o ConnectTimeout="${CONNECT_TIMEOUT}"
)

echo "Uploading ${SOURCE_PATH} -> ${HOST}:${TARGET_DIR}"

for attempt in $(seq 1 "$MAX_ATTEMPTS"); do
  echo "SCP attempt ${attempt}/${MAX_ATTEMPTS}..."
  if scp "${SSH_OPTS[@]}" -r "${SOURCE_PATH}/." "${HOST}:${TARGET_DIR}/"; then
    echo "Upload succeeded on attempt ${attempt}"
    exit 0
  fi
  if [ "$attempt" -lt "$MAX_ATTEMPTS" ]; then
    sleep $((attempt * 15))
  fi
done

echo "ERROR: SCP failed after ${MAX_ATTEMPTS} attempts"
exit 1
