# IPTV integration — handoff (2026-10-18)

State dump for whoever picks up the Trinidad & Tobago / Guyana live-TV work. Facts and reproduction
steps only. Companion docs: `docs/tt/IPTV-GEO-BLOCKING.md` (geo-blocking deep dive + egress runbook),
`docs/tt/WORKLOG.md` rounds 9–14, `TT_FOCUS.md` ("IPTV and geo-blocking", "IPTV directory").

## 1. What works today (verified on this Mac, 2026-10-18)

- **Directory** `public/data/iptv-directory.json`, built by `scripts/iptv-sync.mjs` from the iptv-org API
  (channels, streams, feeds, logos): 1,038 verified of 2,126 probed; 8 flagged `needsProxy` (no CORS);
  T&T 5 entries (Bizz TV, Riddim & Hope TV, Sankhya TV, Scorch TV, The Islamic Network); Guyana 3 (MTV
  Guyana; Little Guyana TV and GTN Canada via feed `broadcast_area`, field `broadcastTo`).
- **UI** Live News panel → Manage channels → "IPTV directory (iptv-org)" (`src/live-channels-window.ts`,
  `initIptvDirectory`): country filter (home country or `broadcastTo`), search across all countries,
  logos, labels ◷ Not 24/7 / geo-blocked / via hub proxy / via hub egress, one-click add to the strip
  (stored in localStorage `worldmonitor-live-channels` as `{ id, name, hlsUrl, useFallbackOnly: true }`).
- **Playback** headless Chrome (Playwright, `channel: 'chrome'`): Little Guyana TV plays direct at
  1280×720; GTN Canada plays through `/api/iptv-proxy` when an egress is configured; an earlier no-CORS
  entry (Ekushey TV) played through the proxy. hls.js path with `referrerPolicy: 'no-referrer'`
  (CDN77 rejects a Referer); native HLS only on WebKit.
- **Front door proxy** `/api/iptv-proxy?url=` in `scripts/tt-hub-server.mjs` (`serveIptvProxy`):
  https only, hostname must appear in `dist/data/iptv-directory.json` (reloaded every 60 s), manifest
  URL rewriting (segments, `URI="…"`), upstream stream errors destroy the response instead of the process
  (fixed in c3eec85d9). `hub.log` has 0 `iptv proxy error` / `host not in IPTV directory` lines.
- **Egress hook**: when the front door runs with `IPTV_EGRESS_PROXY` (set in
  `~/.config/worldmonitor/keys.env`, applied by `scripts/tt-hub-serve.sh` as `NODE_USE_ENV_PROXY=1` +
  `HTTPS_PROXY`, `NO_PROXY=127.0.0.1,localhost,youtube.com,www.youtube.com`), `/healthz` reports
  `iptvEgress: "host:port"` and the directory UI adds geo-blocked entries through the hub proxy
  (`viaHub()` in `src/live-channels-window.ts`). Verified with a local proxy as the egress (same exit
  address, so it proves routing only).

## 2. What fails or is unresolved — exactly

1. **Geo-blocked Guyana stream DTV-8** (`DTV8.gy`, `https://watch.davestv8.com/hls/stream.m3u8`):
   Cloudflare returns **403 for the whole host** (site root too) from this network (US, `cf-ray …-EWR`).
   It is a country rule, so no header/referrer change helps. The hub has **no in-region exit configured**
   (`/healthz` → `iptvEgress: null`; `keys.env` has no `IPTV_EGRESS_PROXY` / `EGRESS_SSH_TARGET`). Three
   egress routes are built and documented but **none has been exercised end to end**, because there is no
   device in the region, no VPN subscription and no Tailscale account in this session:
   - SSH tunnel to a box in the region: `scripts/tt-egress-proxy.mjs` (HTTP CONNECT/forward proxy,
     loopback-only, optional `EGRESS_ALLOW`), `scripts/tt-install-egress-tunnel.sh` (launchd agent
     `com.worldmonitor.tt-egress-tunnel`, `test` compares direct vs tunnelled exit IP).
   - Subscribed VPN in Docker: `scripts/tt-egress-vpn.compose.example.yml` (gluetun, `HTTPPROXY=on` on
     127.0.0.1:8888). NordVPN's public API lists Guyana (`gy1`), Trinidad (`tt3`,`tt4`), Barbados, Jamaica,
     all `virtual_location`; Surfshark has none of GY/TT. Whether a virtual GY address passes DTV-8's rule
     is unknown.
   - Free: `scripts/tt-egress-tailscale.compose.example.yml` (Tailscale container + the proxy sidecar in its
     network namespace). Trialled without login: starts on Docker Desktop, waits for login, sidecar answers.
     **Trap found:** containerboot defaults to userspace networking, which leaves the sidecar outside the
     tunnel; the example sets `TS_USERSPACE: "false"`. Exit-node hop untested.
