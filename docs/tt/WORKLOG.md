# Trinidad & Tobago Hub Worklog (2026-10-14 to 2026-10-17)

## Summary

A complete T&T intelligence hub built from the World Monitor SPA: four variants (tt / gy / chips / full), a GA runner as a macOS launchd service with Claude on Bedrock, offline-first dashboard tabs, live TV for Caribbean broadcasters with HLS fallback, and an IPTV directory of 985 verified channels. All code local-only on branch `tt-focus`; never pushed upstream.

---

## Round 1: Feed Catalog & Variant (2026-10-14, morning–afternoon)

**Goal:** Stand up the `tt` site variant with a news feed catalog and default regional panels.

**What was done:**

- Feed catalog (`src/config/feeds.ts` TT_FEEDS, 9 categories): tt-news, tt-gov, tt-energy, tt-education, tt-telecoms, tt-public-it, tt-safety, tt-weather, caribbean.
- Direct RSS sources verified: 32 feeds from T&T (Parliament, TTPS, Ministry of Education, EBC, Central Bank, Ministry of Energy, NGC, iGovTT, TATT, Power 102), CARICOM, and Caribbean nations.

- Google News `site:` fallbacks for domains that block or lack RSS (Guardian TT, CNC3, Newsday, Met Office, OPR, Energy Chamber).
- Server digest handler (`server/worldmonitor/news/v1/_feeds.ts`): `VARIANT_FEEDS.tt`, 'tt' in `VALID_VARIANTS`.

- RSS proxy allowlists: `shared/rss-allowed-domains.json`, `api/_rss-allowed-domains.js`, `vite.config.ts`.
- SPA variant: `src/config/variant.ts` registry, `src/config/variants/tt.ts` (timezone, country code), panels config (TT_PANELS).

- Locale sync: English shell i18n keys, CMD+K navigation commands.
- Tests updated: variant-enumeration guards, digest methodology parity.

- Daily digest script: `scripts/tt-daily-digest.mts` (markdown, Port of Spain timestamps, optional Ollama summary).

**Technique:** Probe each feed domain with curl (timeout 5 s, check for RSS XML headers); register feeds in config chains; wire variant in tsconfig and tests.

**Verification:** `npm run typecheck` (src + api), `npm run dev:tt` on localhost:3100 (9 TT panels visible, Caribbean map view selectable, digest load verified with 9 categories).

**Commits:** f9c0efe67 (feeds), e1b90963f (variant), 896a5eeef (digest + runbook).

---

## Round 2: EBC Constituencies & Hurricane Layers (2026-10-14, afternoon–evening)

**Goal:** Add geospatial reference data for T&T: electoral boundaries and Atlantic tropical storm forecasts.

**What was done:**

- EBC artifact: `public/data/tt-ebc-constituencies.geojson` (41 constituencies, boundary-only, from the tt-geopolitical-intelligence API via `scripts/tt-ebc-export.sh`). Attribution in `public/data/README.md`.
- NHC layers: `src/services/tt-geo-layers.ts` (lazy read-through store for EBC and NHC CurrentStorms.json + forecast cone/track GeoJSON from NOAA MapServer, Atlantic slots AT1–AT5, 30-min TTL) via the allowlisted feed proxy.

- DeckGLMap renderers: `ebcConstituencies` (island-tinted GeoJsonLayer, hover shows EBC configuration year / validation status / provenance), `hurricanes` (cone polygons, track lines, intensity-sized positions).
- Variant config: registry, layer order (`VARIANT_LAYER_ORDER.tt`), defaults, commands, i18n, URL state.

- Allowlist: `mapservices.weather.noaa.gov` added to feed proxy.
- Docs stats regenerated: 58 layers, 7 variants, 198 service modules.

**Technique:** Read artifact from disk on first request, refresh NHC on timer (30-min TTL, retry on failure with 5-min backoff for EBC). Guard against stale geometry: failed NHC refresh clears expired cones/tracks and re-stamps fetchedAt; storm matching on name prevents NOAA renumbering confusion.

**Verification:** Browser on localhost:3100 (EBC layer present in layer list, toggles on/off, hover shows constituency metadata; NHC cone + track drawn when a system is active; map header shows "T&T" in title).

**Key debugging:** Region detection scope: the Caribbean timezone/bbox resolution needed scoping to the `tt` variant only, or other sites saw spurious regional sorts. Fixed in commit f6c008ba9.

