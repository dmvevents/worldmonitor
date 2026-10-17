# T&T hub: integration options

Evaluated 2026-10-17 against branch `tt-focus` (see `TT_FOCUS.md`). Scope rule
applies throughout: public and official sources, aggregate only; nothing here
profiles individuals or reads social-media accounts. Status facts below were
checked this session with live fetches unless marked *not verified*.

## Top 5 by value for effort

| # | Option | Effort | Why first |
| --- | --- | --- | --- |
| 1 | WMO SWIC CAP alerts (cherry-pick upstream `#6924`) | S-M | T&T Met Service, Barbados, Guyana and Jamaica are SWIC members; the hub is NWS-only today |
| 2 | Run `scripts/ais-relay.cjs` locally for OpenSky + AISStream | S-M | One process unlocks the `ais` layer and the OpenSky military-flights layer |
| 3 | GDELT Caribbean topic rows in `seed-gdelt-intel.mjs` | S | Keyless, already in the daily seed loop, feeds `GdeltIntelPanel` |
| 4 | Finish the iptv-org join (`logos.json`, `feeds.json`, stream labels) + CSO RSS | S | Directory ships 0 logos today; labels give the ◷ marker for free |
| 5 | RSS-Bridge for official sites without RSS (TTPS, OPM, Met Office) | M | Replaces Google News `site:` proxies for government notices |

## Candidate assessment

