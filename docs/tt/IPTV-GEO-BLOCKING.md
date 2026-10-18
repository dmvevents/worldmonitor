# IPTV Geo-blocking and CORS Investigation Report

**Date:** 2026-10-17 | **Location:** United States (Mac) | **Directory:** 998 verified channels, 47 labeled `geoBlocked: true`

## Executive Summary

Of 47 iptv-org "geo-blocked" channels, **20 play successfully from this US IP** (43%), 17 have manifest-only access (36%), and 10 are fully blocked or dead (21%). The label often reflects broadcaster intent or stale metadata rather than active enforcement.

Caribbean/Guiana Shield has **4 non-CORS candidates** (DO only), all https streams returning 200 + #EXTM3U but no Access-Control-Allow-Origin header. Two require Referer headers. These cannot play in browsers without a same-origin proxy. The sidecar's HLS proxy is hardcoded to one CDN host and rejects these streams (403 Host not allowed).

---

## 1. Geo-blocked Channel Classification (47 channels)

| Classification | Count | % | Description |
|----------------|-------|---|-------------|
| **PLAYS_HERE** | 20 | 43% | Master manifest, variant, and segments all return valid media |
| **MANIFEST_ONLY** | 17 | 36% | Master accessible, segments/variants blocked or invalid |
| **BLOCKED** | 10 | 21% | Master manifest fails (408/403/dead) |

### PLAYS_HERE (20 channels)

All segments delivered successfully despite geo-blocked label:

| Name | Country | Segment Size | Type |
|------|---------|--------------|------|
| ABC News Live | US | 2.0 MB | video/MP2T |
| CNBC UK | UK | 705 KB | video/MP2T |
| LiveNOW from FOX | US | 731 KB | video/MP2T |
| RT Arabic | RU | 654 KB | video/mp2t |
| RT en Espanol | RU | 660 KB | video/mp2t |
| SABC News | ZA | 285 KB | video/MP2T |
| The Young Turks | US | 1.1 MB | video/MP2T |
| *(+13 Dominican channels: Carivision, Digital Vision 63, Peravia Vision, etc.)* | DO | 378 KB - 3.5 MB | video/MP2T |

### MANIFEST_ONLY (17 channels)

Master works, segments fail:

| Name | Country | Mechanism |
|------|---------|-----------|
| **Nachrichten 360** | **DE** | **403 on segments (IP geo-check)** |
| BBC News | UK | 404 on variant playlist |
| CNA | SG | No segments in variant |
| India Today | IN | No segments in variant |
| WSOC Now | US | No segments in variant |
| *(+12 others: invalid playlists, timeouts, 504s)* | Various | Misconfigured or geo-restricted |

### BLOCKED (10 channels)

Master manifest fails:

| Name | Country | Mechanism |
|------|---------|-----------|
| News12 Bronx (+ 7 other News12 streams) | US | HTTP 408 timeout (dead or IP-filtered) |
| News12+ Long Island | US | HTTP 408 timeout |
| NHK World-Japan | JP | Invalid response (not HLS) |

### Observed Mechanisms

1. **IP-based segment blocking** (Nachrichten 360): Manifests public, .ts segments return 403 for non-EU IPs.
2. **Timeout on master** (News12 family): 408 suggests dead streams or CDN rejecting connection pre-response.
3. **Invalid manifests** (various): 200 status but HTML error pages or empty playlists (geo-redirects, misconfiguration).
4. **No enforcement** (20 channels): Full access despite label. Label reflects intent/licensing, not active blocking.

---

## 2. Non-CORS Caribbean Streams (4 candidates, all DO)

