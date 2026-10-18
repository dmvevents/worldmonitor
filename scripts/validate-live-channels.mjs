#!/usr/bin/env node
/**
 * Live-channel validator: probes every HLS (m3u8) channel declared in
 * src/components/LiveNewsPanel.ts for reachability, a valid manifest and a
 * CORS header (browser playback through hls.js needs Access-Control-Allow-Origin).
 * YouTube-handle channels are checked for an existing channel page and a
 * resolvable latest upload (the off-air fallback).
 *
 *   node scripts/validate-live-channels.mjs            # all channels
 *   node scripts/validate-live-channels.mjs --hls-only # skip YouTube checks
 *
 * Exit code 1 when any HLS channel fails; YouTube offline is informational.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'src', 'components', 'LiveNewsPanel.ts'), 'utf8');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const HLS_ONLY = process.argv.includes('--hls-only');
const CONCURRENCY = 8;

const channels = [];
for (const m of src.matchAll(/\{\s*id:\s*'([a-z0-9-]+)',\s*name:\s*'((?:[^'\\]|\\.)*)'([^}]*)\}/g)) {
  const [, id, name, rest] = m;
  const hls = rest.match(/hlsUrl:\s*'([^']+)'/)?.[1] ?? null;
  const handle = rest.match(/handle:\s*'(@[^']+)'/)?.[1] ?? null;
  const tego = rest.match(/tegoChannel:\s*(\d+)/)?.[1] ?? null;
  channels.push({ id, name, hls, handle, tego });
}
const unique = [...new Map(channels.map((c) => [c.id, c])).values()];

async function probeHls(url) {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15_000), redirect: 'follow' });
    const text = (await res.text()).slice(0, 2000);
    return { ok: res.ok && text.includes('#EXTM3U'), status: res.status, cors: res.headers.get('access-control-allow-origin') ?? '-' };
  } catch (err) {
    return { ok: false, status: err?.name === 'TimeoutError' ? 'timeout' : 'error', cors: '-' };
  }
}

async function probeYouTube(handle) {
  try {
    const res = await fetch(`https://www.youtube.com/${handle}/live`, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15_000), redirect: 'follow' });
    if (!res.ok) return { ok: false, status: res.status, live: false, latest: null };
    const html = await res.text();
    const idx = html.indexOf('"videoDetails"');
    const live = idx !== -1 && /"isLive"\s*:\s*true/.test(html.slice(idx, idx + 5000));
    const vids = await fetch(`https://www.youtube.com/${handle}/videos`, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15_000) });
    const latest = vids.ok ? ((await vids.text()).match(/"videoId":"([a-zA-Z0-9_-]{11})"/)?.[1] ?? null) : null;
    return { ok: html.includes('"channelId"') || html.includes('og:url'), status: res.status, live, latest };
  } catch (err) {
    return { ok: false, status: err?.name === 'TimeoutError' ? 'timeout' : 'error', live: false, latest: null };
  }
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) { const idx = i++; out[idx] = await fn(items[idx]); }
  }));
  return out;
}

// TegoTV (T&T free-to-air) entries carry a channel id instead of a URL; resolve the tokenised
// manifest the way the hub does (scripts/tt-tego-resolver.mjs) and probe that.
const tegoChannels = unique.filter((c) => !c.hls && c.tego);
if (tegoChannels.length) {
  const { resolveTegoStream } = await import('./tt-tego-resolver.mjs');
  for (const c of tegoChannels) {
    try { c.hls = (await resolveTegoStream(c.tego)).url; c.name += ` [tego:${c.tego}]`; }
    catch (err) { console.log(`[tego] FAIL resolve ${c.id} (channel ${c.tego}): ${err?.message || err}`); c.tegoFailed = true; }
  }
}
const hlsChannels = unique.filter((c) => c.hls);
const ytChannels = HLS_ONLY ? [] : unique.filter((c) => !c.hls && c.handle && !c.tego);

console.log(`Probing ${hlsChannels.length} HLS channels${HLS_ONLY ? '' : ` and ${ytChannels.length} YouTube channels`}...`);
const hlsResults = await mapLimit(hlsChannels, CONCURRENCY, async (c) => ({ c, r: await probeHls(c.hls) }));
let hlsFailures = unique.filter((c) => c.tegoFailed).length;
for (const { c, r } of hlsResults) {
  const flag = r.ok ? (r.cors === '*' || r.cors.startsWith('http') ? 'OK ' : 'OK (no CORS: desktop/proxy only)') : 'FAIL';
  if (!r.ok) hlsFailures++;
  console.log(`[hls] ${flag.padEnd(32)} ${c.id.padEnd(22)} ${String(r.status).padEnd(7)} cors=${r.cors.padEnd(4)} ${c.name}`);
}
if (ytChannels.length) {
  const ytResults = await mapLimit(ytChannels, 4, async (c) => ({ c, r: await probeYouTube(c.handle) }));
  for (const { c, r } of ytResults) {
    const state = !r.ok ? 'MISSING' : r.live ? 'LIVE' : r.latest ? `offline (latest ${r.latest})` : 'offline (no uploads found)';
    console.log(`[yt]  ${state.padEnd(32)} ${c.id.padEnd(22)} ${c.handle} ${c.name}`);
  }
}
console.log(`\n${hlsChannels.length - hlsFailures}/${hlsChannels.length} HLS channels reachable with a valid manifest.`);
process.exit(hlsFailures > 0 ? 1 : 0);