| Candidate | Adds for a T&T/Caribbean user | Licence | Plug-in point in this codebase | Effort | Risks | Recommendation |
| --- | --- | --- | --- | --- | --- | --- |
| iptv-org/epg | Now/next programme per channel. Verified: `guides.json` (180,681 rows) has 1 TT guide (Bhakti TV via airtelxstream.in), 1 GY (DTV8), 1 BB, 41 VE, 13 DO, 13 PR; none for TTT, CNC3, TV6, Parliament. No prebuilt XML is hosted; you run the grabber (`ghcr.io/iptv-org/epg:master`, cron, port 3000) | Unlicense | Join `guides.json` in `scripts/iptv-sync.mjs` into a `hasGuide`/`epg` field; a now/next line in `src/live-channels-window.ts` | M | Grabber scrapes third-party guide sites; per-site blocking with concurrency > 1 | Skip for T&T; revisit only if a Flow/Digicel guide site appears in SITES.md |
| iptv-org/database unused fields | Logos (currently 0: `channels.json` has no `logo` field, `logos.json` does, 35,399 rows); `streams.json.labels` (`Not 24/7`, `Geo-blocked`) for the ◷ marker; `feeds.json` languages and `broadcast_area`; `closed`/`replaced_by` already filtered | Unlicense (metadata) | `scripts/iptv-sync.mjs`: fetch `logos.json` + `feeds.json`, emit `logo`, `labels`, `languages`; render in `src/live-channels-window.ts` | S | None beyond iptv-org availability | Do it |
| RSSHub | Generic HTML→RSS: `/transform/html/:url/:routeParams` (`item`, `itemTitle`, `itemLink`, `itemDesc`, `itemPubDate`), gated by `ALLOW_USER_SUPPLY_UNSAFE_DOMAIN=true`. Docker `diygod/rsshub`, port 1200. No T&T-specific routes found | AGPL-3.0 | Feed URLs `http://127.0.0.1:1200/transform/html/...` in `TT_FEEDS` (`src/config/feeds.ts`) and `VARIANT_FEEDS.tt` (`server/worldmonitor/news/v1/_feeds.ts`); allow host in `shared/rss-allowed-domains.json`, `api/_rss-allowed-domains.js`, `scripts/shared/...`, `vite.config.ts`; confirm the RSS proxy's private-host guard permits loopback | M | AGPL; upstream's relay blocklists `rsshub.app`; CNC3 is Cloudflare-gated so transforms fail there; commercial outlets' ToS | Prefer RSS-Bridge (below); same wiring |
| RSS-Bridge | `CssSelectorBridge` / `XPathBridge` for arbitrary pages; built-in cache; `rssbridge/rss-bridge` image, port 80→3000; bridges enabled in `config.ini.php` | Unlicense | Same four allowlist mirrors + feed catalog as RSSHub; one bridge URL per official site (TTPS, OPM, Met Office, ODPM) | M | Scraping ethics: limit to government notice pages, cache ≥ 15 min, honour robots.txt; selectors rot | Do for official sites; keep Google News `site:` for commercial outlets |
| yt-dlp / streamlink | Resolve YouTube lives (TTT, CNC3, TV6, NCN) to HLS so hls.js can play them without the iframe | Unlicense / BSD-2 | Sidecar `/api/hls-proxy` (`src-tauri/sidecar/local-api-server.mjs`, allowlist `ALLOWED_HLS_HOSTS`) would need `*.googlevideo.com`, re-resolution on URL expiry, and a resolver endpoint | L | googlevideo has no CORS and binds URLs to the requesting IP; YouTube ToS forbids access outside its player; upstream needed a residential proxy just to audit YouTube (`#8541`). ParlView is not YouTube | No. Keep the iframe + off-air card |
| Open-Meteo | Keyless forecasts for Port of Spain, Scarborough, Georgetown; marine API for Gulf of Paria; no official warnings | CC BY 4.0; < 10k calls/day non-commercial | New keyless `scripts/seed-tt-forecast.mjs` on the daily list in `scripts/tt-seed-loop.sh` (pattern: `_open-meteo-archive.mjs`), plus a small panel | M | Forecast only, not alerts; attribution | Later; alerts matter more |
| WMO SWIC CAP (upstream `#6924`) | Official warnings from `severeweather.wmo.int/json/wmo_all.json`; `wmo_member.json` lists Trinidad and Tobago Meteorological Service (mid 027), Barbados, Guyana, Jamaica | WMO public feed | Cherry-pick upstream `scripts/_weather-alert-select.mjs` and the SWIC merge in `scripts/seed-weather-alerts.mjs` (writes `weather:alerts:v1`, already re-seeded every pass) | S-M | Upstream file also adds ECCC/IMD; take SWIC parts only, bring its tests | Top pick |
| GDELT DOC 2.0 | Caribbean article volume and tone; `sourcecountry:`/`sourcelang:` operators, 3-month window, 250 records, CORS `*` | Free, attribution | Add topic rows to `TOPICS` in `scripts/seed-gdelt-intel.mjs` (e.g. Trinidad, Tobago, CARICOM, Essequibo); daily in `tt-seed-loop.sh` | S | Undocumented rate limit (upstream saw timeouts) | Do it |
| ReliefWeb API v2 | Disaster/update reports for TT, GY, HT (hurricane season) | Free; pre-approved `appname` since 2025-11-01; 1,000 calls/day; source copyright | New seed + panel, or a feed row if ReliefWeb's per-country RSS is confirmed | M | Appname approval lead time | Later |
| HDX HAPI | Humanitarian indicators; requires `app_identifier` (verified: bare call returns `Invalid app identifier`) | HDX terms | Upstream already uses HAPI for conflict | M | Coverage centres on HRP countries; thin for T&T | Skip for T&T, useful for Haiti |
| UNHCR population API | Already in `scripts/seed-displacement-summary.mjs`; upstream `#9024` adds cross-border movements (Venezuela→T&T relevant) | UNHCR open | Cherry-pick `#9024` | S | None | Do with the SWIC pick |
| WHO DON / PAHO | WHO DON already seeded; PAHO PLISA is Power BI/ArcGIS dashboards, no documented CSV API on the portal | CC BY-NC 3.0 IGO (PAHO) | None without scraping | - | NC licence | Skip |
| CEPALSTAT (ECLAC) | Verified live JSON API: `api-cepalstat.cepal.org/cepalstat/api/v1/thematic-tree?lang=en` → 200, `version 2.0.0`; LAC-wide indicators | ECLAC terms (*not verified*) | Keyless seed → Redis key + `seed-meta`, surfaced as context for the Country brief or an economy card | M | Confirm T&T series coverage first | Pilot after the S items |
| CBTT / CSO | CBTT Data Centre is interactive, no CSV/XLSX links found, yield curve monthly; CSO is PDF bulletins but `https://cso.gov.tt/feed/` returns 200 | Site terms | CSO feed → `tt-gov` in both feed catalogs + the four allowlists; CBTT already in `tt-gov` via RSS | S | None | Add CSO RSS now |
| Caribbean Development Bank | Country economic reviews, mostly PDF | *not verified* (fetch blocked) | None | - | - | Skip |
| World Bank API | Already in `scripts/seed-wb-indicators.mjs` for all countries (TTO, GUY included) | CC BY 4.0 | Nothing to add | - | - | Already covered |
| OpenSky Network | ADS-B for a Caribbean bbox. OAuth2 client credentials only (basic auth gone); anonymous 400 credits/day, 10 s resolution; registered 4,000; ≤ 25 sq° box = 1 credit | OpenSky terms | `api/opensky.js` relays to `WS_RELAY_URL`; `scripts/ais-relay.cjs` serves `/opensky` with `OPENSKY_CLIENT_ID/SECRET` (port 3004). Start it from `scripts/tt-hub-serve.sh`, set `WS_RELAY_URL=http://127.0.0.1:3004` for the sidecar | S-M | Strategic Posture's server side (`get-theater-posture.ts`) reads Wingbits only, so its waiting state stays; OpenSky feeds the military-flights map layer | Do it |
| AISStream | Gulf of Paria and Stabroek shipping via WebSocket `BoundingBoxes` | Free key (`aisstream.io`; terms *not verified*, site blocks fetchers) | Same relay process: `AISSTREAM_API_KEY` + `VITE_WS_RELAY_URL`; add TT/GY boxes to the relay's subscription | S once the relay runs | Key quota unknown | Do with OpenSky |
| Basemap / bathymetry | OpenFreeMap vector to z14 is fine for both islands; GEBCO WMS `https://wms.gebco.net/mapserv?` layer `gebco_latest` adds seabed context for Stabroek | GEBCO: attribution required, not for navigation | Optional raster source next to the RainViewer source in `src/components/DeckGLMap.ts`; layer entry in `src/config/map-layer-definitions.ts`; CSP in `index.html`, `vercel.json`, `src-tauri/tauri.conf.json` | M | Three CSPs to keep in sync | Nice-to-have |

