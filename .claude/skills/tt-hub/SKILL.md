---

name: tt-hub
description: Operate and extend the Trinidad & Tobago intelligence hub
---

# T&T Hub Operation & Extension

This skill teaches you how to run, maintain, and extend the T&T hub: a full-stack intelligence dashboard running as a macOS launchd service with Claude on Bedrock, live TV from Caribbean broadcasters, and an IPTV directory of 985 verified channels.

## Quick Start

### Run the Hub (GA)

```bash
# One-time: build and install
npm run build:full
node scripts/build-sidecar-handlers.mjs
bash scripts/tt-install-service.sh install

# Thereafter: it starts at login and manages itself
open http://127.0.0.1:3100/dashboard

# Check status / restart / logs
bash scripts/tt-install-service.sh status
bash scripts/tt-install-service.sh restart
tail -f ~/Library/Logs/worldmonitor-hub/hub.log
```

### Development

```bash
# Recommended: global hub with Claude Bedrock, local Ollama off
npm run dev:hub:claude

# Or just the T&T variant with Ollama
npm run dev:hub

# Single variant (T&T only, useful for debugging)
npm run dev:tt
```

### Data-Source Keys

Keys live outside the repo (no secrets in git):
```bash
# Create and populate ~/.config/worldmonitor/keys.env
mkdir -p ~/.config/worldmonitor
cat > ~/.config/worldmonitor/keys.env <<'EOF'
ALPHA_VANTAGE_API_KEY=...
EIA_API_KEY=...
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...
# Optional: ACLED_EMAIL, FRED_API_KEY, FINNHUB_API_KEY, etc.
EOF
chmod 600 ~/.config/worldmonitor/keys.env

# Seed Redis (markets expire after 30 min)
set -a; . ~/.config/worldmonitor/keys.env; set +a
node scripts/seed-market-quotes.mjs
node scripts/seed-commodity-quotes.mjs
node scripts/seed-eia-petroleum.mjs
```

### Verify It Works

```bash
# Healthcheck
curl -s http://127.0.0.1:8788/health   # Claude shim
curl -s http://127.0.0.1:3100 | grep -o '<title>.*</title>'  # Front door

# Headless probe (with Chrome for H.264 HLS support)
node scripts/validate-live-channels.mjs --hls-only  # Check all streams
```

---

## How to Add a Feed

Feeds are public news sources (RSS when available, Google News site: queries otherwise). Always verify the source is public and official before adding.

### 1. Client-Side: `src/config/feeds.ts`

Find your variant's feed object (e.g., `TT_FEEDS` for Trinidad):

```typescript
const TT_FEEDS: Record<string, Feed> = {
  'tt-news': {
    name: 'TT News',
    sources: [
      { id: 'trinidadexpress', name: 'Trinidad Express', url: 'https://trinidadexpress.com/feed?c[]=news/local&c[]=news/business', format: 'rss' },
      // Add your new source here:
      { id: 'mynewsource', name: 'My News Source', url: 'https://mynewsource.tt/feed', format: 'rss' },
    ],
  },
  // ... other categories
};
```

### 2. Server-Side: `server/worldmonitor/news/v1/_feeds.ts`

Add the feed to the server digest:

```typescript
const VARIANT_FEEDS = {
  tt: {
    'tt-news': [
      { id: 'trinidadexpress', name: 'Trinidad Express', url: 'https://trinidadexpress.com/feed?c[]=news/local&c[]=news/business' },
      { id: 'mynewsource', name: 'My News Source', url: 'https://mynewsource.tt/feed' },
    ],
    // ... other categories
  },
  // ... other variants
};
```

### 3. Allowlist the Domain (Three Places)

**a) `shared/rss-allowed-domains.json`:**

```json
{
  "trinidadexpress.com": "Trinidad Express",
  "mynewsource.tt": "My News Source"
}
```

**b) `api/_rss-allowed-domains.js`:**

