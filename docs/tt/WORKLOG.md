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

## Round 9: main branch, IPTV geo deep dive, more integrations (2026-10-18)

**Goal:** Make the hub the fork's main branch, settle the geo-blocking question honestly, and land the next integrations end to end.

**What was done:**

- Fork branches renamed through the GitHub API: the old `main` (upstream copy) became `upstream-main`, `tt-focus` became `main` and is the default branch. Local branch renamed to `main`, tracking `fork/main`. No force-push.
- IPTV: `scripts/iptv-sync.mjs` keeps no-CORS https streams flagged `needsProxy`; the front door gained `/api/iptv-proxy` (closed allowlist = hostnames in the directory, https only, manifest rewriting, streamed segments); the channel manager routes such entries through it and labels them "via hub proxy". The player accepts same-origin HLS URLs.
- Geo-blocking deep dive (`docs/tt/IPTV-GEO-BLOCKING.md`): of 47 "Geo-blocked" entries probed from this network, 20 play, 10 are dead, 1 is IP-blocked on segments; the label is advisory. Only 4 of 444 Caribbean https streams lack CORS. Position: no circumvention shipped; a proxy changes the fetching origin, not the location.
- Live Intelligence: Caribbean & Guiana Shield GDELT topic (seed, client, strings); `GDELT_SOFT_BUDGET_MS` override so self-hosted runs can finish all topics.
- Docs regenerated and the runbook updated.

**Verified:** typecheck, locale sync, proxy allow/deny probes against the service, headless channel-manager check.

- Follow-up: `IPTV_EGRESS_PROXY` egress setting for operator-controlled network exits (Node `NODE_USE_ENV_PROXY`); public proxy lists explicitly not supported.

## Round 10: end-to-end test sweep (2026-10-18)

**Goal:** Exercise every surface of the GA hub and fix what the sweep found.

**Gates run:** frontend and API typecheck, repository lint, boundary lint, docs-stats check, safe-HTML guard, `test:data`, `test:sidecar`, live-channel validator, production build plus sidecar bundles, GA service probes (health, session mint, market and commodity quotes, bootstrap weather alerts, YouTube resolver, RSS proxy, IPTV proxy allow and deny, Claude brief), headless audits (four tabs with wheel zoom, live TV direct and proxied, IPTV manager add-and-play).

**Found and fixed:**

- The IPTV proxy could crash the front door on an upstream stream error (one unhandled `error` event on the piped Readable in the service log); the response is now destroyed instead and launchd no longer has to restart the stack.
- `cso.gov.tt` returns 403 to browser user agents, which the sidecar's RSS proxy sends, so the direct CSO feed never loaded; it now goes through a Google News `site:` query like the other blocked official sites, and the server inventory docs list it.
- `tests/edge-functions.test.mjs` flagged the gitignored sidecar bundles (`api/<domain>/v1/[rpc].js`) as edge functions importing `node:` built-ins; they are Node artifacts next to the deployed TS gateways and are now skipped.

**Known, not fixed:** CBC TV8's CDN was timing out during the sweep (external); GDELT rate-limits this network so Live Intelligence stays empty until it relents; `test:sidecar` has one port-collision failure while the service holds 46123 (passes with the port free); the per-IP API rate limiter can return 429 on first-load bursts of the summarization endpoint (panels retry).

**Workarounds added after the sweep:** GDELT seed rotates one topic per pass (`GDELT_TOPICS_PER_RUN`), AI Forecasts generated daily through the Claude shim (`FORECAST_LLM_*_PROVIDER_ORDER=generic`; first run 3 forecasts), rate limiter bypass for loopback clients in docker mode (both mirrors, tests pass), CBC TV8 gains a YouTube fallback handle for its overnight HLS sign-off.

## Round 11: the missing panels (2026-10-18)

Anton's screenshots of the GA hub on `127.0.0.1:3100` showed the Trinidad and Guyana tabs with only the
shared panels (Latin America, World News, Energy, World Clock, My Monitors) and none of their own. Root
cause: `buildPresetTab` only toggled keys already present in the host variant's panel settings, and the
full variant's defaults never list `tt-*` / `gy-*` panels. It had worked in development only because that
browser origin carried leftover settings from running the `tt` variant on the same port. Fix: preset tabs
now add their panels from the cross-variant registry with the source variant's config, and `healPresetTabs`
repairs already-seeded preset tabs whose enabled set is a strict subset of the preset. The "TECH" pill in
the header is the variant switcher, not the active variant.