2. **Dead upstreams in iptv-org's `countries/gy.m3u`** (probed 2026-10-18 with a browser UA + Origin):
   HGPTV 404 (`cdn-us-east-prod-ingest-infra-dacast-com.akamaized.net/8424fb7f-…/source/index.m3u8`),
   Ignite Television 404 (`rpn.bozztv.com/ignitelive/…/mono.m3u8`), GMTV 404
   (`livechannel.mdc.akamaized.net/stitch/livechannel/1341/master1400000.m3u8;session=…`). HGPTV therefore
   **dropped out of the directory** on the 2026-10-18 03:05 sync (it answered 200 again at 13:20 — the Dacast
   origin is intermittent, matching iptv-org's "Not 24/7"; the next `iptv-sync` run re-adds it) but is still
   hard-coded in the Guyana strip
   (`src/components/LiveNewsPanel.ts` ~line 218, `hgptv`, HLS only, no YouTube handle) — it shows the
   off-air/replay card while its CDN is down. NCN Guyana is YouTube-only (`@NCNGuyana`).
3. **T&T's main stations have no browser HLS** (TTT, CNC3, TV6, Parliament, Tobago Channel 5, IETV): they
   stream on YouTube only, with the off-air card / explicit replay (Anton: no auto-played recordings). The
   directory's T&T entries are five niche channels. `cso.gov.tt`-style WAFs are a news-feed issue, not IPTV.
4. **CBC TV8 Barbados** (`1740288887.rsc.cdn77.org/1740288887/index.m3u8`) timed out during the
   2026-10-17 sweep (CDN side) and signs off overnight; it has the `@cbcbarbados246` YouTube fallback.
5. **Validator** `node scripts/validate-live-channels.mjs --hls-only`: 2026-10-17 result 41/56 HLS passing
   (failures were upstream channels' CDNs + CBC TV8). Fresh run: see §6.
6. **iptv-org "Geo-blocked" label is advisory**: GTN Canada carries it yet plays from the US; of the 47
   flagged entries probed on 2026-10-17, 20 played, 17 served a manifest only, 10 were dead/blocked
   (`docs/tt/IPTV-GEO-BLOCKING.md` §1).
7. **Design limits worth knowing**: the proxy allowlist is *only* hosts present in the directory file, so a
   custom HLS URL that lacks CORS and is not in the directory cannot be proxied; channels added to the
   strip *before* egress was enabled keep their direct URL (remove + re-add); the directory only contains
   https streams without `referrer`/`user_agent` requirements (iptv-org marks those; the browser cannot
   send them and the hub does not spoof them).

## 3. How to reproduce

```bash
# Directory rebuild (≈6–8 min, 24 in flight): writes public/data/iptv-directory.json
node scripts/iptv-sync.mjs --concurrency 24
# Guyana playlist probe (what iptv-org lists vs what answers from here)
curl -s https://iptv-org.github.io/iptv/countries/gy.m3u | grep -A1 '^#EXTINF' | grep '^http' | \
  while read u; do printf '%s ' "$u"; curl -s -o /dev/null -m 12 -A "Mozilla/5.0" -w '%{http_code}\n' "$u"; done
# DTV-8 country block (403 on the host root as well)
curl -sI -A "Mozilla/5.0" https://watch.davestv8.com/hls/stream.m3u8 | head -3
# Hub state
curl -s http://127.0.0.1:3100/healthz        # {"ok":true,"dist":true,"sidecarPort":46123,"iptvEgress":null}
bash scripts/tt-install-service.sh status
# Proxy allow/deny
curl -s -o /dev/null -w '%{http_code}\n' "http://127.0.0.1:3100/api/iptv-proxy?url=https%3A%2F%2Fstream.mtvgy.com%2Fmtvguyana%2Findex.fmp4.m3u8"   # 200
curl -s -w '%{http_code}\n' "http://127.0.0.1:3100/api/iptv-proxy?url=https%3A%2F%2Fexample.com%2Fx.m3u8"                                         # 403 host not in IPTV directory
# Egress plumbing without touching the service: local proxy + second front door on :3199
EGRESS_PORT=8889 node scripts/tt-egress-proxy.mjs &
NODE_USE_ENV_PROXY=1 HTTPS_PROXY=http://127.0.0.1:8889 HTTP_PROXY=http://127.0.0.1:8889 \
  NO_PROXY=127.0.0.1,localhost HUB_PORT=3199 node scripts/tt-hub-server.mjs &
curl -s http://127.0.0.1:3199/healthz        # iptvEgress "127.0.0.1:8889"; the proxy log shows CONNECT lines
# Tailscale egress trial (no login): containers start, `tailscale status` prints the login URL
cp scripts/tt-egress-tailscale.compose.example.yml /tmp/t/compose.yml && cp scripts/tt-egress-proxy.mjs /tmp/t/ && \
  (cd /tmp/t && EGRESS_LOCAL_PORT=8890 docker compose -p tt-egress-trial up -d && docker exec tt-egress-tailscale tailscale status)
```

Headless UI checks used (Playwright with Google Chrome, Chromium lacks H.264; scripts lived in `/tmp`, so
recreate): open `/dashboard`, click `[data-panel="live-news"] .live-news-settings-btn`, wait for
`#liveChannelsIptvCountry option[value="GY"]` with `state: 'attached'` (options are "hidden" to
Playwright), `selectOption('GY')`, read `#liveChannelsIptvResults .live-news-manage-available-row`, click
`.live-news-iptv-add`, press Escape, click `[data-panel="live-news"] .live-channel-btn` with the channel
name, click "play live feed" if present, then poll the `<video>` for `videoWidth > 0 && currentTime > 1`.
Note: Chrome defers media in hidden tabs; headless or a foreground window is required.

## 4. What was tried, in order

| Round | Change | Outcome |
|---|---|---|
| 9 | iptv-org directory (channel country scope, probe 200 + `#EXTM3U` + CORS) | 985 verified; CORS-less streams excluded |
| 9 | Logos + Not 24/7 / Geo-blocked labels | labels advisory |
| 9 | Geo-blocking deep dive; 47 flagged entries probed | 20 play, 17 manifest-only, 10 dead/blocked; decided: no circumvention shipped |
| 9 | Same-origin `/api/iptv-proxy` for no-CORS streams; search spans countries | plays (Ekushey TV); allowlist = directory hosts |
| 10 | Anton pushed for "proxies from GitHub" | declined public lists (dead/hostile); added operator-controlled `IPTV_EGRESS_PROXY` instead |
| 10 | Proxy crash on upstream stream error | fixed (error handlers) |
| 12 | Guyana `gy.m3u` providers | 3 of 7 answer; sync scoped by home country only → now also feed `broadcast_area` (`broadcastTo`); 1,038 verified |
| 13 | Egress gap: geo-blocked + CORS streams bypassed the hub proxy | UI routes geo-blocked entries via hub when `/healthz` reports egress; SSH-tunnel proxy + launchd tunnel installer |
| 13 | iptv-proxy / kptv-proxy (re-servers) evaluated | no CORS on stream output, only change region if run in-region; left optional |
| 13 | VPN providers' public server lists | NordVPN GY/TT virtual locations; gluetun compose example |
| 14 | Free options: Tor (0 relays in GY/TT/BB/JM/SR), open proxy lists (0 GY/TT entries, counted only), free VPN tiers, cloud regions | none viable; Tailscale exit-node compose example; `TS_USERSPACE=false` required |

## 5. Relevant files

| File | Role |
|---|---|
| `scripts/iptv-sync.mjs` | builds the directory from iptv-org API; `COUNTRIES`, `reaches` (broadcast_area), `probe()`, `needsProxy`, `byCountry` |
| `public/data/iptv-directory.json` | generated; also the proxy allowlist source (served copy in `dist/data/`) |
| `src/live-channels-window.ts` | Manage-channels window: `initIptvDirectory`, `servesCountry`, `viaHub`, add-to-strip |
| `src/components/LiveNewsPanel.ts` | player (hls.js/native, off-air card), default strips incl. Caribbean HLS (~lines 206–222), `.live-channel-btn` |
| `scripts/tt-hub-server.mjs` | GA front door: `serveIptvProxy`, `loadIptvHosts`, `/healthz` (`iptvEgress`) |
| `scripts/tt-hub-serve.sh` | launchd runner; applies `IPTV_EGRESS_PROXY` to the front door only |
| `scripts/tt-egress-proxy.mjs`, `scripts/tt-install-egress-tunnel.sh` | SSH-tunnel egress route |
| `scripts/tt-egress-vpn.compose.example.yml` | gluetun (subscribed VPN) egress route |
| `scripts/tt-egress-tailscale.compose.example.yml` | Tailscale exit-node (free) egress route |
| `scripts/validate-live-channels.mjs` | HLS/YouTube validator for the built-in strips |
| `docs/tt/IPTV-GEO-BLOCKING.md` | classification of geo-blocked entries, egress runbooks (SSH / VPN / Tailscale), viability table |
| `.claude/agents/tt-iptv-curator.md`, `.claude/agents/tt-hub-operator.md`, `.claude/skills/tt-hub/SKILL.md` | operating notes |

## 6. Current state of the hub and egress

- Service `com.worldmonitor.tt-hub` running (launchd, `pid` in `tt-install-service.sh status`), front door
  `127.0.0.1:3100`, sidecar `:46123`, Claude shim `:8788`; last build/restart 2026-10-18 after commit
  d8150c553 (egress routing); `/healthz` → `iptvEgress: null`.
- `~/.config/worldmonitor/keys.env` keys present (names only): ALPHA_VANTAGE_API_KEY, EIA_API_KEY,
  UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN, ACLED_EMAIL, ACLED_PASSWORD. No egress variables.
- Rebuild after code changes: `npm run build:full && node scripts/build-sidecar-handlers.mjs && bash scripts/tt-install-service.sh restart`.
- Validator, fresh run 2026-10-18 13:20 EDT (`--hls-only`): **42/56** HLS reachable with a valid manifest. All
  30 Caribbean entries pass (Bizz, Sankhya, Scorch, Riddim & Hope, Islamic Network, **HGPTV back to 200**,
  MTV Guyana, Little Guyana TV, CBC TV8, TVJ, GNN, DBS, Pointe, ZNS, ZIZ, Nevis, Hot 7, Guardian Talk,
  Fame 95, Antena 7, Noticias 16, TV Martí, Prensa Latina, Haiti News, RTH TV1, Telemundo PR, teleSUR ×2,
  Venevisión, Canal I). The 14 failures are upstream (non-Caribbean) channels: CTV News, Reuters TV, The
  Guardian, Phoenix 403, Record News 400, ABP News, Al Qahera 503, Press TV, Rudaw (200 but no manifest),
  SABC 403, ERT 404, TV5 Monde Info 403, NRK1 400, Al Jazeera Balkans.
- Git: all of the above is on `main` of the fork `dmvevents/worldmonitor` (HEAD 03700da98 before this
  file). `origin` (koala73) has push disabled by design. Another worktree exists at
  `.worktrees/hermes-63de1a95` on branch `hermes/hermes-63de1a95`, created from 03700da98.

## 7. Constraints Anton set (facts, for context)

Public news and official sources only, aggregate/topic level; actual live TV, never auto-played
recordings; no public proxy lists, no header/referrer spoofing, no circumvention shipped — the operator
supplies an exit they are entitled to use; never read `.env*` files; never push to koala73's upstream.

## 8. Open questions

- Does NordVPN's virtual Guyana address pass DTV-8's Cloudflare country rule? Untested.
- Does DTV-8 have an official YouTube/Facebook live that could serve as fallback? Its site 403s from here.
- Has HGPTV's Dacast ingest URL rotated (Dacast ids change) rather than the station going dark? iptv-org
  may update it; a re-sync picks that up.
- Is there any T&T station with a browser-playable HLS beyond the five niche channels? None found in
  iptv-org as of 2026-10-18.
