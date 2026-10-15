# Trinidad & Tobago focus (`tt` variant)

Local-only site variant that turns World Monitor into a Trinidad & Tobago / southern Caribbean monitor. Branch `tt-focus`; not intended for the upstream koala73 repo.

## Run

```bash
npm run dev:hub:claude  # RECOMMENDED: the global World Monitor dashboard on http://localhost:3100 with Trinidad & Tobago,
                        # Guyana and Chips & AI as tabs next to the default Main tab; AI briefs on Claude (Bedrock), see below
npm run dev:hub         # same hub with the local Ollama model instead of Claude
npm run dev:tt          # T&T-first variant on :3100 (Main = T&T, tabs for Guyana and Chips & AI)
npm run build:tt        # production build of the tt variant
```

On localhost the app honours `localStorage['worldmonitor-variant']` over the build variant; if the wrong dashboard
loads, set it to `full` (hub) or `tt` and reload. Port 3000 is taken by Docker/Grafana on this Mac.

No API keys are needed for the news panels: the Vite dev server runs the sebuf API gateway and the RSS proxy in-process, so the `tt` digest (`/api/news/v1/list-feed-digest?variant=tt`) and every feed load locally without Redis or Docker.

## What the variant changes

| Area | Where |
| --- | --- |
| Feed catalog (client) | `src/config/feeds.ts` → `TT_FEEDS` (9 categories) |
| Feed catalog (server digest) | `server/worldmonitor/news/v1/_feeds.ts` → `VARIANT_FEEDS.tt`; `tt` added to `VALID_VARIANTS` |
| RSS proxy allowlists | `shared/rss-allowed-domains.json`, `api/_rss-allowed-domains.js`, `scripts/shared/…`, `vite.config.ts` |
| Panels / layers | `src/config/panels.ts` → `TT_PANELS`, `TT_MAP_LAYERS`, `TT_MOBILE_MAP_LAYERS`, `PANEL_CATEGORY_MAP.tt*` |
| Layer order | `src/config/map-layer-definitions.ts` → `VARIANT_LAYER_ORDER.tt` |
| Map view | new `trinidad` preset (both islands framed, zoom 8.2) is the tt default via `src/config/map-view.ts`; `caribbean` (zoom 5, Venezuela/Guyana/Lesser Antilles) is one click away in the region selector. Both exist in deck.gl / globe / SVG / URL state / CMD+K (`Map: Trinidad & Tobago`, `Map: Caribbean`) |
| Live TV | `src/components/LiveNewsPanel.ts`: Caribbean channel region (TTT Live Online, CNC3, CNC3 Prime, TV6 News, Parliament of T&T via ParlView, Tobago Channel 5, Tobago Updates, IETV, NCN Guyana, TVJ, CVM TV News, ABS Antigua, CBC Barbados, GBN Grenada, teleSUR English); tt default set = local broadcasters + teleSUR + Sky + Al Jazeera |
| EBC boundaries | `public/data/tt-ebc-constituencies.geojson` (41 constituencies, boundary-only, from the tt-geopolitical-intelligence API via `scripts/tt-ebc-export.sh`) |
| Map layers (tt) | `ebcConstituencies` (constituency polygons, island-tinted, hover shows EBC configuration year / validation status / provenance) and `hurricanes` (NHC active Atlantic cyclones: forecast cone, track, intensity-sized position; empty when no system is active). Data store: `src/services/tt-geo-layers.ts`; NHC reached through the allowlisted feed proxy because nhc.noaa.gov sends no CORS headers |
| Variant detection & meta | `src/config/variant.ts`, `src/config/variant-meta.ts`, `src/config/variants/tt.ts` (`TT_TIMEZONE`, `TT_COUNTRY_CODE`) |
| Timezone | `America/Port_of_Spain` → `TT` in `src/utils/user-location.ts`; Port of Spain first in the World Clock for tt |
| Daily digest | `scripts/tt-daily-digest.mts` (+ `scripts/tt-daily-digest.launchd.plist.example`) |

## Feed categories (topic lenses)