Follow-ups in the same round: the restored active tab is re-applied at boot when it enables panels the
boot set never created (switching tabs is a no-op for the active tab), and the repair also covers a preset
tab whose snapshot was overwritten by an older build with shared panels only (none of its own panels
enabled). Verified headless in four scenarios: fresh profile, old seed, restore-at-boot, overwritten snapshot.

Final follow-up (2026-10-18): the restore-at-boot check compared key presence, but an older build had persisted
the preset's panels into the boot set as *disabled* entries, so it never fired; it now compares enabled state.
Anton's Chrome tab on `127.0.0.1:3100` shows all eight `tt-*` panels on the Trinidad tab after reload.

## Round 12: Guyana providers in the iptv-org playlist (2026-10-18)

Anton pointed at `https://iptv-org.github.io/iptv/countries/gy.m3u`. Probed from this machine, its seven entries
split into: MTV Guyana, Little Guyana TV and GTN Canada answering with a manifest and CORS (GTN with iptv-org's
advisory "Geo-blocked" label); HGPTV (Dacast), Ignite Television (bozztv) and GMTV (Akamai) 404; DTV-8 403
(geo-blocked). Only HGPTV and MTV Guyana had been in the hub's directory because `iptv-sync` scoped channels by
their *home country* while iptv-org's country playlists use the feed's `broadcast_area`: Little Guyana TV is a
US channel and GTN Canada a Canadian one, both broadcasting to Guyana. The sync now also reads `feeds.json`,
keeps channels whose feeds broadcast into a scoped country, records `broadcastTo` (46 diaspora channels, mostly
for Puerto Rico, Venezuela, the Dominican Republic and Haiti) and counts them in `byCountry`; the directory UI's
country filter and search match `broadcastTo`, and the meta line reads "United States → Guyana". Directory
rebuilt: 1,038 verified of 2,126 probed (HGPTV dropped out while its Dacast URL is down; it stays in the Guyana
strip as a YouTube-fallback channel). No circumvention added: the geo-blocked label stays advisory
(`docs/tt/IPTV-GEO-BLOCKING.md`).

## Round 13: egress for geo-blocked streams, step by step (2026-10-18)

Anton asked how to work around the Guyana geo-blocks (DTV-8 is a Cloudflare country rule on the whole host)
and to integrate it end to end. The existing `IPTV_EGRESS_PROXY` setting had a gap: only no-CORS channels
went through the hub proxy, so a geo-blocked channel with CORS was still fetched from the browser's own IP
and the egress never saw it. The directory UI now reads `/healthz`; when `iptvEgress` is reported,
geo-blocked entries are added through `/api/iptv-proxy` (meta "via hub egress (host)"). New helpers:
`scripts/tt-egress-proxy.mjs` (dependency-free HTTP CONNECT/forward proxy, loopback-only by default,
optional host allowlist, logs host:port only) to run on a machine in the region, and
`scripts/tt-install-egress-tunnel.sh` (launchd agent `com.worldmonitor.tt-egress-tunnel` keeping
`ssh -N -L 8888:127.0.0.1:8888` alive, `test` subcommand compares direct vs tunnelled exit IP). Runbook in
`docs/tt/IPTV-GEO-BLOCKING.md`. Boundaries unchanged: the operator supplies an exit they are entitled to
use; no proxy discovery, public lists or header spoofing.

Follow-up (2026-10-18): Anton shared iptv-proxy, kptv-proxy and a VPN vendor's geo-blocking guide. The two
proxies are IPTV re-servers (M3U/Xtream → your own address); they only change region when run on an
in-region machine, send no CORS on stream output, and overlap the hub's own HLS proxy and directory, so they
stay optional (iptv-proxy is worth it if the remote box should also serve a playlist to other devices).
For the VPN route, the providers' public server lists were checked: NordVPN exposes Guyana, Trinidad,
Barbados and Jamaica as virtual locations; Surfshark has none of GY/TT. Added
`scripts/tt-egress-vpn.compose.example.yml` (gluetun with its HTTP proxy on loopback :8888) so a subscribed
VPN plugs into `IPTV_EGRESS_PROXY` without routing the rest of the Mac; runbook extended.

## Round 14: free, open-source egress through Docker (2026-10-18)

