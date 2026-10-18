import { toApiUrl } from '@/services/runtime';

/**
 * TegoTV (Trinidad & Tobago free-to-air stations) stream resolution.
 *
 * The hub's front door exposes `/api/tego/stream?channel=<id>`, which returns the station's
 * current tokenised HLS manifest (24 h signed CDN token, CORS *). The browser plays that URL
 * directly with hls.js; nothing is proxied. Results are cached until shortly before the token
 * expires so channel switches stay instant; `force` re-resolves after a playback failure.
 */
interface TegoStream { url: string; expiresAt: number; name?: string }

const cache = new Map<number, TegoStream>();
const inflight = new Map<number, Promise<string | null>>();
const EARLY_MS = 10 * 60_000;

export async function resolveTegoStreamUrl(channel: number, force = false): Promise<string | null> {
  if (!Number.isInteger(channel) || channel <= 0) return null;
  const cached = cache.get(channel);
  if (!force && cached && Date.now() < cached.expiresAt - EARLY_MS) return cached.url;
  const pending = inflight.get(channel);
  if (pending && !force) return pending;
  const p = (async () => {
    try {
      const res = await fetch(toApiUrl(`/api/tego/stream?channel=${channel}${force ? '&force=1' : ''}`), { signal: AbortSignal.timeout(15_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { url?: string; expiresAt?: string; name?: string };
      if (typeof data.url !== 'string' || !data.url.startsWith('https://')) throw new Error('no url');
      const expiresAt = data.expiresAt ? Date.parse(data.expiresAt) : Date.now() + 60 * 60_000;
      cache.set(channel, { url: data.url, expiresAt: Number.isFinite(expiresAt) ? expiresAt : Date.now() + 60 * 60_000, name: data.name });
      return data.url;
    } catch (error) {
      console.warn(`[LiveNews] TegoTV channel ${channel} could not be resolved:`, error);
      return null;
    } finally {
      inflight.delete(channel);
    }
  })();
  inflight.set(channel, p);
  return p;
}

/** For tests. */
export function _resetTegoCache(): void { cache.clear(); inflight.clear(); }