```javascript
export const RSS_ALLOWED_DOMAINS = [
  'trinidadexpress.com',
  'mynewsource.tt',
  // ... rest
];
```

**c) `vite.config.ts`** (RSS_PROXY_ALLOWED_DOMAINS):

```typescript
const RSS_PROXY_ALLOWED_DOMAINS = [
  'trinidadexpress.com',
  'mynewsource.tt',
  // ... rest
];
```

### 4. Verify

```bash
# Test the feed with curl (must return valid RSS XML)
curl -sI https://mynewsource.tt/feed | grep -i 'content-type'  # Should include xml
curl -s https://mynewsource.tt/feed | head -20 | grep -o '<rss\|<feed'  # Check root element

# Type-check and lint
npm run typecheck
npm run lint

# Run on dev server and test
npm run dev:tt
# Browser: open http://localhost:3100, check the feed category for articles
```

### 5. Document It

Add the feed to the inventory in `TT_FOCUS.md` under "Direct RSS" or "No usable RSS" (if blocked/empty).

---

## How to Add a Live TV Channel

Live TV channels stream via HLS (HTTP Live Streaming) or YouTube. Always probe the stream before adding.

### 1. Verify the Stream Works

```bash
# For HLS: check manifest and CORS
curl -sI 'https://stream.example.tt/live.m3u8' | grep -E '^(HTTP|Access-Control)'

# For YouTube: verify the channel handle
curl -sI 'https://youtube.com/@mybroadcaster/live' | grep '^HTTP'
```

### 2. Add to `src/components/LiveNewsPanel.ts`

In the `OPTIONAL_LIVE_CHANNELS` object:

```typescript
const OPTIONAL_LIVE_CHANNELS: Record<string, LiveChannel> = {
  // ... existing channels
  'my-broadcast': {
    id: 'my-broadcast',
    name: 'My Broadcast',
    type: 'hls', // or 'youtube'
    url: 'https://stream.example.tt/live.m3u8', // HLS manifest URL
    // For YouTube: url: 'https://youtube.com/@mybroadcaster/live'
  },
};
```

### 3. Add to Per-Variant Defaults: `src/config/live-channel-defaults.ts`

```typescript
export const VARIANT_LIVE_CHANNEL_IDS: Partial<Record<string, string[]>> = {
  tt: [
    'bizz-tv',        // Already there
    'my-broadcast',   // New channel
    // ... rest of T&T defaults
  ],
  // ... other variants
};
```

### 4. Test with Headless Chrome (for H.264 support)

```bash
# Validate: checks manifest 200, #EXTM3U, CORS, and YouTube presence
node scripts/validate-live-channels.mjs

# Or for HLS only
node scripts/validate-live-channels.mjs --hls-only

# Script exits 1 if any channel fails; fix before committing
```

### 5. Browser Test

```bash
npm run dev:tt
# Open http://localhost:3100
# Live News panel → Manage channels → verify new channel appears
# Click it and verify stream plays (especially on Chrome)
```

### Hard Rules for Live Channels

- **No Referer/User-Agent spoofing:** Skip streams that require custom headers

- **CORS must be open:** Stream must return Access-Control-Allow-Origin header
- **No authentication:** Public streams only (no login, API key, or token required)

- **24/7 or newscast schedule:** If a channel is mostly off-air, mark it with ◷ (newscast-only)
- **Verify before committing:** Run `validate-live-channels.mjs`, exit code 0 required

---

## How to Refresh the IPTV Directory

The IPTV directory is a curated list of about 1,000 verified Caribbean and worldwide news streams from the iptv-org project (channels in the Caribbean, channels broadcasting into it per feeds.json `broadcast_area`, and worldwide news).

```bash
npm run iptv:sync
# or manually:
./node_modules/.bin/tsx scripts/iptv-sync.mjs

# Check the output
ls -lh public/data/iptv-directory.json
cat public/data/iptv-directory.json | jq '.channels | length'  # Should be ~1,000

# Test the UI
npm run dev:tt
# Live News panel → Manage channels → IPTV directory
# Search for "Bizz" or filter by "TT" country
```