Anton asked for a free and open-source way to route around the Guyana geo-blocks through Docker. Checked
the free techniques first: Tor has zero running relays in GY/TT/BB/JM/SR (Onionoo); the monosans open-proxy
list (1,219 entries with geolocation) has zero GY/TT/BB/JM proxies (counted, never connected); free VPN tiers
have no Caribbean exits; no cloud has a region there. The viable free route is a device someone you know runs
in the region as a Tailscale exit node (free Personal plan, open-source clients, Headscale for a self-hosted
control server; Android, Apple TV, Linux, macOS, Windows can advertise exit nodes, iOS cannot). Added
`scripts/tt-egress-tailscale.compose.example.yml`: Tailscale container (kernel mode, TUN) plus the hub's
`tt-egress-proxy.mjs` sidecar sharing its network namespace, published on `127.0.0.1:8888` for
`IPTV_EGRESS_PROXY`. Trial on this Mac without a tailnet login: stack starts on Docker Desktop, tailscaled
comes up in kernel/TUN mode and waits for login (first trial exposed that containerboot defaults to userspace
networking, which would have left the sidecar outside the tunnel; `TS_USERSPACE=false` fixes it), proxy answers on the published port through Docker's egress. The exit-node hop
is untested until a device in the region joins. Runbook extended with the viability table and bandwidth note.

## Round 15: live T&T television through the broadcasters' own player (2026-10-18, Hermes)

Takeover of the IPTV integration. Re-verification showed the existing plumbing (iptv-org directory, hub
proxy, egress hook, Trinidad tab) working; what failed for the viewer was that TTT, CNC3, TV6 and Parliament
were YouTube-only and off air, so the T&T strip had no live television. `ttt.live/stream` embeds the TegoTV
web player; its `player.js` resolves a 24 h guest token from `api.siberapi.com` and asks the Siber middleware
for the channel's Flussonic HLS URL (`tego-cdn*.sibercdn.com`, signed token, CORS `*`, not IP-bound). The hub
now does the same guest flow server-side (`scripts/tt-tego-resolver.mjs`, `/api/tego/stream`,
`/api/tego/channels`) and the player resolves `tegoChannel` entries at play time with one forced re-resolve
on token expiry. Eleven stations added (TTT, ieTV, Synergy TV, Gayelle, WPG 10, TV Jaagriti, Trinity TV,
Bhakti TV, IBN, WACK Visual Radio, Plus TV); the `tt` strip opens with TTT. CNC3 (Cloudflare challenge) and
TV6 (owner-restricted Dailymotion) remain YouTube-only. Verified: typecheck, 61 + 7 tests, validator 11/11,
TTT/IETV/Synergy/Gayelle playing in headless Chrome on a second front door (:3199). Details and the exact
endpoint flow: `docs/tt/IPTV-HANDOFF.md` §9.

Follow-up (2026-10-18, shipped): searched iptv-org and GitHub IPTV repos for CNC3/TV6 — both broadcasters
stream live only through Dailymotion embeds locked to their own domains (DM016 elsewhere), and the only
third-party CNC3 sources are dead relays or pirate re-servers; nothing legitimate to wire in. Their off-air
cards now link to the official live pages in a new tab (never framed). ABS TV Antigua added via TegoTV. Merged
to main (198851903), built and restarted the hub; verified on :3100 (TTT 1280×720, `/api/tego/channels` 12
entries). Full `test:data`: 14,568/14,575 pass, one pre-existing unrelated failure. Details: IPTV-HANDOFF §9.1.

Guyana (2026-10-18, shipped): audit showed HGPTV/MTV Guyana/Little Guyana TV playing and NCN never live because
the strip used `@NCNGuyana` while ncnguyana.com/live links `@ncn.guyana`. Strip now opens on the four always-live
HLS stations (GTN Canada added), then NCN, DTV-8 (`@DavesTV8`; its HLS is a Cloudflare country rule), Ignite
News and Parliament of Guyana with YouTube auto-detect and official-page links on the off-air card. E-Networks
(WAF), GMTV (404), GTN US stations (parked portal) and CTV19 (Twitch) have no usable stream. T&T Parliament and
Tobago Channel 5 cards also link their sites. 78/78 tests; verified on :3100. Details: IPTV-HANDOFF §9.2.

## Round 16: tabs structured for their purpose (2026-10-18)

Brief from Anton via the lead: the main tab felt like an AI dashboard; Guyana should show Guyana news; most
tabs should lead with news. Audit (`docs/tt/TABS-AUDIT.md`): Anton's Main tab had 8 panels (AI Insights,
AI/ML, Technology, Tech Readiness, Markets, map, live strip, monitors) — a layout seeded while another variant
was active; a fresh profile captured 80 panels in registry order with the intelligence block first. The `full`
default is `FULL_PANELS` in `src/config/panels.ts` (81 of 102 enabled; the shorter `variants/full.ts` is
only descriptive). Guyana and T&T tabs already showed national news; the gaps were feed-level.