`tt-news`, `tt-gov`, `tt-energy`, `tt-education` (incl. student laptop programme), `tt-telecoms` (TSTT, Digicel, TATT), `tt-public-it` (procurement, iGovTT, digital transformation), `tt-safety` (aggregate public-safety news only), `tt-weather` (NHC Atlantic, Met Office, T&TEC/WASA outages), `caribbean` (Venezuela, Guyana, CARICOM).

Direct RSS (verified 2026-10-14): Trinidad Express and TV6 (BLOX search RSS), TTT, Power 102, Tobago Updates, Parliament, Tobago House of Assembly, Ministry of Education, TATT, EBC, Central Bank, Ministry of Energy, NGC, iGovTT, NHC Atlantic, CARICOM Today, Barbados Today, Caribbean News Global, Jamaica Observer, Guyana Chronicle, Guyana Times, Demerara Waves, WIC News, Searchlight and iWitness News (SVG), NOW Grenada, St Lucia Times, Dominica News Online, Antigua Observer.

No usable RSS (blocked, 404, or empty) → Google News `site:` queries instead: Guardian TT, CNC3, Newsday, TTPS, Office of the Prime Minister, Met Office, OPR, Energy Chamber, Stabroek/Kaieteur. Also no feed: i95.5FM, Tobago Today, Wired868 (403), CMC, Nation News (403), ODPM, CSO.

