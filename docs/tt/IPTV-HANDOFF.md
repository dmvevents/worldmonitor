# IPTV integration — handoff (2026-10-18)

State dump for whoever picks up the Trinidad & Tobago / Guyana live-TV work. Facts and reproduction
steps only. Companion docs: `docs/tt/IPTV-GEO-BLOCKING.md` (geo-blocking deep dive + egress runbook),
`docs/tt/WORKLOG.md` rounds 9–14, `TT_FOCUS.md` ("IPTV and geo-blocking", "IPTV directory").

> **Update 2026-10-18 (evening):** §9 below supersedes the T&T station statements in §1–§2 (item 3 in
> particular): TTT, IETV, Synergy TV, Gayelle and six more T&T stations now play live through the
> broadcasters' TegoTV player; CNC3 and TV6 remain YouTube/off-air cards with official-page links. The
> merge is on `main` (198851903, cbf1dcd17), the hub runs it, and the hub docs (TT_FOCUS, HOW-IT-WORKS,
> skill, curator agent) were aligned to it in the tabs round. §9.2 (Guyana, merges c16657b81/0ee195146)
> and §9.3 (comprehensive GY/TT strips, merge f0d32c955; WORKLOG Round 18) extend it; the headless
> :3100 sweep in §9.3 is the current source of truth for what is in each strip. Social-media "pulse"
> feeds (TikTok/Instagram/Facebook) were asked for but are out of this handoff's scope — see WORKLOG
> Round 17 (Street Pulse lenses) for what exists keyless today.

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
- ~~Is there any T&T station with a browser-playable HLS beyond the five niche channels?~~ **Answered
  2026-10-18, see §9.**

## 9. Resolution: T&T free-to-air stations via TegoTV (2026-10-18, Hermes takeover)

**What was actually failing.** Every surface in §1 worked when re-verified (the five iptv-org T&T
streams play, the directory filter and proxy behave, the Trinidad tab renders). The visible failure was
that the T&T strip's headline stations — TTT, CNC3, TV6, Parliament — were YouTube-handle channels that
are almost never live, so the panel showed off-air cards and the hub had no live T&T television.

**Where TTT's stream really lives.** `https://www.ttt.live/stream/` embeds
`https://player.tegotv.com/player.php?channel=1` (Radiant Media Player + hls.js). Reading its `player.js`
shows a public guest flow with no credentials:

1. `GET https://api.siberapi.com/sso/get_guest_token.php?app_id=1` → guest JWT (24 h, `CORS: *`).
2. `GET https://mw.siberapi.com/api/ui/stb/v3/Channels/<id>?device_id=AA:AA:AA:AA:AA:AA&device=web&application_id=1`
   with `Authorization: Bearer <jwt>` → `tv_channel[0].streaming_url`.
3. That URL is a Flussonic HLS manifest on `tego-cdn{1a,2a}.sibercdn.com` with a signed `token=` whose
   lifetime is 24 h and which is **not bound to the client IP** (resolved over IPv6, played over IPv4).
   Manifest, variants and `.ts` segments all answer `Access-Control-Allow-Origin: *`, so hls.js plays
   them directly; the hub proxies no media.

This is exactly what the broadcaster's own public player does for an anonymous visitor: same endpoints,
guest account, the free "TegoTV - Free TV Channels" package only. No header spoofing, no circumvention,
no region change. The TegoTV category "Trinidad and Tobago Local Stations" (cat 11) plus TTT's category
(36) list 12 stations; 10 play end to end from here (TTT 1, Synergy TV 2, Gayelle The Caribbean 3,
TV Jaagriti 5, Trinity TV 6, Bhakti TV 7, IBN 8, WACK 90.1 Visual Radio 9, ieTV 11, Plus TV 13; also
WPG 10 (4) from "Caribbean TV Channels"). Universal Church (27) and Real TV (16) 404 upstream.

