# Trinidad & Tobago Hub: How It Works

## Architecture Overview

The T&T hub is built from World Monitor's three-runtime architecture, composed into a macOS launchd service that runs the full dashboard locally with Claude briefs, offline news feeds, and live TV.

### Three Runtimes

1. **SPA (`src/`):** TypeScript browser application (Vite build, class-based components, no framework)
   - 100+ panels extending the `Panel` base class
   - Two map engines: DeckGLMap (deck.gl + maplibre) and GlobeMap (globe.gl)
   - Web Workers for news clustering (hls.js HLS playback, ONNX ML inference)
   - Central mutable `AppContext` holds map refs, panel instances, caches
   - Dependency boundaries enforced: types → config → services → components → app → App.ts

2. **API edge functions (`api/`):** Vercel Edge Functions (self-contained, no node built-ins in hand-written files)
   - Domain gateways: `api/<domain>/v1/[rpc].ts` (thin entries for each service)
   - Bundled at build time: `createDomainGateway` bundles `server/` code into edge handlers
   - On the GA hub: bundles are compiled to `.js` files executed by the local sidecar
   - No imports from `../src/` or `../server/` in hand-written files (enforced by tests)

3. **Server handlers (`server/`):** Business logic bundled into API functions
   - Domain handlers: `server/worldmonitor/<domain>/v1/handler.ts` mirror proto services
   - All handlers use `cachedFetchJson()` from `server/_shared/redis.ts` (Redis caching with stampede protection)
   - Cache keys must include every request-varying parameter
   - Proto-first: `proto/` definitions → `make generate` → `src/generated/{client,server}/`

### GA Stack (macOS Launchd Service)

The hub runs four processes:

```
User (http://127.0.0.1:3100)
         ↓
Front door (scripts/tt-hub-server.mjs, :3100, pure node:http)
    - Serves dist/ (SPA)
    - Proxies /api/* to sidecar with LOCAL_API_TOKEN
    - Serves itself: /api/youtube/live (cloud-only route), /api/iptv-proxy (allowlisted HLS proxy),
      /api/tego/stream + /api/tego/channels (TegoTV resolver, scripts/tt-tego-resolver.mjs),
      /api/chat-analyst (WM Analyst chat from the esbuild bundle dist/hub/chat-analyst.js), /healthz
    - Injects WM_LOCAL_OPERATOR_KEY for Pro routes
         ↓
Sidecar (src-tauri/sidecar/local-api-server.mjs, :46123, docker mode)
    - Executes api/ handlers locally (no cloud fallback)
    - SSRF guard allows OLLAMA_API_URL / LLM_API_URL
    - Auth: Bearer LOCAL_API_TOKEN (minted per start)
    - Browser session: /api/wm-session returns signed token (WM_SESSION_SECRET)
         ↓
        ├─ Redis (Upstash, worldmonitor-tt, us-east-1)
        │   Seeds: markets (Alpha Vantage, Yahoo), energy (EIA), weather, quakes, crypto, GDELT
        ├─ Claude shim (scripts/tt-claude-proxy.py, :8788)
        │   Translates OpenAI → Bedrock Converse API
        │   Model: us.anthropic.claude-sonnet-5 (default)
        └─ Seed loop (scripts/tt-seed-loop.sh)
            Every 25 min: markets (expires 30 min)
            Once daily: EIA / fuel / economy / keyless bundles
```

All processes run together under `scripts/tt-hub-serve.sh`; launchd runs the script.

---

## How the Dashboard Works

### Variant System

One codebase, six sites selected by `VITE_VARIANT` at build time or hostname at runtime:

- `tt` (Trinidad & Tobago, default map view: Trinidad z8.2, live channels: local + teleSUR + Sky + AJE)
- `gy` (Guyana, default: Guyana map, NCN/HGPTV/MTV)

- `chips` (AI compute / semiconductors, global map, Bloomberg/CNBC/NASA)
- `full` (World Monitor hub: global map, world + Caribbean IPTV channels, seeds tt/gy/chips as preset tabs)

Variant detection:

- Build time: `VITE_VARIANT=tt npm run build:tt`
- Runtime (browser): hostname (tt.worldmonitor.app) or `localStorage['worldmonitor-variant']` (dev override)

### Tab & Preset System

**Dashboard tabs** are user-created workspaces. Each tab holds:

- Panel layout (which panels, position/size)
- Active news feed filters

- Saved view state (map center/zoom)

**Preset tabs** are extra read-only tabs seeded by variants. When you click a preset tab:

1. Map re-centres on that region (mapView: `trinidad`, `guyana`, `global`, etc.)
2. Map header updates (e.g., "Trinidad & Tobago / Southern Caribbean")