**Commits:** 0c322189b (layers), 15036fb2d (docs), f6c008ba9 (region/TTL/staleness fixes).

---

## Round 3: Live TV, Off-Air Fallback & IPTV Channels (2026-10-15, morning)

**Goal:** Bring Caribbean live TV to the dashboard: YouTube streams for TTT/CNC3/TV6 (newscast-only), HLS for always-on broadcasters, IPTV directory.

**What was done:**

- Live TV decision tree: YouTube live URLs first (TTT, CNC3, TV6, Parliament, Tobago Updates); off-air card when neither live nor fallback exists (Next live, Play latest bulletin, Retry); replay badged REPLAY; ◷ marker for newscast-only stations.
- Latest-upload fallback: `api/youtube/live.js` returns `latestVideoId` when no live stream; panel plays it with `isLive: false` (no "live" claim on a replay).

- Caribbean HLS channels verified (curl, iptv-org index, broadcasters' own sites): Bizz TV, Sankhya TV, Scorch TV, Riddim & Hope TV, The Islamic Network (T&T), ZIZ TV (St Kitts), Caribbean Hot 7 (St Lucia), Guardian Talk Radio (Bahamas), Fame 95 (Jamaica), HGPTV/MTV Guyana, Little Guyana TV, CBC TV8, TVJ/GNN Jamaica, DBS St Lucia, Pointe TV, ZNS Bahamas, Antena 7/Noticias 16 (DR), Martí (Cuba), Haiti News Channel, Telemundo (PR), teleSUR (ES + EN), Venevisión, Canal I (Venezuela).
- IPTV directory: `scripts/iptv-sync.mjs` pulls iptv-org index, probes each Caribbean/Guiana Shield + worldwide news stream (manifest 200, `#EXTM3U`, CORS OK; skips Referer/User-Agent spoofing), writes `public/data/iptv-directory.json` (985 verified of 1,946 probed).

- Live News panel UI: **Manage channels** → IPTV directory filter/search, add any entry to strip.
- Variants gy (Guyana) and chips (AI compute/semis) added with their own feed lenses, map views, live channels, ticker tapes.

**Technique:** Probe HLS with curl `-I` (check manifest CORS headers); YouTube handles via youtube.com/@handle/live (404 = no live stream); iptv-org sync via parallelized fetch (max 20 streams in flight, 30 s per stream timeout).

**Verification:** Headless Playwright (channel `chrome` for H.264 support) confirms Bizz/CBC/ZIZ decode HLS; `npm run dev:hub` dashboard on :3100 shows Main (world + Caribbean IPTV) → Guyana preset tab (NCN/HGPTV/MTV strips switch in); off-air card for TTT at off-peak times, latest upload plays; IPTV directory UI filters and adds channels.

**Problems:** No usable HLS from TTT, CNC3 (Cloudflare-gated), TV6 (Dailymotion locked), YouTube remains their only route. TTT, CNC3, TV6 are newscast-only (◷ marker). Anton's Chrome tab was hidden/occluded on secondary display; Chrome defers media loading in background tabs (not a stream issue, confirmed when window moved to primary display).

**Commits:** 826de8200 (live fallback), e97c688e5 (gy/chips variants + IPTV), edb08bd56 (preset tabs), 9940ac40f (tab map/channel switching), 24a96ca6f (map header per tab).

---

## Round 4: Preset Tabs & Hub Integration (2026-10-15, afternoon)

**Goal:** Unify three variants into one global dashboard via preset tabs; preset tabs switch region, map header, and live channel strip.

**What was done:**

- Preset dashboard tabs: every variant (tt / gy / chips) seeds the other two as extra tabs; full variant seeds all three. Tabs enable exactly that variant's panels via `getVariantEnabledPanelKeys()`.
- Tab switching: `LiveNewsPanel.applyChannelPreset()` re-centres map on tab's region (`mapView`), updates map header (`mapTitle`), puts variant's broadcasters first in the Live News strip (`liveChannelIds`).

- Per-variant channel defaults: `src/config/live-channel-defaults.ts` (VARIANT_LIVE_CHANNEL_IDS).
- Tests: `tests/dashboard-tab-presets.test.mts` validates preset tabs ↔ panels / map views / live channels / feed catalog; `scripts/validate-live-channels.mjs` probes every HLS manifest + CORS, every YouTube handle + latest upload.

- Live News panel fix: mounted into reserved deferred shell (was creating a duplicate); preset channel set applied on mount (not during tab init).

**Technique:** Preset tab seeds once per variant, deletion is persisted in localStorage. Map view tracks are deck.gl (3D globe + deck.gl layers), SVG (flat), and URL state (link-shareable). Tab switch hands over (mapView, mapTitle, liveChannelIds) to the panel.

**Verification:** Browser on :3100: Main → Trinidad & Tobago → Guyana → Main; region selector, map header, and Live News strip all update correctly. Single Live News panel in grid. Reload on a preset tab re-opens on that region (applied after initPanelTabs).

**Commits:** 7d6279778 (hub), 5e678eaae (Main tab docs), 30e0e6991 (Live News mount), c881f360b (tabs don't touch user channels), ee54bb33 (tests), 23b1a1a5b (IPTV directory).

---

## Round 5: Claude on Bedrock & LLM Integration (2026-10-15, evening)

**Goal:** Unlock AI country briefs and digest summarization using Claude on Amazon Bedrock (no cloud OpenAI/Groq key).

**What was done:**

- Claude shim: `scripts/tt-claude-proxy.py` (stdlib + boto3, translates OpenAI chat-completions to Bedrock Converse API, streaming included, :8788).
- LLM chain: `server/_shared/llm.ts` tries ollama → openrouter → groq → generic in order; `npm run dev:hub:claude` unsets Ollama so all briefs go to Claude.

- Digest integration: `scripts/tt-daily-digest.mts` tries LLM_API_URL (Bedrock shim) before Ollama.
- Data-source keys: `~/.config/worldmonitor/keys.env` (chmod 600) holds ALPHA_VANTAGE_API_KEY, EIA_API_KEY, UPSTASH_REDIS_REST_URL/TOKEN; loaded by `scripts/tt-dev-hub-claude.sh`.

- Seeds: market quotes (Alpha Vantage + keyless Yahoo), EIA petroleum + fuel prices, commodities (33 records), stocks (48 records); seed loop every 25 min (market TTL 30 min, so re-seed before expiry).
- Optional keys: ACLED (Google OAuth + password, access approval pending), FRED (manual key request), Finnhub (captcha).

**Technique:** AWS_PROFILE=bedrock (boto3 SigV4), Bedrock models: Sonnet 5 (default), Opus 5.5 (with --bedrock_model override). Claude 5 rejects `temperature`, so shim drops sampling fields unless BEDROCK_FORWARD_SAMPLING=1 (pre-Claude-5).

**Verification:** `curl http://127.0.0.1:8788/health` returns shim status. `/api/intelligence/v1/get-country-intel-brief?country_code=TT` and GY return 12–16 s Claude briefs grounded in zero sources (model knowledge, not headline-driven). Digest summary prepends executive summary or "Ollama unreachable" message.

**Problems:** With no Redis-seeded context, briefs are model hallucination (treat as background, not news). ACLED OAuth succeeds but `/api/acled/read` returns 403 "Access denied" until ACLED approves institutional access (pending). FRED sign-in form resists automation; key request manual. Finnhub needs captcha handling.

**Commits:** 3f0bfedc (llm), faf084d5 (live-news choices), docs commit after.

---

## Round 6: Live TV HLS Playback & RainViewer Zoom Cap (2026-10-15, late)

**Goal:** Fix two critical bugs: Chrome's native HLS decoder never fires on certain streams, and RainViewer radar tiles 404 above zoom 7.

**What was done:**

- HLS on Chrome: Chrome 155 `canPlayType('application/vnd.apple.mpegurl')` returns `'maybe'` (not `'probably'`); native path never decodes stream. Now use hls.js (FetchLoader, no Referer header) on Chrome/Firefox; Safari/WKWebView use native HLS.
- CDN Referer rejection: CBC TV8, CBC Barbados, ZIZ TV reject Referer header (CDN77 blocks fetch); hls.js FetchLoader with `referrerPolicy: 'no-referrer'` unblocks them.

- Chrome tab visibility: Anton's Chrome tab on secondary display reported `visibilityState=hidden` the whole session; Chrome defers media loading in background/occluded tabs. Confirming channel plays when tab is active; no stream issue.
- RainViewer zoom: probe shows z>=8 requests return identical 1370 B placeholder PNG ("Zoom Level Not Supported"). Set weather-radar source `maxzoom: 7`; map overzoom last real level instead of tiling 404 placeholders.

**Technique:** Detect `canPlayType()` result and route to hls.js if not `'probably'`. Headless Playwright with `channel: 'chrome'` (Chromium) to probe HLS decode; tile Z/X/Y inspection with Network tab.

**Verification:** Headless Playwright probes confirm Bizz/CBC/ZIZ decode with hls.js; live dashboard shows regional map without grey-box error.

**Key debugging story (root cause):** RainViewer placeholder PNG above z7 is a published limitation of their free tier; the map had no code to respect it, so tiles loaded verbatim. Added maxzoom cap to source definition. Chrome's `canPlayType('maybe')` is a WebCodecs quirk: the browser doesn't want to commit to a format until it actually tries to decode it.

**Commits:** bce2f6d59 (HLS fix), 74215605d (zoom cap).

---

## Round 7: GA Runner & Service Installation (2026-10-15/16, night–morning)

**Goal:** Package the hub as a macOS launchd service that starts at login, runs production build (no dev server), and manages sidecar + seed loop + Claude shim.

**What was done:**

- GA runner: `scripts/tt-hub-serve.sh` (4 processes: Claude shim :8788, sidecar :46123, front door :3100, seed loop). Each child monitored; Ctrl-C stops all.
- Front door: `scripts/tt-hub-server.mjs` (pure node:http, no Docker/nginx). Serves built SPA (`dist/dashboard.html`, fallback index for routes, long-cache assets). Reverse-proxies `/api/*` to local sidecar with `LOCAL_API_TOKEN` Bearer header (minted per start, injected by front door).

- Sidecar docker mode: `src-tauri/sidecar/local-api-server.mjs` executes every `api/` handler locally (no cloud fallback). SSRF guard originally blocked private LLM origins; docker-mode allowlist added for OLLAMA_API_URL/LLM_API_URL.
- Browser auth: `/api/wm-session` returns anonymous session signed with `WM_SESSION_SECRET` (persisted `~/.config/worldmonitor/local-secrets.env`). Pro routes need `X-WorldMonitor-Key` header (from `WORLDMONITOR_VALID_KEYS`); front door injects `WM_LOCAL_OPERATOR_KEY` for the local user.

- Shim fixes: decode chunked request bodies (hls.js + large POST), answer GET probes (/health).
- launchd service: `scripts/tt-install-service.sh install | restart | status | uninstall`. Plist writes `bash scripts/tt-hub-serve.sh`; logs to `~/Library/Logs/worldmonitor-hub/hub.log`.

- Build step: `npm run build:full` + `node scripts/build-sidecar-handlers.mjs` (bundles `api/` handlers to `.js` for local execution).

**Technique:** Production build in dist/; sidecar handler bundles via esbuild (gitignored); keys outside repo (`~/.config/worldmonitor/`); launchd runs bash script (EnvironmentVariables section for PATH / HOME / HUB_PORT).

**Verification:** Service installed, starts at login, logs to ~/Library/Logs/worldmonitor-hub/hub.log. Browser opens http://127.0.0.1:3100/dashboard; 4-tab audit (AI Forecasts + ADS-B Posture empty by design) verified. Live TV decodes (Bizz/CBC/ZIZ HLS), TTT off-air card + replay works. Claude briefs resolve (12–15 s per country), bootstrap weather alerts load. Market quotes populate (post-seed). IPTV directory UI functional. Sidecar test suite: 191/192 (one failure: port 46123 held by running hub; passes when ports free).

**Problems found:** Sidecar SSRF guard rejected `http://127.0.0.1:8788` (private LLM origin); docker-mode allowlist solved it. Shim had to decode chunked bodies (hls.js sends them). `/api/youtube/live` is cloud-only in sidecar, so front door runs `api/youtube/live.js` itself. Pro routes check `X-WorldMonitor-Key` and Clerk auth; sidecar has no Clerk context, so pro routes (Insights, chat, latest Brief) show "upgrade to Pro" on the GA hub.

**Known empty states:** AI Forecasts needs `seed-forecasts.mjs` (OpenRouter/Groq models, keyless path TBD). ADS-B Strategic Posture needs the AIS relay. Both show their own waiting states. Keyless bundles (FX, GDELT, disease, displacement, energy disruptions, climate) seed on first pass or next manual trigger.

**Commits:** 09d5d33cd9 (chunked bodies), 08425cd72 (sidecar docker-mode SSRF), 549ff9bee (GA runner), 9255571e2 (GA docs).

---

## Current State (as of 2026-10-17)

- **Branch:** `tt-focus` (local only, never pushed upstream)

- **Variants:** tt (T&T default), gy (Guyana), chips (AI compute), full (global hub with regional tabs)
- **GA service:** Running on localhost:3100, starts at login via launchd

- **News:** 9 T&T feed lenses + Caribbean coverage (32+ direct RSS, Google News fallbacks)
- **Live TV:** 50+ verified HLS channels (IPTV directory, 985 of 1,946 iptv-org entries); YouTube for newscast-only stations (TTT, CNC3, TV6)

- **Maps:** Trinidad view (z8.2), Caribbean view (z5), EBC constituencies, NHC hurricanes
- **Claude:** Bedrock shim running, briefs for TT/GY (and other countries via `/api/intelligence`)

- **Data:** Upstash Redis (worldmonitor-tt, us-east-1), market/energy seeds every 25 min via loop
- **Secrets:** `~/.config/worldmonitor/keys.env` (chmod 600), `~/.config/worldmonitor/local-secrets.env` (browser session)

- **Logs:** `~/Library/Logs/worldmonitor-hub/hub.log`
- **Docs:** TT_FOCUS.md (runbook), WORKLOG.md (this file), HOW-IT-WORKS.md (architecture)

---

## Open Items

- **AI Forecasts panel:** Needs `scripts/seed-forecasts.mjs` (generate predictions with OpenRouter/Groq, keyless path TBD)

- **ADS-B relay:** Vessel tracking (`ais` layer) needs `AISSTREAM_API_KEY` (free tier); Strategic Posture panel needs the relay seeded
- **ACLED conflict data:** Account created, OAuth OK, but `/api/acled/read` returns 403 pending access approval (institutional email expected)

- **FRED API key:** Manual request at https://fredaccount.stlouisfed.org/apikeys (form automation failed); once obtained, add `FRED_API_KEY` to keys.env
- **Finnhub:** Captcha on login; skip for now

- **Upstream main:** ~3,700 commits ahead of tt-focus; merging is a separate project (likely breaking due to world-monitor internal refactors)
- **Dev gap:** `/api/bootstrap` not executed by Vite dev server (returns source); weather alerts/forecast panels stay "Loading..." locally (upstream issue, not tt-specific)

## Round 8: Fill the Main tab, integrations and publishing (2026-10-17)

**Goal:** Answer "some panels aren't showing", pick the quick wins from the integration research, document everything and publish.

**What was done:**

- Pro-tier panels unlocked locally: the front door sets a short-lived readable `wm-pro-key` cookie with the instance operator key; the SPA exchanges it for an HttpOnly session (`/api/wm-session`, validated against `WORLDMONITOR_VALID_KEYS`). Country Instability, Strategic Risk, Threat Timeline, Insights and Forecasts render instead of upgrade gates.
- Data for those panels: a one-off sweep of every keyless seed script (69 of ~75 succeeded; the rest are refresh-only or LLM-keyed jobs) plus a weekly sweep in `scripts/tt-seed-loop.sh`.
- WMO SWIC CAP alerts merged into `weather:alerts:v1` by `scripts/seed-weather-alerts.mjs` (Caribbean and Guiana Shield met services; verified live with a Trinidad and Tobago Meteorological Service alert).
- IPTV directory: logos from iptv-org `logos.json` (991 of 998 entries), "Not 24/7" and "Geo-blocked" labels surfaced in the channel manager.
- Central Statistical Office RSS feed added to the T&T government lens (both catalogs, three allowlists).
- Documentation set: this worklog, `docs/tt/HOW-IT-WORKS.md`, `docs/tt/INTEGRATION-OPTIONS.md`, the `tt-hub` Claude Code skill and three agents (`.claude/` exceptions in `.gitignore`).
- Published to Anton's own fork `dmvevents/worldmonitor` (branch `tt-focus`, now the fork's default branch); the upstream remote's push URL is disabled.

**Not done, with reasons:** the upstream WMO commit (#6924) does not cherry-pick onto this base (its helper files post-date the fork), so the merge was re-implemented minimally; yt-dlp/streamlink for YouTube stations rejected (no CORS on googlevideo, ToS); RSSHub/RSS-Bridge for CNC3/Newsday deferred (CNC3 is Cloudflare-gated; see INTEGRATION-OPTIONS).
