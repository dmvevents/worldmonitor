/**
 * TegoTV stream resolver for the Trinidad & Tobago free-to-air stations.
 *
 * TTT, ieTV, Synergy TV, Gayelle, Trinity TV, TV Jaagriti, Bhakti TV, IBN, Plus TV and
 * WACK Visual Radio are not on YouTube or in the iptv-org index. Their public web player
 * (https://player.tegotv.com, embedded on ttt.live/stream) is a Siber middleware client:
 *
 *   1. GET https://api.siberapi.com/sso/get_guest_token.php?app_id=1  → guest JWT (24 h)
 *   2. GET https://mw.siberapi.com/api/ui/stb/v3/Channels/<id>?device_id=…&device=web&application_id=1
 *      with `Authorization: Bearer <jwt>`                              → tv_channel[0].streaming_url
 *
 * `streaming_url` is a Flussonic HLS manifest on tego-cdn*.sibercdn.com with a signed,
 * time-limited `token=` query (observed lifetime 24 h, not bound to the client IP). The CDN
 * answers every request with `Access-Control-Allow-Origin: *`, so once the URL is known the
 * browser's hls.js plays it directly — no proxying of media through the hub.
 *
 * This module does exactly what the broadcaster's own player does for an anonymous visitor
 * (same endpoints, same guest flow, no credentials, no header spoofing). The free "TegoTV -
 * Free TV Channels" package is what the guest account is entitled to; nothing else is reachable.
 *
 * Used by scripts/tt-hub-server.mjs (`/api/tego/stream`, `/api/tego/channels`) and by
 * scripts/validate-live-channels.mjs (`tego:<id>` hlsUrl scheme). Node ≥ 18, no deps.
 */

const SSO = 'https://api.siberapi.com/sso/get_guest_token.php?app_id=1';
const MW = 'https://mw.siberapi.com/api/ui/stb/v3';
const APP_ID = 1;
// The web player uses this fixed pseudo device id for guests (player.js getGuestLogin()).
const GUEST_DEVICE_ID = 'AA:AA:AA:AA:AA:AA';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36';
const TIMEOUT_MS = 12_000;

/** TegoTV category "Trinidad and Tobago Local Stations" (cat_id 11) + TTT's own category (36). */
export const TEGO_TT_CATEGORIES = [36, 11];

let tokenCache = { token: null, exp: 0 };
const streamCache = new Map(); // channel id -> { url, exp }
const inflight = new Map();

function jwtExp(token) {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    return typeof payload.exp === 'number' ? payload.exp * 1000 : 0;
  } catch { return 0; }
}

/** Flussonic tokens end in `-<expires>-<issued>` (unix seconds). */
export function tokenExpiryMs(url) {
  const m = /token=[^&]*-(\d{10})-(\d{10})(?:&|$)/.exec(url || '');
  return m ? Number(m[1]) * 1000 : 0;
}

async function getJson(url, headers = {}, fetchImpl = globalThis.fetch) {
  const res = await fetchImpl(url, { headers: { 'User-Agent': UA, Accept: 'application/json', ...headers }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`${new URL(url).pathname} HTTP ${res.status}`);
  return res.json();
}

export async function getGuestToken(fetchImpl = globalThis.fetch) {
  if (tokenCache.token && Date.now() < tokenCache.exp - 5 * 60_000) return tokenCache.token;
  const data = await getJson(SSO, {}, fetchImpl);
  const token = data?.access_token;
  if (typeof token !== 'string' || !token.includes('.')) throw new Error('guest token missing');
  tokenCache = { token, exp: jwtExp(token) || Date.now() + 60 * 60_000 };
  return token;
}

function mwUrl(path) {
  return `${MW}/${path}${path.includes('?') ? '&' : '?'}device_id=${encodeURIComponent(GUEST_DEVICE_ID)}&device=web&application_id=${APP_ID}`;
}

async function mw(path, fetchImpl) {
  const token = await getGuestToken(fetchImpl);
  const data = await getJson(mwUrl(path), { Authorization: `Bearer ${token}` }, fetchImpl);
  const account = data?.response?.account;
  if (account && account.status && account.status !== 200) throw new Error(`middleware account status ${account.status}`);
  return data?.response ?? {};
}

function pick(c) {
  return {
    id: String(c.id),
    name: c.caption || c.caption_short || `Channel ${c.id}`,
    provider: c.content_provider_name || undefined,
    logo: c.icon_url || undefined,
    language: c.language || undefined,
    enabled: c.channel_status !== false,
    streamingUrl: c.streaming_url || null,
  };
}

/**
 * Resolve one channel's tokenised HLS manifest URL. Cached until 10 minutes before the
 * token expires; concurrent callers share one upstream round trip.
 */
export async function resolveTegoStream(channelId, { fetchImpl = globalThis.fetch, force = false } = {}) {
  const id = String(channelId);
  if (!/^\d{1,6}$/.test(id)) throw new Error('bad channel id');
  const cached = streamCache.get(id);
  if (!force && cached && Date.now() < cached.exp - 10 * 60_000) return cached;
  if (inflight.has(id)) return inflight.get(id);
  const p = (async () => {
    try {
      const r = await mw(`Channels/${id}`, fetchImpl);
      const ch = Array.isArray(r.tv_channel) ? r.tv_channel[0] : null;
      const url = ch?.streaming_url;
      if (typeof url !== 'string' || !/^https:\/\/[^/]+\.sibercdn\.com\//.test(url)) throw new Error('no stream for channel');
      const exp = tokenExpiryMs(url) || Date.now() + 60 * 60_000;
      const entry = { ...pick(ch), url, exp };
      streamCache.set(id, entry);
      return entry;
    } finally { inflight.delete(id); }
  })();
  inflight.set(id, p);
  return p;
}

/** Channel catalogue for the T&T categories (names, logos, ids; no stream URLs). */
export async function listTegoChannels({ fetchImpl = globalThis.fetch, categories = TEGO_TT_CATEGORIES } = {}) {
  const seen = new Map();
  for (const cat of categories) {
    const r = await mw(`Channels/Category/${cat}`, fetchImpl);
    for (const c of r.tv_channel || []) {
      if (!seen.has(String(c.id))) seen.set(String(c.id), { ...pick(c), category: cat, streamingUrl: undefined });
    }
  }
  return [...seen.values()];
}

/** For tests. */
export function _resetTegoCaches() { tokenCache = { token: null, exp: 0 }; streamCache.clear(); inflight.clear(); }