**Still not solvable in a browser.** CNC3's site sits behind a Cloudflare JS challenge (403 to curl,
"Just a moment" in headless Chrome). TV6's watch-live page embeds Dailymotion video `x7x3klh`, whose
metadata API answers `DM016 "TV6TNT has limited its access"` — owner-restricted to their own site. Both
stay YouTube/off-air-card channels.

**What was built** (branch `hermes/hermes-63de1a95`):

| File | Change |
|---|---|
| `scripts/tt-tego-resolver.mjs` | New. Guest token (cached to JWT exp), `resolveTegoStream(id)` (cached until 10 min before the Flussonic token expires, in-flight coalescing, only `*.sibercdn.com` https URLs accepted), `listTegoChannels()` for cats 36/11. |
| `scripts/tt-hub-server.mjs` | `GET /api/tego/stream?channel=N[&force=1]` → `{ id, name, provider, logo, url, expiresAt }`; `GET /api/tego/channels` catalogue. Both served by the front door, like `/api/iptv-proxy`. |
| `src/services/tego-live.ts` | New. Browser-side `resolveTegoStreamUrl(channel, force)` with the same expiry-aware cache. |
| `src/components/LiveNewsPanel.ts` | `LiveChannel.tegoChannel?: number`; `hasHlsSource()` treats it as an always-live HLS source; `renderNativeHlsPlayer` resolves the URL at play time and, on the first fatal hls.js error, re-resolves once with `force=1` (expired token) before the usual 5-min cooldown. TTT (1) and IETV (11) keep their YouTube handles as fallback; nine more stations added to `OPTIONAL_LIVE_CHANNELS` and the Caribbean picker. |
| `src/config/live-channel-defaults.ts` | `tt` strip now opens with TTT, IETV, Synergy TV, Gayelle, then the previous set. |
| `src/live-channels-window.ts` | Picker cards show "live TV · TegoTV" / "live TV · HLS" where there is no YouTube handle; custom channels may carry `tegoChannel`. |
| `scripts/validate-live-channels.mjs` | Resolves `tegoChannel` entries through the resolver before probing (11/11 OK on 2026-10-18). |
| `tests/tt-tego-resolver.test.mjs` | 7 unit tests with a mocked fetch (token reuse, caching, expiry, host allowlist, coalescing). `tests/live-news-hls.test.mjs` updated for `hasHlsSource` / `tegoChannel`. |

**Verified.** `tsc --noEmit` clean; `tests/live-news-hls.test.mjs` + `live-news-panel-guard` 61/61;
resolver tests 7/7; validator 11/11 TegoTV entries OK. A second front door
(`HUB_PORT=3199 SIDECAR_PORT=3100 node scripts/tt-hub-server.mjs`, `/api/*` passed through to the running
hub) served the rebuilt SPA: on the Trinidad & Tobago tab TTT, IETV, Synergy TV and Gayelle each played
in headless Chrome (1280×720 / 1024×576, hls.js, `currentTime` advancing) within ~10 s of a click.

**Operational notes.** The token endpoint is anonymous today; if TegoTV adds Origin/Referer checks the
resolver (which sends only a browser UA) needs a re-look. Tokens are per resolve, so one hub resolve is
shared by every browser tab for up to 24 h. Rebuild + restart the GA hub to ship:
`npm run build:full && node scripts/build-sidecar-handlers.mjs && bash scripts/tt-install-service.sh restart`.

### 9.1 Follow-up: CNC3 / TV6 search, official-page links, shipped to the hub (2026-10-18)