Live TV first. The strip opens on a channel that is live around the clock (an HLS feed such as Bizz TV, or a 24/7 YouTube stream). TTT, CNC3, TV6, Parliament and Tobago Updates are YouTube-only and stream just during newscasts and sittings; they carry a ◷ marker in the strip, and when one is off air the panel shows an off-air card with *Next live channel*, *Play latest bulletin (replay)* and *Retry* instead of silently playing a recording. A replay is badged REPLAY on its tab. Verified 2026-10-15 (curl, iptv-org index and the broadcasters' own sites): none of TTT, CNC3 (Cloudflare-gated), TV6 (Dailymotion embed locked to tv6tnt.com), IETV (RTMP ingest only), ParlView (per-event archive player) or NCN Guyana publish a browser-playable live HLS feed, so YouTube remains their only route. teleSUR English, Sky and Al Jazeera are near 24/7. The main T&T news stations (TTT, CNC3, TV6) publish no public HLS URL, so they stay on YouTube; the IPTV channels listed under *Sibling monitors* below are the broadcasters that do. Loop TT's domain no longer resolves and is omitted. A `site:gov.tt` catch-all was tried and removed: Google indexes spam pages on compromised gov.tt subdomains.

Trinidad Express rate-limits bursts (HTTP 429) if the same host fetches its three feeds repeatedly within minutes; the dashboard's per-feed cache keeps this from mattering in normal use.

## Sibling monitors and dashboard tabs

Two more variants ship alongside `tt`, built the same way:

| Variant | Run | What it covers |
| --- | --- | --- |
| `gy` (Guyana) | `npm run dev:gy` → http://localhost:3101 | Guyana news, government and official sources, Stabroek-block oil and gas, Essequibo and regional geopolitics, economy, public safety, weather; Guyana map frame; NCN/HGPTV/MTV Guyana live |
| `chips` (AI compute) | `npm run dev:chips` → http://localhost:3102 | Semiconductors and accelerators, data centres and power, AI labs, chip policy and export controls, chip markets; AI data-centre / cloud-region / tech-HQ layers; semiconductor ticker tape |

You do not need the extra servers to use them: each dashboard seeds the other two as **preset tabs** in the tab bar (Main · Guyana · Chips & AI). A preset tab enables exactly that variant's default panels, re-centres the map on its region (Trinidad & Tobago, Guyana, global for Chips) and puts its broadcasters first in the Live News strip; feeds load through the shared catalog. Deleting a preset tab sticks; the seed runs once per variant. The standalone `dev:gy` / `dev:chips` servers are optional.

Live IPTV: the Live News panel also carries broadcasters' public HLS feeds (CORS-verified 2026-10-15) for Bizz TV, Sankhya TV, Scorch TV, Riddim & Hope TV and The Islamic Network (T&T), ZIZ TV and Nevis Television (St Kitts & Nevis), Caribbean Hot 7 TV (St Lucia), Guardian Talk Radio (Bahamas), Fame 95 FM (Jamaica), HGPTV, MTV Guyana and Little Guyana TV, CBC TV8 Barbados, TVJ and GNN Jamaica, DBS St Lucia, Pointe TV Antigua, ZNS Bahamas, Antena 7 and Noticias 16 (Dominican Republic), Radio y TV Martí and Prensa Latina TV (Cuba), Haiti News Channel and RTH TV1, Telemundo Puerto Rico, and for Venezuela teleSUR (Spanish and English HD), Venevisión Internacional and Canal I. Per-variant default channel sets live in `src/config/live-channel-defaults.ts`. The main T&T news stations publish no HLS; they stay on YouTube with the latest-upload fallback.

## Testing and validation

```bash
node scripts/validate-live-channels.mjs             # probe every HLS channel (manifest + CORS) and every YouTube handle (page + latest upload)
node scripts/validate-live-channels.mjs --hls-only  # skip the YouTube checks
./node_modules/.bin/tsx --test tests/dashboard-tab-presets.test.mts   # preset tabs ↔ panels / map views / live channels / feed catalog
npm run typecheck && npm run test:data              # full gate (the tt/gy/chips variants are covered by the existing variant guard tests)
```

The validator exits 1 when an HLS channel fails; a YouTube station being off air is informational (the panel falls back to its latest upload). Run it before adding or re-ordering channels in `src/components/LiveNewsPanel.ts` or `src/config/live-channel-defaults.ts`.

Browser check for the hub (`npm run dev:hub`, http://localhost:3100/dashboard): clicking Main → Trinidad & Tobago → Guyana → Main must switch the region selector (`global` / `trinidad` / `guyana`), the map header and the Live News channel strip each time, with exactly one Live News panel in the grid. A restored preset tab is applied right after the tab bar initialises (after the map exists), so a reload on a regional tab opens on that region.

## Scope rule

Public news and official sources only, aggregate and topic level. No profiling of private individuals, no voter or phone data, no social-media account scraping of named people. The `tt-safety` lens is public-news aggregate only.

## Daily digest

```bash
./node_modules/.bin/tsx scripts/tt-daily-digest.mts            # → ~/Documents/tt-digest/tt-digest-YYYY-MM-DD.md + latest.md
./node_modules/.bin/tsx scripts/tt-daily-digest.mts --stdout --hours 48 --per-category 15
```

Headlines grouped by lens, timestamps in `America/Port_of_Spain`. If a local Ollama is reachable (`OLLAMA_URL`, `OLLAMA_MODEL`) an executive summary is prepended; otherwise the digest says so and stays unsummarised. No cloud key is used.

## AI briefs on Claude (Amazon Bedrock)

This Mac has Bedrock access (`AWS_PROFILE=bedrock`, us-east-1) with Claude Sonnet 5, Opus 5.5 and Fable 5.1
inference profiles. World Monitor's server only speaks the OpenAI chat-completions format, so
`scripts/tt-claude-proxy.py` (stdlib + boto3) runs a local shim on :8788 that translates to the Bedrock
Converse API, streaming included. `npm run dev:hub:claude` starts the shim, points the `generic` LLM
provider at it (`LLM_API_URL`, `LLM_MODEL`, `LLM_TOOL_PROVIDER` / `LLM_REASONING_PROVIDER=generic`) and
deliberately leaves Ollama unset: `server/_shared/llm.ts` tries providers in the fixed order
ollama → openrouter → groq → generic, so an Ollama URL would send every brief to the local 8B model first.

```bash
npm run dev:hub:claude                                           # Claude Sonnet 5 (default)
BEDROCK_MODEL=us.anthropic.claude-opus-5-5 npm run dev:hub:claude
curl -s http://127.0.0.1:8788/health                             # shim status
LLM_API_URL=http://127.0.0.1:8788/v1/chat/completions LLM_MODEL=us.anthropic.claude-sonnet-5 \
  ./node_modules/.bin/tsx scripts/tt-daily-digest.mts            # digest summary on Claude
```

Verified 2026-10-15: `/api/intelligence/v1/get-country-intel-brief?country_code=TT` and `GY` return
Claude-written briefs (model `us.anthropic.claude-sonnet-5`, 12-16 s). Caveat: with no Redis-seeded
context the brief has zero grounding sources and is model knowledge, not the day's headlines; treat it
as background, not as news. Claude 5 models reject `temperature`, so the shim drops sampling fields
(`BEDROCK_FORWARD_SAMPLING=1` re-enables them for older Claude).

## Data-source keys (outside the repo)

Keys live in `~/.config/worldmonitor/keys.env` (chmod 600, `KEY=value` lines), loaded by
`scripts/tt-dev-hub-claude.sh`; no `.env*` file is needed. Obtained 2026-10-15 (free tiers, registered
with Anton's primary Gmail): `ALPHA_VANTAGE_API_KEY`, `EIA_API_KEY`, `UPSTASH_REDIS_REST_URL` +
`UPSTASH_REDIS_REST_TOKEN` (database `worldmonitor-tt`, us-east-1). The market, commodity and energy
handlers read only Redis bootstrap keys, so seed them (and re-seed after the TTLs lapse):

```bash
set -a; . ~/.config/worldmonitor/keys.env; set +a
node scripts/seed-commodity-quotes.mjs    # Alpha Vantage → market:commodities-bootstrap:v1 (33 records)
node scripts/seed-market-quotes.mjs       # Alpha Vantage + keyless Yahoo → stocks (48 records)
node scripts/seed-eia-petroleum.mjs       # EIA → energy:eia-petroleum:v1
node scripts/seed-fuel-prices.mjs         # EIA → economic:fuel-prices:v1
```

Not obtained (sign-up has a captcha or needs a password/approval, so Anton does these himself):
Finnhub (stock ticker breadth), FRED (`seed-economy.mjs` macro panels), ACLED (regional conflict events).
Groq is unnecessary now that Claude is wired in.

## Local AI with Ollama (no cloud key)

Ollama is installed on this Mac with llama3.1:8b, qwen3:8b and others. Start it and run the tt
variant with the Ollama-enabled script:

```bash
ollama serve &                 # if not already running
npm run dev:tt:ollama          # sets OLLAMA_API_URL=http://localhost:11434 OLLAMA_MODEL=llama3.1:8b
```

What this unlocks locally: AI country briefs (click Trinidad & Tobago on the map, or
`/api/intelligence/v1/get-country-intel-brief?country_code=TT`) and the digest's executive summary
(`OLLAMA_URL=http://localhost:11434 OLLAMA_MODEL=llama3.1:8b ./node_modules/.bin/tsx scripts/tt-daily-digest.mts`).
Verified 2026-10-14: both return grounded output from the local model.

What stays locked on the web build regardless of LLM: the AI Insights / summarize panel, WM Analyst
chat, Deduct Situation and the regional briefs are Pro-gated server-side (`src/shared/premium-paths.ts`,
`isCallerPremium`). They open only with a Clerk Pro session or a key listed in `WORLDMONITOR_VALID_KEYS`
sent as `X-WorldMonitor-Key`, which the browser client only does on desktop. Treat llama3.1:8b output
as a reading aid: on thin inputs it fills gaps with plausible-sounding specifics, so keep the source
links next to any summary.

## Still needs a key (optional)

- AI Insights / country briefs / chat analyst: covered by Claude on Bedrock (`dev:hub:claude`) or Ollama; `GROQ_API_KEY` / `OPENROUTER_API_KEY` remain optional alternatives.
- Vessel tracking (`ais` layer): `AISSTREAM_API_KEY` (free).
- Satellite fire detections: `NASA_FIRMS_API_KEY` (free).
- ACLED conflict/protest events: `ACLED_EMAIL` / `ACLED_PASSWORD` (free for researchers).
- Internet outages layer: `CLOUDFLARE_API_TOKEN` (paid Radar) — left off in the tt defaults.
- The PRO "Latest Brief" panel needs Clerk auth + Convex + Redis + `BRIEF_URL_SIGNING_SECRET`; it is not part of the tt variant.
