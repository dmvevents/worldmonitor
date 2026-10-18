---

name: tt-iptv-curator
description: Refresh and curate the IPTV directory of Caribbean and worldwide news channels
model: sonnet
tools:
  - Bash
  - Read
---

# T&T IPTV Curator Agent

**Mission:** Refresh, verify, and maintain the IPTV directory of Caribbean and worldwide news streams.

## What Is the IPTV Directory

The IPTV directory (`public/data/iptv-directory.json`) is a curated list of about 1,000 verified HLS and live streams from the iptv-org project (1,038 on 2026-10-18). It covers:

- Caribbean countries (Trinidad & Tobago, Guyana, Jamaica, Barbados, St. Lucia, Dominican Republic, Cuba, Haiti, Venezuela, etc.)
- Diaspora stations whose iptv-org feed `broadcast_area` names one of those countries (e.g. Little Guyana TV from the US, GTN Canada) — they get `broadcastTo` and list under the country they serve, matching iptv-org's `countries/<cc>.m3u` playlists
- Worldwide news channels (Bloomberg, CNBC, BBC, France24, AJE, teleSUR, etc.)

Users can search and add any stream to the Live News panel's strip via the **Manage channels** UI.

---

## Sync Workflow

### 1. Run the Sync

```bash
npm run iptv:sync
# or manually:
./node_modules/.bin/tsx scripts/iptv-sync.mjs

# This runs:
# 1. Fetch iptv-org index (all countries)
# 2. Filter: keep Caribbean / Guiana Shield + worldwide news
# 3. Probe each stream: GET manifest, check 200 + #EXTM3U + CORS
# 4. Skip streams requiring Referer / User-Agent headers
# 5. Write verified list to public/data/iptv-directory.json

# Expected output:
# [iptv-sync] Fetched 2,500+ streams from iptv-org
# [iptv-sync] Filtered to 1,100+ Caribbean / news candidates
# [iptv-sync] Probed 1,100+, verified 985, skipped 115
# [iptv-sync] Wrote public/data/iptv-directory.json (285 KB, 985 entries)
```

### 2. Spot-Check Results

```bash
# How many channels?
cat public/data/iptv-directory.json | jq '.channels | length'
# Expected: 950–1,050 (varies slightly month-to-month as streams come/go)

# View a few entries
cat public/data/iptv-directory.json | jq '.channels[:3]'

# Filter by country (example: Trinidad & Tobago)
cat public/data/iptv-directory.json | jq '.channels[] | select(.country == "TT")'
```

### 3. Test the UI

```bash
npm run dev:tt

# Open browser: http://localhost:3100
# Live News panel → Manage channels → IPTV directory
# - Can you search for "Bizz"? Should return Bizz TV
# - Can you filter by "TT"? Should return ~7 T&T streams
# - Can you click a stream and see it add to the strip?
```

### 4. Verify with Headless Test

```bash
node scripts/validate-live-channels.mjs --hls-only

# This probes every HLS channel (including those in the IPTV directory)
# Exit code: 0 = all pass, 1 = at least one failed
echo $?  # Should be 0

# If a channel fails:
# - The directory entry is stale (stream went offline)
# - Either update it (new URL) or remove it
```

---

## Stream Verification Criteria

**A stream passes the sync if:**

1. **Manifest HTTP 200:** GET stream URL returns 200 status

2. **CORS open:** Response includes `Access-Control-Allow-Origin` header (or no CORS check needed)
3. **HLS magic:** First 100 bytes contain `#EXTM3U`

4. **No auth required:** No 401/403, no login page, no API key check
5. **No custom headers:** No required `Referer`, `User-Agent`, or `Authorization` headers

**Streams are skipped if:**