3. Live News channel strip re-orders (variant's broadcasters first)
4. Panel set switches (only that variant's default panels enabled)

**Example:** On the `full` variant hub (http://localhost:3100), you have:

- Main (global, world + Caribbean IPTV channels, all panels)
- Trinidad & Tobago (preset, T&T region, 8 T&T panels, T&T broadcasters first)

- Guyana (preset, Guyana region, 8 Guyana panels, Guyana broadcasters first)
- Chips & AI (preset, global region, AI/semiconductor panels)

Clicking Trinidad & Tobago fires `LiveNewsPanel.applyChannelPreset({ mapView: 'trinidad', mapTitle: 'Trinidad & Tobago / Southern Caribbean', liveChannelIds: [...] })`.

### Feed Resolution

News feeds are resolved through `CANONICAL_FEEDS` (same set across all variants). Each variant's `VARIANT_FEEDS` (server digest) is a subset of categories:

- `TT_FEEDS`: tt-news, tt-gov, tt-energy, tt-education, tt-telecoms, tt-public-it, tt-safety, tt-weather, caribbean
- `GY_FEEDS`: gy-news, gy-gov, gy-oil-gas, gy-essequibo, gy-economy, gy-safety, gy-weather, caribbean

- `CHIPS_FEEDS`: chips-gtc (GTC Berlin & NVIDIA events, added 2026-10-23; also on the T&T tab), chips-semis, chips-datacenters, chips-ailabs, chips-policy, chips-markets

The digest endpoint `/api/news/v1/list-feed-digest?variant=tt` loads `VARIANT_FEEDS.tt`, but a preset tab in the `full` variant still resolves Guyana feeds through `CANONICAL_FEEDS`, so the hub's Guyana tab shows up-to-date Guyana news.

---

## Live TV: Decision Tree

```
Channel has live stream?
├─ tegoChannel (TTT, IETV, Synergy, Gayelle, TV Jaagriti, Trinity, Bhakti, IBN, Plus TV, WACK, ABS Antigua)
│         → resolve via /api/tego/stream?channel=N (src/services/tego-live.ts, cached until the
│           24 h token nears expiry, force re-resolve after a playback failure) → play with hls.js
├─ YES (hlsUrl) → Play HLS stream (hls.js on Chrome/Firefox, native on Safari)
│         Show channel name in the UI, no badge
└─ NO
    ├─ Channel is 24/7 (Bizz TV, Sky, AJE, teleSUR)? → OFF-AIR CARD
    │   (This shouldn't happen; 24/7 channels are always live.)
    └─ Channel is newscast-only (CNC3, TV6, Parliament)?
        ├─ Has latest upload? → REPLAY BADGE, play latest
        │   (TTT publishes daily videos; user knows it's old)
        └─ No recent upload → OFF-AIR CARD
            Buttons: Next live channel | Play latest bulletin | Retry
```

**How it works:**

1. Live resolver checks YouTube channel's live stream first (`youtube.com/@handle/live`)
2. If no live stream, checks `latestVideoId` from `/api/youtube/live` endpoint

3. Panel shows off-air card if neither exists
4. On the GA hub, `/api/youtube/live` runs in the front door (cloud-only route)

**HLS playback (Chrome):**

- Chrome 155: `canPlayType('application/vnd.apple.mpegurl')` returns `'maybe'`, not `'probably'`
- Native decoder never fires on `'maybe'` → use hls.js (FetchLoader)

- hls.js: `referrerPolicy: 'no-referrer'` to unblock CDN77 / Referer-checking hosts
- Safari / WKWebView: native HLS (supports `'maybe'` as "I don't know yet")

**Verified channels (2026-10-18):**

- Always on: Bizz TV, CBC TV8, Sankhya TV, ZIZ TV, etc. (HLS, 24/7)
- Live via TegoTV (the broadcasters' own public guest player, resolved by the front door): TTT, IETV,
  Synergy TV, Gayelle, TV Jaagriti, Bhakti TV, IBN, Plus TV, ABS Antigua (10/12 of the catalogue; Trinity TV
  and WACK Visual Radio were 404 upstream on the evening run; Universal Church and Real TV 404 always)
- Newscast-only, YouTube with off-air card and a link to the station's official live page: CNC3 (Cloudflare
  JS challenge on its site), TV6 (Dailymotion embed restricted to tv6tnt.com), Parliament (ParlView)
- `node scripts/validate-live-channels.mjs --hls-only` resolves `tego:<id>` entries through the resolver
  before probing; 2026-10-18 17:30: 51/68 reachable (failures: upstream non-Caribbean channels, Trinity,
  WACK, CBC TV8 timeout)

---

## IPTV Directory Pipeline

**Source:** iptv-org public index (github.com/iptv-org/iptv): channels.json, streams.json, feeds.json (broadcast areas), logos.json. 2,126 Caribbean / Guiana Shield + worldwide news streams probed on 2026-10-18.

**Refresh:**

```bash
npm run iptv:sync
# → scripts/iptv-sync.mjs
#   Scope: channel country in the Caribbean list, OR a feed whose broadcast_area
#          names one of those countries (diaspora stations in iptv-org's gy.m3u etc.),
#          OR category "news" anywhere
#   Probe each stream: manifest 200 + #EXTM3U; no CORS header → needsProxy
#   Skip streams needing Referer / User-Agent spoofing
#   → public/data/iptv-directory.json (1,038 verified entries, 2026-10-18)
```

**Probe criteria:**

- HTTP GET of the stream URL with a browser User-Agent and an Origin header
- 200 status and `#EXTM3U` in the first 4 KB of the body
- `Access-Control-Allow-Origin` present → plays directly; absent → kept with `needsProxy: true` (plays through the front door's `/api/iptv-proxy`, whose allowlist is derived from this file)
- Timeout: 12 s per stream, 16 in flight by default (`--concurrency`)

**Directory structure in public/data/iptv-directory.json:**

```json
{
  "channels": [
    {
      "id": "iptv-littleguyanatv-us",
      "iptvId": "LittleGuyanaTV.us",
      "name": "Little Guyana TV",
      "country": "US",
      "countryName": "United States",
      "broadcastTo": [{ "code": "GY", "name": "Guyana" }],
      "categories": ["General"],
      "logo": "https://i.imgur.com/b475xOT.jpg",
      "hlsUrl": "https://video1.getstreamhosting.com:1936/8122/8122/playlist.m3u8",
      "quality": "1080p",
      "cors": "*"
    },
    ...   // optional flags: notNonStop, geoBlocked (iptv-org labels, advisory), needsProxy
  ]
}
```

**UI:** Live News panel → **Manage channels** → **IPTV directory** → filter by country or search → add any entry to the strip (stored like custom channels, persisted in localStorage). The country filter matches the home country *and* `broadcastTo`, so Little Guyana TV and GTN Canada list under Guyana with the meta line "United States → Guyana".

**Maintenance:** Re-run sync occasionally (streams come and go).

---

## Architecture: Configuration & Secrets

### Where Secrets Live

| Secret | File | Scope | Refresh |
|--------|------|-------|---------|
| Data-source keys | `~/.config/worldmonitor/keys.env` | Process env | Manual |
| Redis URL/token | `~/.config/worldmonitor/keys.env` | Process env | Manual |
| Browser session | `~/.config/worldmonitor/local-secrets.env` | File-based | Per start (/api/wm-session) |
| LLM API URL | `LLM_API_URL` env var | Process env | Script (dev:hub:claude) |
| Claude model | `LLM_MODEL` env var | Process env | Script (BEDROCK_MODEL) |
| Local API token | `LOCAL_API_TOKEN` env var | Process env | Minted per hub start |
| Operator key | `WM_LOCAL_OPERATOR_KEY` env var | Process env | Manual or per hub start |
| AWS profile | `AWS_PROFILE=bedrock` env var | Process env | Script (aws configure) |
| Keychain items | macOS Keychain | System | Manual (web UI or `security` CLI) |

**Never in repo:**

- `.env*` files (load from `~/.config/` instead)
- API keys, tokens, credentials

- Secrets in build artifacts

**Keychain items (examples):**

- `acleddata.com (World Monitor)` → ACLED password for OAuth token generation
- `fred.stlouisfed.org (World Monitor)` → FRED sign-in password

### Variant Configuration Files

| File | Variant | What |
|------|---------|------|
| `src/config/variants/tt.ts` | tt | Timezone, country code, region bbox |
| `src/config/variant.ts` | all | Registry, detection logic |
| `src/config/panels.ts` | all | TT_PANELS, TT_MAP_LAYERS, categories |
| `src/config/feeds.ts` | tt | TT_FEEDS (10 categories) |
| `src/config/live-channel-defaults.ts` | tt | VARIANT_LIVE_CHANNEL_IDS per variant |
| `src/config/dashboard-tabs.ts` | all | Preset tabs (what feeds, map views, channels each tab enables) |
| `src/components/LiveNewsPanel.ts` | all | OPTIONAL_LIVE_CHANNELS (registry of all known channels) |
| `server/worldmonitor/news/v1/_feeds.ts` | tt | VARIANT_FEEDS.tt (server digest categories) |

### RSS Proxy Allowlists

RSS feeds must pass three allowlists before being fetched:

1. **`shared/rss-allowed-domains.json`** (main allowlist, shared)

2. **`api/_rss-allowed-domains.js`** (edge function allowlist, same list)
3. **`vite.config.ts`** (dev server RSS_PROXY_ALLOWED_DOMAINS)

Add a new feed host to all three.

---

## Operational Commands

### Build & Deploy

```bash
npm run build:full                          # SPA → dist/
node scripts/build-sidecar-handlers.mjs     # API handlers → api/**/v1/[rpc].js (gitignored)
bash scripts/tt-install-service.sh install  # Install launchd agent (starts at login)
```

### Service Management

```bash
bash scripts/tt-install-service.sh status       # Check if running
bash scripts/tt-install-service.sh restart      # Restart the service
bash scripts/tt-install-service.sh uninstall    # Remove launchd agent
tail -f ~/Library/Logs/worldmonitor-hub/hub.log # Tail logs
```

### Development

```bash
npm run dev:tt                      # T&T variant on :3100 (Ollama or keyless)
npm run dev:hub                     # Global hub + tabs (Ollama)
npm run dev:hub:claude              # Global hub + Claude Bedrock shim
BEDROCK_MODEL=opus npm run dev:hub:claude  # Use Claude Opus instead of Sonnet
npm run dev:tt:ollama               # T&T with explicit Ollama
```

### Seed & Cache Management

```bash
# Manual seed (fill Redis before running the hub)
set -a; . ~/.config/worldmonitor/keys.env; set +a
node scripts/seed-market-quotes.mjs
node scripts/seed-commodity-quotes.mjs
node scripts/seed-eia-petroleum.mjs
node scripts/seed-fuel-prices.mjs

# Seed loop (automatic, every 25 min + daily)
bash scripts/tt-seed-loop.sh          # loop in foreground
bash scripts/tt-seed-loop.sh --once   # single pass
```

### Feeds & Content

```bash
./node_modules/.bin/tsx scripts/tt-daily-digest.mts          # Generate daily digest
npm run iptv:sync                                             # Refresh IPTV directory (~1,000 channels)
node scripts/validate-live-channels.mjs                       # Probe all HLS + YouTube channels
```

### Testing

```bash
npm run typecheck                    # Frontend + API type check
npm run test:data                    # Unit/integration tests
npm run test:e2e                     # Playwright suites
npm run lint                         # Biome over src/server/api/tests/e2e/scripts
```

### Logs & Debugging

```bash
# GA service logs
tail -f ~/Library/Logs/worldmonitor-hub/hub.log

# Dev server console output (npm run dev:hub)
# Shows: LLM shim requests, Redis seeds, bootstrap payload sizes

# Browser DevTools
# F12 → Network: filter /api/*, console for errors
# Local Storage: worldmonitor-variant, worldmonitor-session
```

---

## Ports

| Port | Service | Used by |
|------|---------|---------|
| 3100 | Front door (GA hub or dev server) | Browser (http://127.0.0.1:3100) |
| 3101 | `npm run dev:gy` (optional) | Browser for standalone Guyana variant |
| 3102 | `npm run dev:chips` (optional) | Browser for standalone Chips & AI variant |
| 8788 | Claude shim (Bedrock proxy) | Front door / sidecar |
| 46123 | Local API server (sidecar, docker mode) | Front door proxy |
| 3000 | Docker (Grafana / monitoring stack) | Disabled on this machine (3100 used instead) |

---

## Key Design Decisions

### Why No Docker in the GA Hub

- Eliminates docker-compose + nginx complexity on a single-user macOS machine

- Pure node:http for front door is fast enough (static assets + proxy)
- Sidecar runs natively (no container overhead)

- launchd is native macOS service manager (logs in ~/Library/Logs)

### Why Redis (Upstash) for Seeds

- Stateless: hub restart doesn't lose seed data (TTL-managed)

- No database setup: Upstash is managed Redis (free tier)
- Shared with development (dev server also uses Upstash)

- Stampede protection: `cachedFetchJson()` prevents thundering herd on cache miss

### Why Bedrock (not OpenAI/Groq)

- Anton has AWS access + Bedrock quota

- Bedrock Claude 5 models have better reasoning (SWE-Bench 45.89% Pro)
- Shim is tiny (stdlib + boto3), no external dependencies

- Streaming included (boto3 Converse API supports event streams)

### Why Preset Tabs (not Multiple Variants)

- One dashboard, three monitors: avoids tab fatigue

- Feeds resolve centrally: news is always current across tabs
- Map region switches instantly: no tab reload

- Single Live News panel: persistent state, no duplication

### Why HLS over YouTube Native

- YouTube live detection fails when off-air (no fallback)

- HLS gives precise stream control (hls.js codec selection, Referer handling)
- Supports replay badge (knows when playing an old upload)

- Broadcasters with HLS feeds (50+) play immediately
