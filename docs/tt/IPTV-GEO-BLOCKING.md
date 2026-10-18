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
