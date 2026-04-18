#!/usr/bin/env bash
# Requires a running daemon (e.g. `adf run daemon` from repo root).
set -euo pipefail
BASE="${AGENT_DAEMON_URL:-http://127.0.0.1:8787}"
curl -sS "${BASE}/api/health" | jq .
curl -sS "${BASE}/api/engines" | jq '.engines | length'
curl -sS "${BASE}/api/engine-models" | jq '.engines | length'
ENGINE="$(curl -sS "${BASE}/api/engines" | jq -r '[.engines[] | select(.available==true)][0].id // empty')"
if [[ -z "${ENGINE}" ]]; then
  echo "--- SSE: skipped (no engine with available=true; install a CLI) ---"
  exit 0
fi
echo "--- SSE (first lines, engine=${ENGINE}) ---"
curl -sS -N -X POST "${BASE}/api/chat" \
  -H "Content-Type: application/json" \
  -d "{\"engineId\":\"${ENGINE}\",\"message\":\"smoke\"}" | head -5
