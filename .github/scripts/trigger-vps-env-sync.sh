#!/usr/bin/env bash
set -euo pipefail

if [ -z "${INTERNAL_API_KEY:-}" ]; then
  echo "INTERNAL_API_KEY is required (GitHub secret)"
  exit 1
fi

BASE_URL="${VPS_PUBLIC_URL:-https://aiassist.aihubproduction.com}"
ENDPOINT="${BASE_URL%/}/messenger/ops/doppler-sync"
MAX_ATTEMPTS="${DEPLOY_HTTP_MAX_ATTEMPTS:-5}"
CONNECT_TIMEOUT="${DEPLOY_HTTP_TIMEOUT:-30}"

PAYLOAD='{"project":"messenger-bot","config":"prd"}'

echo "Triggering env sync: ${ENDPOINT}"

for attempt in $(seq 1 "$MAX_ATTEMPTS"); do
  echo "HTTP attempt ${attempt}/${MAX_ATTEMPTS}..."
  if curl -sfS \
    --connect-timeout "$CONNECT_TIMEOUT" \
    --max-time 120 \
    -X POST "$ENDPOINT" \
    -H "Authorization: Bearer ${INTERNAL_API_KEY}" \
    -H "Content-Type: application/json" \
    -d "$PAYLOAD"; then
    echo ""
    echo "Env sync trigger accepted on attempt ${attempt}"
    exit 0
  fi
  if [ "$attempt" -lt "$MAX_ATTEMPTS" ]; then
    sleep $((attempt * 10))
  fi
done

echo "ERROR: env sync trigger failed after ${MAX_ATTEMPTS} attempts"
exit 1