Changes: (1) `orderNewsFirst` — every preset tab orders map → live strip → news lenses → the rest; untouched
preset tabs pick the order up on boot. (2) One-time re-seed of the variant's own default tab to the variant
default plus hub extras (`PRESET_EXTRA_PANELS`: Caribbean lens, world clock for `full`), marker
`worldmonitor-tabs-default-reseed-v1:<variant>`; runs before `createPanels()` so the boot set matches.
(3) Boot restore compares enabled state in both directions. (4) Feeds: `tt-news` leads Guardian, Express,
Newsday, CNC3, TV6, TTT, adds Wired868 (Google News site query; its feed 403s), drops Power 102 (feed
stopped 2023), no Loop TT (closed); `gy-news` leads Stabroek, Kaieteur, Chronicle, News Room, Demerara Waves,
iNews, Guyana Times, Village Voice, with Kaieteur on its direct feed `https://kaieteurnewsonline.com/feed/`
(the www host 301s and the RSS proxy does not follow redirects). Client, server and `docs/data-sources.mdx`
rows kept in sync (parity tests).

Verification: tsc clean; 71 tests across dashboard-tab-presets, feeds-client-server-parity,
news-digest-methodology-parity, news-feed-key-parity, docs-signal-alignment, completeness-measurement,
feeds-time-gate (plus 2 new preset tests); Biome, boundaries and `sync:locales:check` clean; 147 feeds probed
(137 with items), added/changed URLs fetched and counted; hub rebuilt and restarted twice; headless
first-boot check of all four tabs (table in the audit). Regression caught in the first build: applying the
re-seeded tab after boot left other tabs' lazily mounted lenses as shells until reload — fixed by moving the
re-seed before panel creation. Open item: the post-boot `applyTabPanelState` path may have the same effect
when a restored tab differs from the boot set; not changed here.

Alignment pass after the Hermes merge (2026-10-18 evening): verified on the hub — `/api/tego/channels` lists
12 stations, `/api/tego/stream?channel=1` returns TTT's signed manifest, the Trinidad tab's strip opens with
TTT, IETV, Synergy TV and Gayelle and TTT plays at 1280×720 in headless Chrome; Hermes's tests pass with the
rest (294 across resolver, live-news HLS, edge-function and preset suites); API contract lint and
`typecheck:api` clean; validator 51/68 (Trinity TV and WACK 404 upstream this evening, CBC TV8 timeout).
Docs that still said "TTT, CNC3, TV6 are YouTube-only" were updated: TT_FOCUS (Live TV row, strip paragraph,
IPTV paragraph), HOW-IT-WORKS (front-door routes, decision tree, verified channels), the hub skill, the IPTV
curator agent, and a supersede note at the top of IPTV-HANDOFF. No code changed in the IPTV lane.

## Round 17: what people are talking about, and the summaries that were not working (2026-10-18)

Anton asked for social-media conversation feeds (Facebook, X, Instagram…) with a summary, and said the
chat and summary generation were not working. Findings: AI Insights was empty because `seed-insights.mjs`
only knew Ollama/OpenRouter/Groq (no provider on the hub) — added the `generic` OpenAI-compatible provider
(LLM_API_URL = the Claude shim), the seed now runs every loop pass (client staleness is 60 min) and warms
the digest through the local front door; first run produced the 8-story world brief, verified in the panel.
The WM Analyst chat answered "No local handler" — the edge function is now bundled into `dist/hub/` and
served by the front door with the operator key; a question about T&T/Guyana streamed a Claude answer in
10 s (it reasons over the global digest plus market/energy keys, so it says regional reporting is thin —
the regional lenses are not in its context). The shim floors `max_tokens` at 160 because classify-event's
50-token budget cut Claude's JSON and `validate()` rejected it. Social sources checked from this network:
Reddit 403/429 unauthenticated (needs a free API app → also fills Social Velocity), Bluesky search 403,
Facebook/Instagram no public feeds, X paid, Telegram needs the relay; working keyless: Google Trends TT,
Mastodon hashtags, Google News social queries → new `tt-social` / `gy-social` "Street Pulse" lenses (client,
server, docs inventory 89 rows, digest titles), with a title fallback in the RSS parser for untitled items.
Verified headless: Street Pulse 10 items on T&T, 9 on Guyana; Insights world brief renders on Main.
Tests: 158 across presets, feed parity, docs inventory, RSS and insights suites; tsc, Biome, boundaries clean.