**Search of iptv-org and GitHub `topic:iptv` for CNC3 / TV6.** iptv-org's database lists 41 T&T channels
with streams for only six; its issue #49617 ("Add: CNC3 SD", Aug 2026) proposed `https://cnc3live.com/`,
labelled geo-blocked, and was rejected as malformed — that host answers 403 from Cloudflare to curl,
headless Chrome and a Googlebot UA alike. Issue #21479 (May 2025) *removed* TTT/Synergy/Plus TV because the
TegoTV token URLs expire, which is exactly what `/api/tego/stream` works around. Free-TV/IPTV lists six T&T
stations through `sktv-forwarders.7m.pl`, a dead relay (302 → 404; their own checker flags all six).
`fraudiay79/strm` carries `platforms/tego.py` with the same siberapi guest flow (independent confirmation).
Other hits are pirate re-servers (iptvmate, a Chinese multicast relay, a 2015 `rtmp://live.cnc3.co.tt`) —
not used. `kenz-01/kulchaflo-tv-browser-mk2` documents CNC3's official live as `cnc3.co.tt/live-stream` →
Dailymotion video `x9vba4u` (owner `cnc3tt`, mode live). Dailymotion's player metadata answers `DM016 "cnc3tt
has limited its access"` for any embedder other than cnc3.co.tt, and `DM003` (not available / off air) with
cnc3.co.tt as embedder; TV6's `x7x3klh` has `allow_embed: false` and the same DM016. **Both stations are
embed-locked to their own domains**; Referer/embedder spoofing and framing the Cloudflare-gated pages are
excluded, so they stay off-air-card channels.

**Added (ccbffd07d).** `LiveChannel.officialLiveUrl`: the off-air card for CNC3 and TV6 now shows a plain
external link "Watch on cnc3.co.tt" / "Watch on tv6tnt.com" (`target=_blank rel=noopener noreferrer`,
`sanitizeUrl`, https only; never framed or proxied). YouTube auto-detect on their handles is unchanged. ABS TV
(Antigua & Barbuda), TegoTV id 10, added to the Caribbean picker. New locale key
`components.liveNews.watchOnOfficialSite` synced to all 24 locales. Tests: `tests/live-news-hls.test.mjs`
section 12 (TegoTV ids present and in the picker, no hard-coded sibercdn URLs, resolver wiring, official links
are sanitized links not iframes, front door validates the channel id).

**Gates.** `tsc --noEmit` clean; `sync:locales:check` 24/24; `tests/live-news-hls` + `tt-tego-resolver` +
`live-news-panel-guard` 73/73; validator 12/12 TegoTV entries OK; full `npm run test:data` 14,568 pass /
1 fail / 6 skipped of 14,575 — the one failure (`stock-dividend-profile` "produces a non-zero CAGR…") fails
identically on `main` before the merge and is unrelated (Yahoo dividend fixture).

**Shipped.** Merged to `main` as 198851903 (local `.gitignore` edit and `.omc/` stashed around the merge
and restored). Build (`build:full`, sidecar handlers) and `tt-install-service.sh restart` →
`com.worldmonitor.tt-hub` pid 80673. Verified on `127.0.0.1:3100`: `/healthz` ok; `GET /api/tego/channels`
→ 12 channels; `GET /api/tego/stream?channel=1` → TTT manifest URL; `channel=abc` → 400. Headless Chrome,
Trinidad & Tobago tab: strip opens TTT, IETV, Synergy TV, Gayelle, Bizz TV, CNC3, TV6 News, Parliament,
Tobago Updates, CBC TV8, ZIZ TV, teleSUR, SkyNews, AlJazeera; TTT plays at 1280×720 within 10 s; CNC3 card
reads "CNC3 is off air right now" with the cnc3.co.tt link; TV6 card links tv6tnt.com; ABS TV (Antigua)
appears in the Caribbean picker as "live TV · TegoTV".

### 9.2 Guyana strip (2026-10-18)

**Audit on the hub (Guyana tab):** HGPTV 1280×720, MTV Guyana 1920×1080, Little Guyana TV 1280×720 and
teleSUR played; NCN Guyana showed the off-air card. Root cause for NCN: the strip used `@NCNGuyana`, while
`ncnguyana.com/live` links `@ncn.guyana` — a different channel, and the one that streams the newscasts
("Streamed 3 weeks ago / 1 month ago" on its Streams tab; `@NCNGuyana` has never streamed).

**Station-by-station source check (iptv-org GY list, 50 channels, 6 with streams):**