**Total Caribbean https streams probed:** 444  
**No CORS header (200 + #EXTM3U):** 4

| Name | Host | Needs Referer | Referer URL |
|------|------|---------------|-------------|
| Acento TV | acentotv01.streamprolive.com | Yes | https://acentotv01.streamprolive.com/i/cp/hls/player.html |
| El Nuevo Diario TV | nuevodiario01.streamprolive.com | Yes | https://nuevodiario01.streamprolive.com/i/cp/hls/player.html |
| Mision ELTV | rd.tvabierta.net | No | - |
| Teleimpacto | vpss2003.streamprolive.com | No | - |

**Why non-CORS matters:** Browsers block `<video>` requests to origins without `Access-Control-Allow-Origin` when page origin differs. These streams likely intended for same-origin iframes or native apps.

**Proxy requirement:** Same-origin proxy (sidecar) can serve these. Current proxy (`src-tauri/sidecar/local-api-server.mjs` line 1308) only allows `cdn-ca2-na.lncnetworks.host`; these hosts are rejected.

---

## 3. HLS Proxy Verification

**Proxy location:** `src-tauri/sidecar/local-api-server.mjs` lines 1307-1359  
**Purpose:** Bypass CORS, add Referer/User-Agent headers (browsers can't set these for `<video>`)  
**Key limitation:** Hardcoded host allowlist:

```javascript
const ALLOWED_HLS_HOSTS = new Set(['cdn-ca2-na.lncnetworks.host']);
```

**Test result:**  
```
curl http://127.0.0.1:3100/api/hls-proxy?url=https%3A%2F%2Frd.tvabierta.net%2Flive%2Fmisioneltv.m3u8
→ HTTP 403: Host not allowed
```

**What would be required:**

1. Add 4 DO hosts to allowlist
2. Configure per-host Referer (currently hardcoded to `https://livenewschat.eu/`)
3. Test manifest rewriting → variant playlist → segments → hls.js playback

**Status:** Not verified. Code changes needed before end-to-end test is possible.

---

## 4. What Geo-blocking Means for This Hub

**Core technical reality:** Geo-blocking is enforced by the broadcaster's CDN based on **client IP address**. The hub can only play streams that this Mac's network location is allowed to access.

**The proxy does NOT change location.** When the sidecar proxies a request:

1. Browser requests `localhost:3100/api/hls-proxy?url=...`
2. Sidecar makes HTTPS request to CDN **from this Mac's IP**
3. CDN sees the same IP as if browser requested directly
4. Sidecar returns response to browser

**Proxy purpose:** Bypass CORS, add headers. **NOT** for IP spoofing or geo-circumvention.

**The only way to play geo-blocked streams** (IP-restricted) is network egress in the licensed region:

- User's own VPN with exit node in target country
- User's own VPS/proxy in target region
- Tor exit node (unreliable, often blocked)

**This project should NOT:**

- Ship VPN/proxy for circumvention
- Offer IP spoofing or header tricks beyond iptv-org-documented broadcaster requirements
- Encourage ToS violations

**Recommended approach:**

1. **Flag geo-blocked entries** in UI: "🌍 May be geo-restricted" with tooltip explaining broadcaster restrictions
2. **Hide by default** with opt-in toggle: "Show geo-restricted streams"
3. **No false promises:** Error message should state: "This stream is not available in your region."
4. **Document proxy honestly:** It's for CORS/headers, not geo-circumvention

**Bottom line:** The hub plays what the network allows. Geo-blocking is a legal and technical boundary. Users needing region-restricted content must bring their own compliant external solution (VPN, proxy). Routing through the hub's proxy does not change the egress IP and will not bypass geo-restrictions.

---

## Appendix: Data Files

- `/tmp/iptv-work/geo-blocked-probe-results.json` — Full probe results (47 channels)
- `/tmp/iptv-work/non-cors-candidates.json` — 4 non-CORS streams (DO)
- `/tmp/iptv-work/channels.json` — iptv-org index (31,632 channels)
- `/tmp/iptv-work/streams.json` — iptv-org index (18,137 streams)

**Word count (excl. tables/code):** ~580 words

## Egress setting (added 2026-10-18)

`IPTV_EGRESS_PROXY` in the keys file routes the front door's stream fetches through a network exit the
operator is entitled to use (own VPS, a machine at a relative's home in the region, subscribed VPN). It is
a standard outbound-proxy setting, applied only to the IPTV proxy process; the hub ships no proxy
discovery, no public proxy lists and no header spoofing. `/healthz` shows the egress host when active.

### What changes when egress is on (2026-10-18)

- The directory UI reads `/healthz`; when `iptvEgress` is set, entries labelled **Geo-blocked** are added
  to the strip through `/api/iptv-proxy` (meta line "geo-blocked · via hub egress (host)"), exactly like
  no-CORS entries. Without egress they keep their direct URL, because routing them through this Mac would
  change nothing.
- `/api/iptv-proxy` still accepts only hostnames present in `public/data/iptv-directory.json` and only
  https. The egress sees stream traffic for those hosts and nothing else (YouTube, the sidecar and Upstash
  stay direct via `NO_PROXY`).
- Channels you added to the strip *before* enabling egress keep their direct URL. Remove and re-add them
  from the directory.
- DTV-8 (Guyana) is the concrete case: `watch.davestv8.com` answers 403 from Cloudflare for the whole host
  from a US exit (country rule), so only an in-region exit plays it.

### Step by step: your own exit over SSH

You need one machine whose internet connection is in the broadcaster's region and that you may use: a
small VPS there, or a Raspberry Pi / old laptop at a relative's house with Node ≥ 18 installed. Nothing
else is required on it.

1. **Put the proxy on the remote machine** (from this repo):

   ```bash
   scp scripts/tt-egress-proxy.mjs user@remote:~/tt-egress-proxy.mjs
   ssh user@remote 'nohup node ~/tt-egress-proxy.mjs > ~/tt-egress.log 2>&1 &'
   ```

   It listens on the remote's `127.0.0.1:8888` only, so nothing on the internet can use it; the SSH tunnel
   is the only way in. Optional: `EGRESS_ALLOW=davestv8.com,bozztv.com node ~/tt-egress-proxy.mjs` limits
   it to the stream hosts you need. On a Linux VPS make it survive reboots with a systemd unit:

   ```ini
   # /etc/systemd/system/tt-egress.service
   [Unit]
   Description=World Monitor IPTV egress proxy
   After=network-online.target
   [Service]
   ExecStart=/usr/bin/node /home/user/tt-egress-proxy.mjs
   Restart=always
   User=user
   [Install]
   WantedBy=multi-user.target
   ```

   `sudo systemctl enable --now tt-egress`.

2. **Key-based SSH from this Mac** (once): `ssh-copy-id user@remote`, then `ssh user@remote true` must
   succeed without a prompt.

3. **Keep the tunnel alive at login**: add `EGRESS_SSH_TARGET=user@remote` (append `:2222` for a
   non-default SSH port) to `~/.config/worldmonitor/keys.env`, then

   ```bash
   bash scripts/tt-install-egress-tunnel.sh install     # launchd agent com.worldmonitor.tt-egress-tunnel
   bash scripts/tt-install-egress-tunnel.sh test        # prints direct exit IP vs the IP seen through the tunnel
   ```

   The test must show two different addresses; if they match, the tunnel is up but the remote is not in a
   different region. Logs: `~/Library/Logs/worldmonitor-hub/egress-tunnel.log`.

4. **Point the hub at it**: add `IPTV_EGRESS_PROXY=http://127.0.0.1:8888` to the same keys file and
   `bash scripts/tt-install-service.sh restart`. `curl -s http://127.0.0.1:3100/healthz` now shows
   `"iptvEgress":"127.0.0.1:8888"`, and the hub log says `IPTV egress via 127.0.0.1:8888`.

5. **Add the channel**: Live News panel → Manage channels → IPTV directory → country Guyana → the DTV-8 row
   (when iptv-org's probe lists it again) or any entry marked geo-blocked → Add channel. Its meta line reads
   "via hub egress"; playback goes browser → front door → tunnel → remote → broadcaster. The remote's log
   (`~/tt-egress.log`) shows one `CONNECT host:443` line per stream host.

### Step by step: a VPN you subscribe to, in Docker

No machine in the region needed. The VPN runs inside one container (gluetun) that exposes an HTTP
proxy on `127.0.0.1:8888`; only the hub's IPTV proxy uses it, the rest of the Mac stays direct. Docker
Desktop is already on this Mac (Grafana).

1. Check the provider has an exit where you need it. From the providers' public server lists on
   2026-10-18: **NordVPN** lists Guyana (`gy1`), Trinidad and Tobago (`tt3`, `tt4`), Barbados and
   Jamaica, all flagged *virtual location* (the IP geolocates to the country, the hardware is elsewhere;
   Cloudflare-style country rules normally accept that, but it is not guaranteed and can change).
   **Surfshark** lists only Bahamas, Puerto Rico and Venezuela in the region. Windscribe's location list
   could not be read from its site (JavaScript-rendered) and is unverified; its free plan has about ten
   locations, none Caribbean as far as is known.
2. `cp scripts/tt-egress-vpn.compose.example.yml ~/.config/worldmonitor/egress-vpn.compose.yml` and fill
   in the provider block (NordVPN: the *service credentials* from the dashboard's manual-setup page, not
   your login; `SERVER_COUNTRIES=Guyana`).
3. `docker compose -f ~/.config/worldmonitor/egress-vpn.compose.yml up -d`, then
   `curl -x http://127.0.0.1:8888 https://api.ipify.org` must print a different address than
   `curl https://api.ipify.org`.
4. Add `IPTV_EGRESS_PROXY=http://127.0.0.1:8888` to `~/.config/worldmonitor/keys.env`,
   `bash scripts/tt-install-service.sh restart`, confirm `/healthz` shows `iptvEgress`, then add the
   geo-blocked channel from the directory as above.

Running the provider's own desktop app instead also works, but it routes the whole Mac (Bedrock, Upstash,
Gmail) through the VPN and the hub cannot tell it is on; the container keeps it to stream traffic.
Browser-side tricks that VPN vendors advertise (timezone or language "warp", location spoofing) are
irrelevant here: the broadcaster only sees the address of whatever fetches the stream, which with egress
on is the hub's front door.

A commercial VPN that offers an HTTP proxy endpoint in the region works the same way without Docker: set
`IPTV_EGRESS_PROXY=http://user:pass@proxy-host:port` directly (credentials stay in the keys file; the log
prints host:port only).

### Verified here

Plumbing was verified on 2026-10-18 with the egress proxy running on this Mac itself (same exit, so it
proves routing, not unblocking): `/healthz` reported the egress, a geo-blocked directory entry (GTN Canada)
was added as a hub-proxied URL, the proxy log showed the `CONNECT` lines for its CDN, and the stream played
in headless Chrome through the chain.
