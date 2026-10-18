#!/usr/bin/env node
/**
 * IPTV directory sync — builds public/data/iptv-directory.json from the public
 * iptv-org index (https://github.com/iptv-org/iptv, API at iptv-org.github.io/api).
 *
 * Keeps: every channel from the Caribbean + Guiana Shield countries (any genre)
 * plus worldwide channels tagged `news`. Each stream is probed from this machine:
 * HTTP 200 and a `#EXTM3U` manifest. Streams without an `Access-Control-Allow-Origin`
 * header are kept but flagged `needsProxy` (the hub plays them via its same-origin proxy).
 *
 *   node scripts/iptv-sync.mjs                 # default scope
 *   IPTV_COUNTRIES=TT,GY node scripts/iptv-sync.mjs --no-news
 *   node scripts/iptv-sync.mjs --out /tmp/x.json --concurrency 24
 *
 * Streams that need a Referer / User-Agent (iptv-org marks them) are skipped:
 * the browser cannot send custom headers for media requests.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dflt; };
const OUT = flag('--out', join(__dirname, '..', 'public', 'data', 'iptv-directory.json'));
const CONCURRENCY = Number(flag('--concurrency', '16'));
const INCLUDE_NEWS = !args.includes('--no-news');
const DEFAULT_COUNTRIES = ['TT', 'GY', 'SR', 'VE', 'BB', 'JM', 'LC', 'VC', 'GD', 'AG', 'DM', 'KN', 'BS', 'BZ', 'HT', 'DO', 'CU', 'PR', 'CW', 'AW', 'SX', 'BQ', 'TC', 'KY', 'VG', 'VI', 'AI', 'MS', 'MQ', 'GP', 'GF', 'BM'];
const COUNTRIES = new Set((process.env.IPTV_COUNTRIES || DEFAULT_COUNTRIES.join(',')).split(',').map((s) => s.trim().toUpperCase()).filter(Boolean));
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36';
const API = 'https://iptv-org.github.io/api';

async function getJson(name) {
  const res = await fetch(`${API}/${name}.json`, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`${name}.json HTTP ${res.status}`);
  return res.json();
}

async function probe(url) {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Origin: 'https://worldmonitor.app' }, redirect: 'follow', signal: AbortSignal.timeout(12_000) });
    const text = (await res.text()).slice(0, 4000);
    const cors = res.headers.get('access-control-allow-origin');
    return { ok: res.ok && text.includes('#EXTM3U'), cors: cors ?? '-', hasCors: !!cors, status: res.status };
  } catch (err) {
    return { ok: false, status: err?.name === 'TimeoutError' ? 'timeout' : 'error', cors: '-' };
  }
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length); let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i], i); }
  }));
  return out;
}

const [channels, streams, countries, categories, logos] = await Promise.all([getJson('channels'), getJson('streams'), getJson('countries'), getJson('categories'), getJson('logos').catch(() => [])]);
// channels.json carries no logo field any more; logos live in logos.json (one or more per channel).
const logoByChannel = new Map();
for (const l of logos) if (l?.channel && l?.url && !logoByChannel.has(l.channel)) logoByChannel.set(l.channel, l.url);
const countryName = new Map(countries.map((c) => [c.code, c.name]));
const categoryName = new Map(categories.map((c) => [c.id, c.name]));
const byId = new Map(channels.map((c) => [c.id, c]));

const wanted = channels.filter((c) => !c.closed && (COUNTRIES.has(c.country) || (INCLUDE_NEWS && (c.categories || []).includes('news'))));
const wantedIds = new Set(wanted.map((c) => c.id));
const candidates = streams.filter((s) => s.channel && wantedIds.has(s.channel) && typeof s.url === 'string' && s.url.startsWith('https://') && !s.referrer && !s.user_agent);
console.error(`[iptv-sync] channels in scope: ${wanted.length}; https streams without header requirements: ${candidates.length}; probing with concurrency ${CONCURRENCY}…`);

let done = 0;
const probed = await mapLimit(candidates, CONCURRENCY, async (s) => {
  const r = await probe(s.url);
  done += 1; if (done % 100 === 0) console.error(`[iptv-sync] ${done}/${candidates.length}`);
  return { ...s, probe: r };
});

// One entry per channel: prefer the highest quality verified stream.
const qualityRank = (q) => { const m = /(\d+)p/.exec(q || ''); return m ? Number(m[1]) : 0; };
// One entry per channel: prefer streams the browser can fetch directly (CORS), then quality.
const best = new Map();
const rank = (x) => (x.probe.hasCors ? 1000 : 0) + qualityRank(x.quality);
for (const s of probed) {
  if (!s.probe.ok) continue;
  const prev = best.get(s.channel);
  if (!prev || rank(s) > rank(prev)) best.set(s.channel, s);
}
const directory = [...best.values()].map((s) => {
  const c = byId.get(s.channel);
  return {
    id: `iptv-${s.channel.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    iptvId: s.channel,
    name: c.name,
    altNames: c.alt_names?.length ? c.alt_names : undefined,
    country: c.country,
    countryName: countryName.get(c.country) || c.country,
    categories: (c.categories || []).map((id) => categoryName.get(id) || id),
    logo: logoByChannel.get(s.channel) || c.logo || undefined,
    website: c.website || undefined,
    hlsUrl: s.url,
    quality: s.quality || undefined,
    // iptv-org labels: "Not 24/7" (station signs off) and "Geo-blocked" (plays only in-region).
    notNonStop: Array.isArray(s.labels) && s.labels.some((x) => /not 24\/7/i.test(x)) ? true : undefined,
    geoBlocked: Array.isArray(s.labels) && s.labels.some((x) => /geo-?blocked/i.test(x)) ? true : undefined,
    cors: s.probe.cors,
    // No CORS header: hls.js cannot fetch it directly; the hub plays it through its same-origin
    // /api/iptv-proxy (scripts/tt-hub-server.mjs), which only accepts hosts listed in this file.
    needsProxy: s.probe.hasCors ? undefined : true,
  };
}).sort((a, b) => a.countryName.localeCompare(b.countryName) || a.name.localeCompare(b.name));

const byCountry = {};
for (const d of directory) byCountry[d.country] = (byCountry[d.country] || 0) + 1;
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify({
  source: 'https://github.com/iptv-org/iptv (iptv-org.github.io/api)',
  licence: 'Channel metadata CC0 / streams are the broadcasters\' public URLs; verified from this machine only',
  generatedAt: new Date().toISOString(),
  scope: { countries: [...COUNTRIES], newsWorldwide: INCLUDE_NEWS },
  probed: candidates.length,
  verified: directory.length,
  needsProxy: directory.filter((d) => d.needsProxy).length,
  byCountry,
  channels: directory,
}, null, 1));
console.error(`[iptv-sync] wrote ${directory.length} verified channels (${candidates.length} probed) → ${OUT}`);
console.error(`[iptv-sync] per country: ${Object.entries(byCountry).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([k, v]) => `${k}:${v}`).join(' ')}`);