| Station | Finding | Result |
|---|---|---|
| NCN | own live page → YouTube `@ncn.guyana` | handle fixed; off-air card links ncnguyana.com/live |
| DTV-8 | `dtv8.net` embeds `watch.davestv8.com/embed.html` — Cloudflare country rule, 403 outside Guyana (also for the embed page); site links YouTube `@DavesTV8` | YouTube auto-detect + official link; HLS deliberately not hard-coded |
| Ignite TV | bozztv HLS 404; `ignitenews.com` → YouTube `@ignitenewsgy` | YouTube auto-detect + official link |
| Parliament of Guyana | site → livestream.com + YouTube `@parliamentofguyana1710` | YouTube auto-detect + official link |
| GTN Canada | dstreamone HLS, CORS *, plays from here despite iptv-org's geo-blocked label; broadcasts into GY | added as direct HLS |
| GMTV | Akamai URL 404 | not added |
| E-Networks (E1–E3) | `enetworks.gy/tv` 403 (WAF) | not added |
| GTN NY/Orlando/SFL, GuyBai, GuySports | `guyanatvnetwork.com` → `kalingo.tv`, a parked/ad page with no player; dstreamone sibling paths 404 | not added |
| CTV19 | Twitch only | not added |
| Learning Channel family, HBTV, KTV, NTN Berbice, PCN15, RCA, TVG, WRHM7, etc. | no public stream found | not added |

**Change (c16657b81 merge).** `gy` strip order is now HGPTV, MTV Guyana, Little Guyana TV, GTN Canada
(always-live HLS, so the tab opens on live TV), then NCN, DTV-8, Ignite News, Parliament of Guyana (YouTube
auto-detect, official-page link when off air), then teleSUR, Canal I, Venevisión, TVJ, Sky, Al Jazeera. T&T:
Parliament (ParlView) and Tobago Channel 5 off-air cards also link their official sites. Tests: Guyana
section in `tests/live-news-hls.test.mjs` (78/78 with the earlier suites); validator 4/4 Guyana HLS OK.

**Shipped and verified on `127.0.0.1:3100`** (service pid 11426): Guyana tab strip = HGPTV, MTV Guyana,
Little Guyana TV, GTN Canada, NCN, DTV-8, Ignite News, Parliament of Guyana, teleSUR, Canal I, Venevisión,
TVJ, SkyNews, AlJazeera; opens on HGPTV (1280×720); GTN Canada plays 1280×720; NCN / DTV-8 / Ignite /
Parliament show the off-air card with links to ncnguyana.com/live, dtv8.net, ignitenews.com and
parliament.gov.gy respectively (none was streaming at verification time).

### 9.3 Comprehensive GY/TT strips (2026-10-18, late)

**Supersedes the strip tail in §9.2.** The §9.2 "Change" and "Shipped" paragraphs list teleSUR, Canal I,
Venevisión and TVJ after the Guyana stations. Those fillers are gone from the `gy` and `tt` presets as of
merge `f0d32c955` (they remain in the `full` variant's Caribbean region). Both strips now carry only Guyanese
or Trinidadian sources plus the Sky / Al Jazeera backstop, and CARICOM sits in both.

**Candidate sweep.** Every Guyana and T&T newsroom, public body and station with a plausible stream was
checked against the hub's `/api/youtube/live?channel=@handle` route (handle exists AND the Streams tab shows
past lives) or a literal `https://` HLS manifest. Accepted entries get a `handle` for YouTube auto-detect and
an `officialLiveUrl` so the off-air card links to the station's own page; nothing is framed or proxied.