**What the sync does:**

1. Fetches iptv-org index (Caribbean + worldwide news)
2. Probes each stream: GET manifest, check 200 status, verify #EXTM3U + CORS

3. Skips streams requiring Referer/User-Agent headers
4. Writes verified list to `public/data/iptv-directory.json`

**Why re-sync?** Streams come and go; re-run occasionally to keep the list fresh.

---

## How to Add a Tab/Variant

The hub ships with tt, gy, and chips variants as preset tabs inside the `full` variant. To add a new one:

### 1. Create Variant Config: `src/config/variants/myvariant.ts`

```typescript
export const MY_VARIANT_TIMEZONE = 'America/New_York';
export const MY_VARIANT_COUNTRY_CODE = 'US';
export const MY_VARIANT_BBOX = { min: [-100, 25], max: [-65, 50] };
```

### 2. Add Panels: `src/config/panels.ts`

```typescript
export const MY_PANELS: Omit<PanelConfig, 'defaultPosition'>[] = [
  { key: 'headlines', name: 'Headlines', category: 'news', /* ... */ },
  { key: 'world-map', name: 'World Map', category: 'geo', /* ... */ },
  // ... 4–8 panels total
];

export const MY_MAP_LAYERS = ['world', 'natural-earth-coastline'];

export const PANEL_CATEGORY_MAP = {
  myvariant: ['news', 'geo', 'intelligence'],
  // ... rest
};
```

### 3. Add Feeds: `src/config/feeds.ts`

```typescript
export const MY_FEEDS: Record<string, Feed> = {
  'my-news': {
    name: 'My News',
    sources: [
      { id: 'source1', name: 'Source 1', url: 'https://source1.com/feed', format: 'rss' },
    ],
  },
};
```

### 4. Add Live Channels: `src/config/live-channel-defaults.ts`

```typescript
export const VARIANT_LIVE_CHANNEL_IDS: Partial<Record<string, string[]>> = {
  myvariant: ['channel1', 'channel2'],
  // ... rest
};
```

### 5. Register in Variant Registry: `src/config/variant.ts`

```typescript
export const VARIANT_REGISTRY: Record<string, VariantConfig> = {
  myvariant: {
    id: 'myvariant',
    name: 'My Variant',
    panels: MY_PANELS,
    mapLayers: MY_MAP_LAYERS,
    feeds: MY_FEEDS,
    // ... other config
  },
  // ... rest
};
```

### 6. Server-Side: `server/worldmonitor/news/v1/_feeds.ts`

```typescript
const VARIANT_FEEDS = {
  myvariant: {
    'my-news': [
      { id: 'source1', name: 'Source 1', url: 'https://source1.com/feed' },
    ],
  },
  // ... rest
};

export const VALID_VARIANTS = ['tt', 'gy', 'chips', 'full', 'myvariant'];
```

### 7. Add to Dashboard Tabs: `src/config/dashboard-tabs.ts` (Optional)

To make your variant available as a preset tab in the `full` hub:

```typescript
const PRESETS: Record<string, PresetTabSource> = {
  myvariant: { id: 'preset-myvariant', name: 'My Variant', variant: 'myvariant', mapTitle: 'My Region' },
  // ... rest
};

const VARIANT_PRESET_TABS = {
  full: ['tt', 'gy', 'chips', 'myvariant'],  // Add here
  // ... rest
};
```

### 8. Test

```bash
npm run typecheck
npm run test:data
npm run dev:myvariant  # Runs on :3100, or next available port
```

---

## How to Re-Seed Redis

Markets expire after 30 minutes; if they go stale before the seed loop runs, re-seed manually:

```bash
# Load keys from file
set -a; . ~/.config/worldmonitor/keys.env; set +a

# Re-seed everything
node scripts/seed-market-quotes.mjs
node scripts/seed-commodity-quotes.mjs
node scripts/seed-eia-petroleum.mjs
node scripts/seed-fuel-prices.mjs
node scripts/seed-quake-alerts.mjs

# Or let the loop run automatically
bash scripts/tt-seed-loop.sh --once

# Verify (check that seed-meta keys exist)
curl -s -H "Authorization: Bearer $UPSTASH_REDIS_REST_TOKEN" \
  "$UPSTASH_REDIS_REST_URL/get/seed-meta:seed-market-quotes" | jq .
```

**What each seed does:**

- `seed-market-quotes.mjs`: Stocks (Alpha Vantage + Yahoo) → `market:stocks-bootstrap:v1`
- `seed-commodity-quotes.mjs`: Commodities (Alpha Vantage) → `market:commodities-bootstrap:v1`

- `seed-eia-petroleum.mjs`: EIA energy → `energy:eia-petroleum:v1`
- `seed-fuel-prices.mjs`: Fuel prices (EIA) → `economic:fuel-prices:v1`

**Note:** The seed loop (`scripts/tt-seed-loop.sh`) runs these automatically every 25 minutes.

---

## Verification with Headless Chrome

The hub runs in a single browser tab (Webkit on desktop, can't decode H.264). To verify live TV works, use headless Playwright with Chrome (Chromium):

```bash
# Test one channel
node -e '
  const { chromium } = require("playwright");
  (async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto("http://localhost:3100");
    // Add verification code here
    await browser.close();
  })();
'

# Or use the built-in validator
node scripts/validate-live-channels.mjs

# Spec: exit code 0 if all channels pass, 1 if any fail
echo $?  # Should be 0
```

**Important:** Use `channel: 'chrome'` in Playwright (Chromium), not default Firefox. Firefox and Safari also support H.264, but Chrome is the strictest test.

---

## Scope Rule

The T&T hub aggregates **public, official news sources only**, no profiling of private individuals:

- ✅ Government press releases (Parliament, OPM, ministries)
- ✅ Official broadcaster newscasts (TTT, CNC3, TV6)

- ✅ Public aggregators (CARICOM, Caribbean News Global)
- ✅ Weather/environmental alerts (NHC, WASA outage notices)

- ❌ Social media scraping of named individuals
- ❌ Voter registration or phone data

- ❌ Private company earnings or personal profiles

The `tt-safety` lens is public-news aggregates only: crime reports from official agencies, not victim doxxing.

---

## Hard Rules

1. **Never push to koala73/worldmonitor upstream.** Branch `tt-focus` is local-only.

2. **Never read `.env*` files in code.** Secrets come from process env only.
3. **Port 3000 is Docker's.** Dev servers use 3100+ (set DEV_PORT if needed).

4. **Secrets outside the repo:** `~/.config/worldmonitor/keys.env` (chmod 600), AWS profile, Keychain.
5. **HLS channels: no Referer/User-Agent spoofing.** CORS must be open (no authentication).

6. **Test before committing:** `npm run typecheck`, `npm run lint`, `node scripts/validate-live-channels.mjs` (exit 0).
7. **Build steps for GA:** `npm run build:full` + `node scripts/build-sidecar-handlers.mjs`, commit dist/ (not api/**/v1/[rpc].js).

---

## Troubleshooting

| Issue | Check |
|-------|-------|
| Hub won't start | `bash scripts/tt-install-service.sh status`, check `~/Library/Logs/worldmonitor-hub/hub.log` |
| Sidecar connection refused | `lsof -i :46123`, ensure front door is running first |
| Live TV plays black | Use headless Chrome (Firefox/Safari can't test H.264); check `validate-live-channels.mjs` |
| Markets panel blank | Re-seed: `node scripts/seed-market-quotes.mjs`, or `bash scripts/tt-seed-loop.sh --once` |
| Claude briefs time out | Check `curl -s http://127.0.0.1:8788/health`, ensure Claude shim is running |
| Feeds show no articles | Verify RSS source is not rate-limited; test with curl first |
