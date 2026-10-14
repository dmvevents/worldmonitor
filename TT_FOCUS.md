# Trinidad & Tobago focus (`tt` variant)

Local-only site variant that turns World Monitor into a Trinidad & Tobago / southern Caribbean monitor. Branch `tt-focus`; not intended for the upstream koala73 repo.

## Run

```bash
npm run dev:tt          # VITE_VARIANT=tt on http://localhost:3100  (port 3000 is taken by Docker/Grafana on this Mac)
npm run build:tt        # production build of the tt variant
```

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
| Variant detection & meta | `src/config/variant.ts`, `src/config/variant-meta.ts`, `src/config/variants/tt.ts` (`TT_TIMEZONE`, `TT_COUNTRY_CODE`) |
| Timezone | `America/Port_of_Spain` → `TT` in `src/utils/user-location.ts`; Port of Spain first in the World Clock for tt |
| Daily digest | `scripts/tt-daily-digest.mts` (+ `scripts/tt-daily-digest.launchd.plist.example`) |

## Feed categories (topic lenses)

`tt-news`, `tt-gov`, `tt-energy`, `tt-education` (incl. student laptop programme), `tt-telecoms` (TSTT, Digicel, TATT), `tt-public-it` (procurement, iGovTT, digital transformation), `tt-safety` (aggregate public-safety news only), `tt-weather` (NHC Atlantic, Met Office, T&TEC/WASA outages), `caribbean` (Venezuela, Guyana, CARICOM).

Direct RSS (verified 2026-10-14): Trinidad Express and TV6 (BLOX search RSS), TTT, Power 102, Tobago Updates, Parliament, Tobago House of Assembly, Ministry of Education, TATT, EBC, Central Bank, Ministry of Energy, NGC, iGovTT, NHC Atlantic, CARICOM Today, Barbados Today, Caribbean News Global, Jamaica Observer, Guyana Chronicle, Guyana Times, Demerara Waves, WIC News, Searchlight and iWitness News (SVG), NOW Grenada, St Lucia Times, Dominica News Online, Antigua Observer.

No usable RSS (blocked, 404, or empty) → Google News `site:` queries instead: Guardian TT, CNC3, Newsday, TTPS, Office of the Prime Minister, Met Office, OPR, Energy Chamber, Stabroek/Kaieteur. Also no feed: i95.5FM, Tobago Today, Wired868 (403), CMC, Nation News (403), ODPM, CSO.

Live TV is YouTube-based: the dev middleware resolves `youtube.com/@handle/live`, so a channel is playable only while the broadcaster is actually streaming (TTT, Parliament and Tobago Updates stream sittings and newscasts; teleSUR English is near 24/7). No IPTV m3u8 streams were added because none of the T&T broadcasters publish a public HLS URL. Loop TT's domain no longer resolves and is omitted. A `site:gov.tt` catch-all was tried and removed: Google indexes spam pages on compromised gov.tt subdomains.

Trinidad Express rate-limits bursts (HTTP 429) if the same host fetches its three feeds repeatedly within minutes; the dashboard's per-feed cache keeps this from mattering in normal use.

## Scope rule

Public news and official sources only, aggregate and topic level. No profiling of private individuals, no voter or phone data, no social-media account scraping of named people. The `tt-safety` lens is public-news aggregate only.

## Daily digest

```bash
./node_modules/.bin/tsx scripts/tt-daily-digest.mts            # → ~/Documents/tt-digest/tt-digest-YYYY-MM-DD.md + latest.md
./node_modules/.bin/tsx scripts/tt-daily-digest.mts --stdout --hours 48 --per-category 15
```

Headlines grouped by lens, timestamps in `America/Port_of_Spain`. If a local Ollama is reachable (`OLLAMA_URL`, `OLLAMA_MODEL`) an executive summary is prepended; otherwise the digest says so and stays unsummarised. No cloud key is used.

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

- AI Insights / country briefs / chat analyst: `GROQ_API_KEY` or `OPENROUTER_API_KEY`, or any OpenAI-compatible endpoint via `LLM_API_URL` (+ `LLM_MODEL`, `LLM_API_KEY`) — Ollama works for this too.
- Vessel tracking (`ais` layer): `AISSTREAM_API_KEY` (free).
- Satellite fire detections: `NASA_FIRMS_API_KEY` (free).
- ACLED conflict/protest events: `ACLED_EMAIL` / `ACLED_PASSWORD` (free for researchers).
- Internet outages layer: `CLOUDFLARE_API_TOKEN` (paid Radar) — left off in the tt defaults.
- The PRO "Latest Brief" panel needs Clerk auth + Convex + Redis + `BRIEF_URL_SIGNING_SECRET`; it is not part of the tt variant.