- HTTP error (4xx, 5xx, timeout)
- Missing CORS headers (from a different origin, browser can't access)

- Not HLS (`#EXTM3U` missing)
- Requires Referer/User-Agent spoofing (flagged in probe logs)

- RTMP-only or non-standard protocol

---

## Handling Stream Changes

### Stale Stream (Goes Offline)

If `validate-live-channels.mjs` reports a stream failure:

```bash
# Option 1: Update the URL
# Check the broadcaster's website for a new manifest URL, then update
# the entry in public/data/iptv-directory.json:
cat public/data/iptv-directory.json | jq '.channels[] | select(.name == "My Channel")'

# Option 2: Re-run the sync (automatic removal)
npm run iptv:sync
# Stale streams fail the probe and are excluded from the new directory.json
```

### New Stream Discovered

If you find a public HLS stream that should be in the directory:

1. **Probe it first:**
   ```bash
   curl -sI 'https://broadcaster.tt/live.m3u8' | head -3
   # Should see: HTTP/2 200, Access-Control-Allow-Origin
   ```

2. **Verify it's not Referer-gated:**
   ```bash
   curl -s 'https://broadcaster.tt/live.m3u8' -H 'Referer:' | head -1
   # Should NOT see "403" or "blocked" message
   ```

3. **Run `npm run iptv:sync` after the next iptv-org index update** (happens automatically; next sync will pick it up if iptv-org includes it)

4. **Or manually add to the directory** (if it's authoritative and you want to fast-track it):
   ```bash
   # Edit public/data/iptv-directory.json and add:
   {
     "id": "my-channel-tt",
     "name": "My Channel",
     "country": "TT",
     "url": "https://broadcaster.tt/live.m3u8",
     "verified": true,
     "probeTime": "2026-10-17T12:00:00Z"
   }
   ```

---

## Sync Schedule

**Recommended:** Run `npm run iptv:sync` once every 2–4 weeks to keep streams current.

**Why?** Streams come and go; a 3-month-old directory may have 20–50 dead entries.

**When to sync immediately:**

- User reports a stream failing
- iptv-org releases a major update (check their GitHub)

- You add/remove a category (Caribbean countries, news channels, etc.)

---

## Scope: What Stays In

**Keep:**

- Caribbean countries (all nations and territories in the region)
- Guiana Shield (Guyana, Suriname, French Guiana)

- Worldwide news channels (Bloomberg, CNBC, BBC, France24, AJE, etc.)
- Public broadcasters (no paywall, no login)

**Skip (not in directory):**

- Paywalled / subscription-only channels
- Streams requiring authentication

- Private YouTube channels (only public/verified ones)
- Streams that need Referer / User-Agent spoofing

- RTMP or non-HLS protocols
- Defunct/dead streams (filtered out by probe)

**TegoTV stations (T&T free-to-air) are not directory entries.** They are `tegoChannel: <id>` channels in
`src/components/LiveNewsPanel.ts`, resolved at play time by the front door (`/api/tego/stream`,
`scripts/tt-tego-resolver.mjs`) through the broadcasters' own anonymous guest player. `/api/tego/channels`
lists the catalogue; the validator probes them as `tego:<id>`. Owned by the Hermes IPTV lane
(`docs/tt/IPTV-HANDOFF.md` §9); do not duplicate them as HLS URLs (the signed token expires after 24 h).

---

## Troubleshooting

| Issue | What to Check |
|-------|---------------|
| "Verified 0, skipped 1,100" | All streams failed probe (likely iptv-org index changed, or network down). Check `curl` manually for a known stream (Bizz TV). |
| Directory is empty | Script error or file write permission. Check script output for errors; verify `public/data/` is writable. |
| Channel fails `validate-live-channels.mjs` but was just added | Stream is now offline or CORS changed. Re-run sync to re-probe. |
| UI search doesn't find a channel | Ensure the channel is in `public/data/iptv-directory.json` and `npm run dev:tt` has reloaded. |

---

## Integration with Other Agents

- **tt-hub-operator** uses the directory in the Live News UI; if you update it, they may verify with headless tests

- **tt-feed-curator** handles RSS feeds (different from IPTV streams; no overlap)
- **Main session** may ask you to refresh the directory before a release

---

## No-Op Tasks

- Do **not** manually edit the directory without re-probing (stale entries will break the UI)

- Do **not** add streams requiring Referer/User-Agent headers (breaks hls.js in browser)
- Do **not** include paywalled streams or those behind authentication

- Do **not** skip the CORS check (browser can't access streams without it)
