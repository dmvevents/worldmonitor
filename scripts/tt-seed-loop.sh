#!/usr/bin/env bash
# Keeps the local Upstash Redis seeded for the hub dashboard. Upstream runs these
# seeds on Railway cron; locally nothing re-runs them, and the market keys expire
# after 30 minutes (CACHE_TTL=1800 in seed-commodity-quotes / seed-market-quotes),
# which left the Markets / Energy panels empty half an hour after a manual seed.
#
#   bash scripts/tt-seed-loop.sh          # loop: market seeds every 25 min, EIA + fuel once a day
#   bash scripts/tt-seed-loop.sh --once   # single pass
#
# Alpha Vantage's free tier allows 25 requests/day, so only the first market pass
# of each calendar day carries ALPHA_VANTAGE_API_KEY; later passes use the keyless
# Yahoo path the seeds already fall back to.
set -uo pipefail
cd "$(dirname "$0")/.."

KEYS_FILE="${WM_KEYS_FILE:-$HOME/.config/worldmonitor/keys.env}"
if [ -f "$KEYS_FILE" ]; then set -a; . "$KEYS_FILE"; set +a; fi
if [ -z "${UPSTASH_REDIS_REST_URL:-}" ] || [ -z "${UPSTASH_REDIS_REST_TOKEN:-}" ]; then
  echo "[seed-loop] UPSTASH_REDIS_REST_URL/TOKEN not set (expected in $KEYS_FILE); nothing to do" >&2
  exit 0
fi

INTERVAL="${WM_SEED_INTERVAL_SEC:-1500}"
STAMP_DIR="${WM_SEED_STAMP_DIR:-${TMPDIR:-/tmp}/wm-seed-stamps}"
mkdir -p "$STAMP_DIR"
log() { echo "[seed-loop $(date '+%H:%M:%S')] $*" >&2; }

run_seed() { # name [ENV=VALUE ...]
  local name="$1"; shift
  if env "$@" node "scripts/$name.mjs" >/dev/null 2>"$STAMP_DIR/$name.err"; then
    log "$name ok"
  else
    log "$name FAILED: $(tail -1 "$STAMP_DIR/$name.err" | cut -c1-160)"
  fi
}

pass() {
  local today; today="$(date +%F)"
  local av_override=()
  if [ -f "$STAMP_DIR/av-$today" ]; then
    av_override=("ALPHA_VANTAGE_API_KEY=")          # keyless passes for the rest of the day
  else
    touch "$STAMP_DIR/av-$today"
  fi
  run_seed seed-commodity-quotes ${av_override[@]+"${av_override[@]}"}
  run_seed seed-market-quotes ${av_override[@]+"${av_override[@]}"}
  if [ ! -f "$STAMP_DIR/daily-$today" ]; then
    touch "$STAMP_DIR/daily-$today"
    if [ -n "${EIA_API_KEY:-}" ]; then
      run_seed seed-eia-petroleum
      run_seed seed-fuel-prices
    fi
    if [ -n "${FRED_API_KEY:-}" ] && [ -n "${EIA_API_KEY:-}" ]; then
      run_seed seed-economy
    fi
  fi
}

if [ "${1:-}" = "--once" ]; then pass; exit 0; fi
log "loop started: market seeds every ${INTERVAL}s, daily EIA/fuel/economy; stamps in $STAMP_DIR"
while true; do
  pass
  sleep "$INTERVAL"
done
