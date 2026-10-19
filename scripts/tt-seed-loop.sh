#!/usr/bin/env bash
# Keeps the local Upstash Redis seeded for the hub dashboard. Upstream runs these
# seeds on Railway cron; locally nothing re-runs them, and the market keys expire
# after 30 minutes (CACHE_TTL=1800 in seed-commodity-quotes / seed-market-quotes),
# which left the Markets / Energy panels empty half an hour after a manual seed.
#
#   bash scripts/tt-seed-loop.sh          # loop: market + weather/quakes/crypto every 25 min, keyless bundles + EIA/fuel/economy daily
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
  if env "$@" timeout 600 node "scripts/$name.mjs" >/dev/null 2>"$STAMP_DIR/$name.err"; then
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
  # Keyless fast-moving sources every pass (the hub's own API serves these from Redis):
  for s in seed-weather-alerts seed-earthquakes seed-crypto-quotes seed-fear-greed; do run_seed "$s"; done
  # GDELT throttles this network hard; one topic per pass (rotating) keeps us under its 1 req / 5 s policy.
  run_seed seed-gdelt-intel GDELT_TOPICS_PER_RUN=1 GDELT_SOFT_BUDGET_MS=200000
  # AI Insights (Main tab "AI Insights" panel, bootstrap key `insights`): the client treats data older
  # than 60 min as stale, so refresh every pass (one Claude call via the generic provider = LLM_API_URL;
  # the seed warms the news digest through the local front door when Redis lacks it).
  # Keyless Polymarket seed: feeds the Predictions panel and keeps the analyst context out of "degraded"
  # (it counts prediction:markets-bootstrap:v1 among its core sources; the key otherwise expires).
  run_seed seed-prediction-markets
  if [ -n "${LLM_API_URL:-}" ]; then run_seed seed-insights WM_API_BASE_URL="http://127.0.0.1:${HUB_PORT:-3100}"; fi
  # Keep the regional digests warm (15-min Redis TTL): the WM Analyst reads them as "Regional
  # Headlines" on the T&T / Guyana tabs, and no client on the full variant requests them.
  for v in tt gy; do
    curl -s -m 90 -o /dev/null -w "[seed-loop $(date +%H:%M:%S)] digest $v %{http_code}\n" \
      "http://127.0.0.1:${HUB_PORT:-3100}/api/news/v1/list-feed-digest?variant=$v&lang=en" || true
  done
  if [ ! -f "$STAMP_DIR/daily-$today" ]; then
    touch "$STAMP_DIR/daily-$today"
    if [ -n "${EIA_API_KEY:-}" ]; then
      run_seed seed-eia-petroleum
      run_seed seed-fuel-prices
    fi
    if [ -n "${FRED_API_KEY:-}" ] && [ -n "${EIA_API_KEY:-}" ]; then
      run_seed seed-economy
    fi
    # AI Forecasts on the hub's own LLM (Claude via the shim): the seed accepts a provider order, so
    # point every stage at the generic provider the runner already configured.
    if [ -n "${LLM_API_URL:-}" ]; then
      run_seed seed-forecasts FORECAST_LLM_PROVIDER_ORDER=generic FORECAST_LLM_COMBINED_PROVIDER_ORDER=generic \
        FORECAST_LLM_CRITICAL_PROVIDER_ORDER=generic FORECAST_LLM_IMPACT_PROVIDER_ORDER=generic \
        FORECAST_LLM_MARKET_IMPLICATIONS_PROVIDER_ORDER=generic
    fi
    # Keyless slow-moving sources once a day (all public/official; aggregate data only):
    for s in seed-fx-rates seed-disease-outbreaks seed-displacement-summary seed-energy-disruptions \
             seed-fuel-shortages seed-market-breadth seed-climate-anomalies seed-cross-source-signals; do run_seed "$s"; done
  fi
  # Weekly sweep of EVERY keyless seed script (upstream runs these on Railway cron). This is what
  # fills the global Main-tab panels — CII, Strategic Risk, Threat Timeline, climate, cyber, trade,
  # IMF/ECB/Eurostat macro — on a self-hosted Redis. ~70 scripts, 5-minute cap each.
  local week; week="$(date +%G-W%V)"
  if [ ! -f "$STAMP_DIR/sweep-$week" ]; then
    touch "$STAMP_DIR/sweep-$week"
    log "weekly keyless sweep ($week) starting"
    for f in scripts/seed-*.mjs; do
      local name; name="$(basename "$f" .mjs)"
      case "$name" in seed-commodity-quotes|seed-market-quotes|seed-forecasts|seed-forecast-resolutions) continue;; esac
      # ERE on purpose: launchd runs /usr/bin/grep (BSD), which has no \| alternation.
      if /usr/bin/grep -oE 'process\.env\.[A-Z_0-9]+' "$f" | sort -u \
         | /usr/bin/grep -qvE 'UPSTASH|REDIS|NODE_ENV|CI$|DEBUG|SEED_|DRY_RUN|VERBOSE|LOG|PROXY_URL|RAILWAY|VERCEL|TZ$|TIMEOUT|LIMIT|CONCURRENCY|FORCE|SKIP|USER_AGENT|ALPHA_VANTAGE'; then
        continue   # needs a credential we may not have; the daily/pass lists cover the keyed ones explicitly
      fi
      run_seed "$name" ALPHA_VANTAGE_API_KEY=
    done
    log "weekly keyless sweep done"
  fi
}

if [ "${1:-}" = "--once" ]; then pass; exit 0; fi
log "loop started: market seeds every ${INTERVAL}s, daily EIA/fuel/economy; stamps in $STAMP_DIR"
while true; do
  pass
  sleep "$INTERVAL"
done