| Station | Finding | Result |
|---|---|---|
| News Room Guyana | `@NewsRoomGuyana`, nightly newscast streamed 1 d ago | added `newsroom-guyana` |
| DPI Guyana | `@dpiguyana`, government press events | added `dpi-guyana` |
| Kaieteur News | `@KaieteurNews` exists, no past live streams | added `kaieteur-news` (weaker; link) |
| INews Guyana | `@InewsGuyana` exists, no past live streams | added `inews-guyana` (weaker; link) |
| Stabroek News | `@stabroeknews` exists, no past live streams | kept `stabroek-news` (weaker; link) |
| Guyana Learning Channel | `@GuyanaLearningChannel`, education.gov.gy | kept `glc-guyana` |
| HGPTV | Dacast HLS 403 overnight (iptv-org: Not 24/7) | `officialLiveUrl` hgptv.com added |
| MTV Guyana | HLS 404 overnight; plays daytime | `officialLiveUrl` mtvgy.com/live added |
| Newsday (T&T) | `@newsday`, newsroom lives | added `newsday-tt` |
| TT Police Service | `@TTPoliceService`, press briefings | added `ttps` |
| Freedom 106.5 FM | `@FREEDOM106.5FM`, radio visual stream | added `freedom-1065` (no official URL) |
| THA | `@THAInfoDept`, streamed 4 d ago | kept `tha-tobago` |
| CARICOM | `@caricomorg`, heads-of-government sessions | added `caricom` to both strips |
| Sankhya TV, Scorch TV | existing literal HLS defs | added to `tt` strip |
| Tobago Channel 5 | existing def | added to `tt` strip |
| teleSUR, Canal I, Venevisión, TVJ | not GY/TT | removed from `gy` / `tt` |

**Change (`06f50a498` on the worktree, `f0d32c955` merge).** `src/components/LiveNewsPanel.ts` gains the
eight definitions above and the two `officialLiveUrl` fields; `src/config/live-channel-defaults.ts` rewrites
both presets. Served order — `gy`: HGPTV, MTV Guyana, Little Guyana TV, GTN Canada, NCN, News Room Guyana,
DTV-8, Ignite News, DPI, Parliament, Kaieteur, INews, Stabroek, Learning Channel, CARICOM, Sky, Al Jazeera
(17). `tt`: TTT, IETV, Synergy, Gayelle, Bizz, Sankhya, Scorch, CNC3, TV6, Parliament, THA, Tobago Updates,
Tobago Channel 5, Newsday, TTPS, Freedom 106.5, CARICOM, CBC TV8, ZIZ, Sky, Al Jazeera (21). Gates: tsc
clean; `sync-locale-keys --check` 24/24; `enforce-premium-fetch` clean; `tests/live-news-hls.test.mjs` 80/80
(new assertions that every GY/TT preset id resolves to a definition and no Venezuelan/TVJ id remains);
`validate-live-channels` 6/8 (HGPTV 403, MTV Guyana 404 at the overnight run). The WORKLOG alignment-pass
facts (12 TegoTV stations listed by the hub, validator 51/68 that evening) still hold and are not restated.

**Shipped and verified on `127.0.0.1:3100`** (service pid 18627, serving `f0d32c955`). Restart sequence
`build:full` → `build-sidecar-handlers` → `tt-install-service.sh restart`; the first `/healthz` curl returned
`000` during the launchd restart race, the second 200, `/api/tego/channels` 200. The built chunk
`dist/assets/panels-news-*.js` contains all eight new ids. Headless sweep (Playwright with the already
installed `channel: 'chrome'`, no browser download; 60 s `waitForSelector('.dashboard-tab-label')`; tab
switched by force-clicking the label with a JS `closest('button,[role=tab],a').click()` fallback after the
xpath-ancestor click timed out at 30 s; 8 s settle; scoped to `[data-panel="live-news"]`): Guyana strip 17
buttons, active "HGPTV (Guyana)"; Trinidad strip 21 buttons, active "TTT Live Online"; tabs
`Main / Trinidad & Tobago / Guyana / Chips & AI`; zero matches for `canal-i|venevision-int|telesur-english|
tvj-hls`. At the 8 s snapshot no `<video>`/`<iframe>` was mounted — the panel is click-to-play, so the sweep
verifies strip composition, not playback. Browserbase was unusable for this (page reverts to `about:blank`
between calls). Click paths: `http://127.0.0.1:3100/` → **Guyana** tab → Live News → station button →
"Play live feed"; same via the **Trinidad & Tobago** tab. Off-air stations show "Watch on {host}" linking
to their official page.
