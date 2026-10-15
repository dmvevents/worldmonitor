#!/usr/bin/env bash
# Hub dashboard (full variant on :3100 with T&T / Guyana / Chips tabs) with
# Claude on Amazon Bedrock as the LLM, via the local OpenAI-compatible shim in
# scripts/tt-claude-proxy.py. (`npm run dev:hub` is the Ollama-only equivalent.)
#
#   npm run dev:hub:claude
#   BEDROCK_MODEL=us.anthropic.claude-opus-5-5 npm run dev:hub:claude
set -euo pipefail

cd "$(dirname "$0")/.."

# Optional data-source keys (Upstash, Finnhub, Alpha Vantage, EIA, FRED, ACLED...)
# live outside the repo so no .env* file is needed: KEY=value lines, one per line.
KEYS_FILE="${WM_KEYS_FILE:-$HOME/.config/worldmonitor/keys.env}"
if [ -f "$KEYS_FILE" ]; then
  set -a; . "$KEYS_FILE"; set +a
  echo "[dev:hub:claude] loaded data-source keys from $KEYS_FILE"
fi

PROXY_PORT="${CLAUDE_PROXY_PORT:-8788}"
PYTHON="${PYTHON:-/opt/homebrew/bin/python3}"
MODEL="${BEDROCK_MODEL:-us.anthropic.claude-sonnet-5}"
PROXY_PID=""

if curl -fsS -m 2 "http://127.0.0.1:${PROXY_PORT}/health" >/dev/null 2>&1; then
  echo "[dev:hub:claude] reusing Claude proxy already listening on :${PROXY_PORT}"
else
  if ! "$PYTHON" -c 'import boto3' 2>/dev/null; then
    echo "[dev:hub:claude] $PYTHON lacks boto3; set PYTHON to an interpreter that has it" >&2
    exit 1
  fi
  PORT="$PROXY_PORT" BEDROCK_MODEL="$MODEL" "$PYTHON" scripts/tt-claude-proxy.py &
  PROXY_PID=$!
  trap '[ -n "$PROXY_PID" ] && kill "$PROXY_PID" 2>/dev/null || true' EXIT INT TERM
  for _ in $(seq 1 20); do
    curl -fsS -m 1 "http://127.0.0.1:${PROXY_PORT}/health" >/dev/null 2>&1 && break
    sleep 0.25
  done
fi

export VITE_VARIANT=full
export DEV_PORT="${DEV_PORT:-3100}"
export LLM_API_URL="http://127.0.0.1:${PROXY_PORT}/v1/chat/completions"
export LLM_API_KEY="${LLM_API_KEY:-local-bedrock}"   # the shim ignores it; llm.ts needs a non-empty value
export LLM_MODEL="$MODEL"
export LLM_TOOL_PROVIDER=generic
export LLM_REASONING_PROVIDER=generic
# llm.ts tries providers in the fixed order ollama -> openrouter -> groq -> generic,
# so Ollama must stay UNSET here or every brief would go to the local 8B model
# first (and time out) instead of Claude. Use `npm run dev:hub` for the Ollama setup.
unset OLLAMA_API_URL OLLAMA_MODEL

echo "[dev:hub:claude] LLM = ${MODEL} via ${LLM_API_URL}"
./node_modules/.bin/vite