## Upstream World Monitor (koala73/worldmonitor)

Base `db26b837` is dated 2026-07-10; `origin/main` is at 2026-10-18, 3,746
commits ahead, and the tree grew from 4,077 to 8,243 files. Our 36 commits
touch 99 files; 75 of them also changed upstream, including every heavy one:
`src/components/LiveNewsPanel.ts` (upstream +452/−1325, rewritten around the
"verified live video session", `#8518`/`#8533`), `src/config/feeds.ts`
(+874/−200), `server/worldmonitor/news/v1/_feeds.ts`, `src/config/panels.ts`,
`src-tauri/sidecar/local-api-server.mjs` (+402/−204, security hardening
`#7910`/`#7913`/`#8172`), `vite.config.ts`, `src/config/map-layer-definitions.ts`
and `shared/rss-allowed-domains.json` (+400/−311).

Themes a merge would bring: SWIC/ECCC/IMD alerts in `weather:alerts:v1`
(`#6924`, `#7194`); UNHCR cross-border movements and IOM DTM displacement map
(`#9024`, `#9015`); a per-country GDELT article index that grounds country
briefs (`#7786` chain) — this would fix the ungrounded TT/GY briefs noted in
`TT_FOCUS.md`; ECDC/CIDRAP outbreak feeds (`#8555`); 100 entries retained per
feed (`#9237`); deck.gl 9.4 `MapLibreOverlay` (`#8508`); self-host hardening
(Redis auth required at startup `#7986`, self-hosted session can call the
country brief `#6929`); Groq removed from the LLM chain (`#8903`, harmless for
our `generic` Bedrock shim); RSS proxy served as inert text with exact host
matching (`#7998`, `#8398`), which may reject our Google News `site:` feeds.

Difficulty: L to XL. A rebase would conflict in LiveNewsPanel, both feed
catalogs, panels, the sidecar and vite config, and the live-news rewrite
changes the model our ◷/off-air/replay work sits on. Recommended path: stay on
the current base and cherry-pick the targeted commits above (`#6924`, `#9024`,
`#8555`, the `#7786` GDELT index chain), each with its tests, verifying with
`npm run typecheck && npm run test:data` after each pick. Revisit a full rebase
only if the hub needs the deck.gl 9.4 engine or the live-video session.
