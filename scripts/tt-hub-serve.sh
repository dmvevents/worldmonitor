#!/usr/bin/env bash
# GA runner for the self-hosted hub (what the launchd agent executes):
#   1. Claude-on-Bedrock shim          scripts/tt-claude-proxy.py        :8788
#   2. local API server (sidecar, docker mode: executes api/ handlers, no cloud fallback)   :46123
#   3. front door: built SPA + /api proxy   scripts/tt-hub-server.mjs       :3100
#   4. seed loop (keeps Upstash populated)  scripts/tt-seed-loop.sh
# Secrets come from ~/.config/worldmonitor/keys.env; Bedrock from the AWS profile.
#
#   bash scripts/tt-hub-serve.sh            # foreground; Ctrl-C stops every child
#   HUB_PORT=3200 bash scripts/tt-hub-serve.sh
set -uo pipefail
cd "$(dirname "$0")/.."
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

KEYS_FILE="${WM_KEYS_FILE:-$HOME/.config/worldmonitor/keys.env}"
if [ -f "$KEYS_FILE" ]; then set -a; . "$KEYS_FILE"; set +a; fi

HUB_PORT="${HUB_PORT:-3100}"
SIDECAR_PORT="${SIDECAR_PORT:-46123}"
PROXY_PORT="${CLAUDE_PROXY_PORT:-8788}"
PYTHON="${PYTHON:-/opt/homebrew/bin/python3}"
MODEL="${BEDROCK_MODEL:-us.anthropic.claude-sonnet-5}"
export AWS_PROFILE="${AWS_PROFILE:-bedrock}"
PIDS=()
cleanup() { for p in "${PIDS[@]}"; do kill "$p" 2>/dev/null; done; }
trap cleanup EXIT INT TERM
log() { echo "[hub $(date '+%H:%M:%S')] $*" >&2; }

[ -f dist/dashboard.html ] || { log "dist/dashboard.html missing: run 'npm run build:full' (and 'node scripts/build-sidecar-handlers.mjs')"; exit 1; }
ls api/*/v1/\[rpc\].js >/dev/null 2>&1 || { log "API handler bundles missing: run 'node scripts/build-sidecar-handlers.mjs'"; exit 1; }

# 1. Claude shim (reuse if already up). Wait until it answers: the sidecar probes LLM providers at
# boot and marks an unreachable one offline, so starting it first would send every brief to nothing.
if ! curl -fsS -m 2 "http://127.0.0.1:${PROXY_PORT}/health" >/dev/null 2>&1; then
  PORT="$PROXY_PORT" BEDROCK_MODEL="$MODEL" "$PYTHON" scripts/tt-claude-proxy.py &
  PIDS+=($!)
  for _ in $(seq 1 40); do curl -fsS -m 1 "http://127.0.0.1:${PROXY_PORT}/health" >/dev/null 2>&1 && break; sleep 0.5; done
fi
export LLM_API_URL="http://127.0.0.1:${PROXY_PORT}/v1/chat/completions"
export LLM_API_KEY="${LLM_API_KEY:-local-bedrock}"
export LLM_MODEL="$MODEL"
export LLM_TOOL_PROVIDER=generic
export LLM_REASONING_PROVIDER=generic
unset OLLAMA_API_URL OLLAMA_MODEL   # provider chain is ollama → … → generic; keep Claude first

# Browser auth: the SPA mints an anonymous session at /api/wm-session, HMAC-signed with
# WM_SESSION_SECRET. Persist one locally so sessions survive restarts (never in the repo).
SECRETS_FILE="${WM_LOCAL_SECRETS_FILE:-$HOME/.config/worldmonitor/local-secrets.env}"
if [ ! -f "$SECRETS_FILE" ]; then
  mkdir -p "$(dirname "$SECRETS_FILE")"
  umask 077
  printf 'WM_SESSION_SECRET=%s\n' "$(node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))")" > "$SECRETS_FILE"
fi
# Operator key for this self-hosted instance: the gateway Pro-gates briefs, Insights, summaries and
# the analyst chat behind an enterprise key (WORLDMONITOR_VALID_KEYS). The front door adds it as
# X-WorldMonitor-Key on every proxied /api request, so the single local user gets the full product
# on their own Claude bill; the browser never sees the key.
if ! grep -q '^WM_LOCAL_OPERATOR_KEY=' "$SECRETS_FILE"; then
  printf 'WM_LOCAL_OPERATOR_KEY=%s\n' "wmop_$(node -e "console.log(require('node:crypto').randomBytes(24).toString('base64url'))")" >> "$SECRETS_FILE"
fi
set -a; . "$SECRETS_FILE"; set +a
export WORLDMONITOR_VALID_KEYS="${WORLDMONITOR_VALID_KEYS:+$WORLDMONITOR_VALID_KEYS,}$WM_LOCAL_OPERATOR_KEY"

# 2. local API server. docker mode = self-hosted: handlers run here, nothing proxies to api.worldmonitor.app.
# The sidecar default-denies without LOCAL_API_TOKEN; like docker/entrypoint.sh we mint one per start and
# the front door injects it as a Bearer header on every proxied /api request (browser never sees it).
export LOCAL_API_TOKEN="${LOCAL_API_TOKEN:-$(node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))")}"
LOCAL_API_MODE=docker LOCAL_API_PORT="$SIDECAR_PORT" LOCAL_API_RESOURCE_DIR="$PWD" LOCAL_API_DATA_DIR="$PWD" \
  node src-tauri/sidecar/local-api-server.mjs &
PIDS+=($!)
for _ in $(seq 1 40); do curl -fsS -m 1 -H "Authorization: Bearer $LOCAL_API_TOKEN" "http://127.0.0.1:${SIDECAR_PORT}/api/health" >/dev/null 2>&1 && break; sleep 0.5; done

# 3. seed loop
if [ -n "${UPSTASH_REDIS_REST_URL:-}" ] && [ "${WM_NO_SEED_LOOP:-}" != "1" ]; then
  bash scripts/tt-seed-loop.sh &
  PIDS+=($!)
fi

# 4. front door (foreground)
log "hub → http://127.0.0.1:${HUB_PORT}/dashboard  (API :${SIDECAR_PORT}, Claude ${MODEL} via :${PROXY_PORT})"
HUB_PORT="$HUB_PORT" SIDECAR_PORT="$SIDECAR_PORT" node scripts/tt-hub-server.mjs
