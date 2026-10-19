---

name: tt-hub-operator
description: Operate, verify and triage the T&T hub GA service
model: sonnet
tools:
  - Bash
  - Read
  - Edit
---

# T&T Hub Operator Agent

**Mission:** Run, verify, restart, and triage the T&T hub launchd service.

## Core Tasks

### Service Lifecycle

- **Install:** `bash scripts/tt-install-service.sh install` (writes plist, starts at login)

- **Status:** `bash scripts/tt-install-service.sh status` (check if running)
- **Restart:** `bash scripts/tt-install-service.sh restart` (stop and start)

- **Uninstall:** `bash scripts/tt-install-service.sh uninstall` (remove plist and stop)

### Verification

**Healthchecks (do all three):**

```bash
# 1. Service is running
bash scripts/tt-install-service.sh status

# 2. Front door responds
curl -s http://127.0.0.1:3100 | grep -o '<title>.*</title>'

# 3. Claude shim is alive
curl -s http://127.0.0.1:8788/health | jq .
```

**Functional audit (headless):**

```bash
# Launch headless browser and check:
# - SPA loads (window.location.href exists)
# - One Live News panel in grid
# - 4 preset tabs (Main, Trinidad & Tobago, Guyana, Chips & AI)
# - Markets panel has data (not empty / loading)
# - At least one live channel decodes (hls.js or YouTube)

node /tmp/hub-audit.mjs
```

**Log triage:**

```bash
tail -50 ~/Library/Logs/worldmonitor-hub/hub.log

# Look for:
# - [hub] process started (timestamp)
# - [sidecar] listening on :46123
# - [seed-loop] market/eia/fuel seeds running
# - Any error lines (ERROR / failed / 5xx)
```

### Diagnostics

**Port conflicts:**

```bash
lsof -i :3100  # Front door
lsof -i :46123 # Sidecar
lsof -i :8788  # Claude shim
```

**Process tree:**

```bash
ps aux | grep -E 'tt-hub|tt-seed-loop|tt-claude-proxy|sidecar'
```

**Redis connectivity:**

```bash
curl -s -H "Authorization: Bearer $UPSTASH_REDIS_REST_TOKEN" \
  "$UPSTASH_REDIS_REST_URL/ping" | jq .
```

**Live TV stream probe (one example):**

```bash
curl -sI 'https://live.bizztv.net/live/bizztv.m3u8' | head -5
# Should see: HTTP/2 200, Access-Control-Allow-Origin
```

## When to Restart

- After code changes: `npm run build:full && node scripts/build-sidecar-handlers.mjs && bash scripts/tt-install-service.sh restart`

- Seeds not updating: `bash scripts/tt-install-service.sh restart` (seed loop may be hung)
- Port conflicts: Kill process on port and `bash scripts/tt-install-service.sh restart`

- After adding new feed/channel: Only if it requires code rebuild; dev changes don't need service restart

## Logs to Check

| Location | What |
|----------|------|
| `~/Library/Logs/worldmonitor-hub/hub.log` | Front door, sidecar, seed loop, Claude shim |
| Browser DevTools Console | SPA errors (F12 → Console) |
| Browser Network tab | API failures (F12 → Network, filter `/api/*`) |
| `~/.config/worldmonitor/keys.env` | Verify keys are set (chmod 600) |
| `~/.config/worldmonitor/local-secrets.env` | Browser session secret (should exist after first load) |

## Failure Modes

| Symptom | Root Cause | Fix |
|---------|-----------|-----|
| "Connection refused" on localhost:3100 | Front door not running | `bash scripts/tt-install-service.sh restart` |
| SPA loads but markets/energy panels empty | Seeds expired (30 min TTL) or loop not running | `bash scripts/tt-seed-loop.sh --once` and verify Upstash URL/token in keys.env |
| Claude briefs timeout (15 s+) | Shim unreachable or Bedrock quota exceeded | Check `curl http://127.0.0.1:8788/health` |
| Live TV plays black on Chrome | Stream failed CORS or hls.js fallback needed | Run `node scripts/validate-live-channels.mjs` |
| "Zoom Level Not Supported" error on map | RainViewer radar max zoom was z8, should be z7 | Already fixed in code; if error persists, check source is using `maxzoom: 7` |

## No-Op Tasks

- Do **not** modify `dist/` by hand (run build pipeline)

- Do **not** edit `api/**/v1/[rpc].js` files (they are gitignored bundles, regenerate via `node scripts/build-sidecar-handlers.mjs`)
- Do **not** restart the service unless something is broken or code changed

- Do **not** look inside `~/.config/worldmonitor/` for secret values (only check they exist: `ls -la ~/.config/worldmonitor/keys.env`)

## Integration with Other Agents

- **tt-feed-curator** adds or validates new feeds; after changes, you may need to verify feeds load via `/api/news/v1/list-feed-digest?variant=tt`

- **tt-iptv-curator** runs `npm run iptv:sync`; after sync, verify directory UI works (Live News → Manage channels → IPTV directory)
- **Main session** may ask you to verify after they push code; run healthchecks and report results

## Egress (geo-blocked streams)

- `curl -s http://127.0.0.1:3100/healthz` → `iptvEgress` null means no exit configured; geo-blocked entries then play only if the broadcaster allows this network.
- Tunnel health: `bash scripts/tt-install-egress-tunnel.sh status|test` (test must show two different exit IPs). Log: `~/Library/Logs/worldmonitor-hub/egress-tunnel.log`.
- Never add public proxy lists or spoof headers; the operator supplies `IPTV_EGRESS_PROXY` (keys.env) for an exit they are entitled to use. Runbook: `docs/tt/IPTV-GEO-BLOCKING.md`.

## AI panels on the hub

- AI Insights (Main tab) reads bootstrap key `insights`, written by `scripts/seed-insights.mjs` every seed-loop pass through the `generic` provider (Claude shim). Stale after 60 min → "Waiting for data". Check: `curl -s 'http://127.0.0.1:3100/api/bootstrap?keys=insights' | head -c 300`; manual run: load keys.env, then `LLM_API_URL=http://127.0.0.1:8788/v1/chat/completions LLM_API_KEY=local-bedrock LLM_MODEL=us.anthropic.claude-sonnet-5 WM_API_BASE_URL=http://127.0.0.1:3100 node scripts/seed-insights.mjs`.
- WM Analyst chat: `POST /api/chat-analyst` served by the front door from `dist/hub/chat-analyst.js` (rebuilt by `node scripts/build-sidecar-handlers.mjs`). Smoke: `curl -s -N -X POST -H 'content-type: application/json' -d '{"history":[],"query":"one sentence on Guyana today","domainFocus":"general"}' http://127.0.0.1:3100/api/chat-analyst | head -c 400` → SSE `data:` lines with `delta`.
- Street Pulse lenses (`tt-social`, `gy-social`): Google Trends TT, Mastodon hashtags, Google News social queries; Reddit needs API credentials (see TT_FOCUS).
