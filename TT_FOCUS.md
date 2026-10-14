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
| Map view | new `caribbean` preset (deck.gl / globe / SVG / URL state / region selectors); `src/config/map-view.ts` makes it the tt default |
| Variant detection & meta | `src/config/variant.ts`, `src/config/variant-meta.ts`, `src/config/variants/tt.ts` (`TT_TIMEZONE`, `TT_COUNTRY_CODE`) |
| Timezone | `America/Port_of_Spain` → `TT` in `src/utils/user-location.ts`; Port of Spain first in the World Clock for tt |
| Daily digest | `scripts/tt-daily-digest.mts` (+ `scripts/tt-daily-digest.launchd.plist.example`) |

## Feed categories (topic lenses)

`tt-news`, `tt-gov`, `tt-energy`, `tt-education` (incl. student laptop programme), `tt-telecoms` (TSTT, Digicel, TATT), `tt-public-it` (procurement, iGovTT, digital transformation), `tt-safety` (aggregate public-safety news only), `tt-weather` (NHC Atlantic, Met Office, T&TEC/WASA outages), `caribbean` (Venezuela, Guyana, CARICOM).

Direct RSS (verified 2026-10-14): Trinidad Express (BLOX search RSS), TTT, Parliament, Ministry of Education, TATT, EBC, Central Bank, Ministry of Energy, NGC, iGovTT, NHC Atlantic, CARICOM Today, Barbados Today, Caribbean News Global, Jamaica Observer, Guyana Chronicle.

No usable RSS (blocked, 404, or empty) → Google News `site:` queries instead: Guardian TT, CNC3, Newsday, TTPS, Office of the Prime Minister, Met Office, OPR, Energy Chamber, Stabroek/Kaieteur. Loop TT's domain no longer resolves and is omitted. A `site:gov.tt` catch-all was tried and removed: Google indexes spam pages on compromised gov.tt subdomains.

Trinidad Express rate-limits bursts (HTTP 429) if the same host fetches its three feeds repeatedly within minutes; the dashboard's per-feed cache keeps this from mattering in normal use.

## Scope rule

Public news and official sources only, aggregate and topic level. No profiling of private individuals, no voter or phone data, no social-media account scraping of named people. The `tt-safety` lens is public-news aggregate only.

## Daily digest

```bash
./node_modules/.bin/tsx scripts/tt-daily-digest.mts            # → ~/Documents/tt-digest/tt-digest-YYYY-MM-DD.md + latest.md
./node_modules/.bin/tsx scripts/tt-daily-digest.mts --stdout --hours 48 --per-category 15
```

Headlines grouped by lens, timestamps in `America/Port_of_Spain`. If a local Ollama is reachable (`OLLAMA_URL`, `OLLAMA_MODEL`) an executive summary is prepended; otherwise the digest says so and stays unsummarised. No cloud key is used.

## Still needs a key (optional)

- AI Insights / country briefs / chat analyst: `GROQ_API_KEY` or `OPENROUTER_API_KEY`, or any OpenAI-compatible endpoint via `LLM_API_URL` (+ `LLM_MODEL`, `LLM_API_KEY`) — Ollama works for this too.
- Vessel tracking (`ais` layer): `AISSTREAM_API_KEY` (free).
- Satellite fire detections: `NASA_FIRMS_API_KEY` (free).
- ACLED conflict/protest events: `ACLED_EMAIL` / `ACLED_PASSWORD` (free for researchers).
- Internet outages layer: `CLOUDFLARE_API_TOKEN` (paid Radar) — left off in the tt defaults.
- The PRO "Latest Brief" panel needs Clerk auth + Convex + Redis + `BRIEF_URL_SIGNING_SECRET`; it is not part of the tt variant.
