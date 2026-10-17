#!/usr/bin/env node

import { loadEnvFile, CHROME_UA, runSeed } from './_seed-utils.mjs';

loadEnvFile(import.meta.url);

const NWS_API = 'https://api.weather.gov/alerts/active';
const CANONICAL_KEY = 'weather:alerts:v1';
const CACHE_TTL = 900; // 15 min

// WMO Severe Weather Information Centre (SWIC) CAP aggregator: adds the Caribbean and
// Guiana Shield national met services (Trinidad & Tobago Met Service, Barbados, Guyana,
// Jamaica, ...) which NWS does not cover. Public JSON, no key; the member list carries
// each service's centroid so alerts without polygons still land on the map.
const WMO_ALL = 'https://severeweather.wmo.int/json/wmo_all.json';
const WMO_MEMBERS = 'https://severeweather.wmo.int/json/wmo_member.json';
const WMO_CARIBBEAN = /trinidad|tobago|barbados|guyana|suriname|jamaica|grenada|saint lucia|st\.? lucia|saint vincent|st\.? vincent|antigua|dominica|saint kitts|st\.? kitts|bahamas|belize|venezuela|cuba|haiti|dominican republic|cayman|british virgin|bermuda|cura[cç]ao|sint maarten|aruba|french guiana|martinique|guadeloupe|turks/i;
const WMO_SEVERITY = { 4: 'Extreme', 3: 'Severe', 2: 'Moderate', 1: 'Minor' };
const wmoIso = (v) => (typeof v === 'string' && v ? `${v.replace(' ', 'T')}${v.endsWith('Z') ? '' : 'Z'}` : '');

async function fetchWmoCaribbeanAlerts() {
  const [membersResp, allResp] = await Promise.all([
    fetch(WMO_MEMBERS, { headers: { 'User-Agent': CHROME_UA }, signal: AbortSignal.timeout(15_000) }),
    fetch(WMO_ALL, { headers: { 'User-Agent': CHROME_UA }, signal: AbortSignal.timeout(20_000) }),
  ]);
  if (!membersResp.ok || !allResp.ok) throw new Error(`WMO SWIC error: members ${membersResp.status}, alerts ${allResp.status}`);
  const regions = await membersResp.json();
  const members = new Map();
  for (const region of Array.isArray(regions) ? regions : []) {
    for (const m of region.members || []) if (WMO_CARIBBEAN.test(m.name || '')) members.set(String(m.mid), m);
  }
  const all = await allResp.json();
  const items = Array.isArray(all?.items) ? all.items : [];
  return items
    .filter((it) => members.has(String(it.mid)))
    .slice(0, 50)
    .map((it) => {
      const m = members.get(String(it.mid));
      return {
        id: `wmo:${it.id || `${it.mid}:${it.sent}`}`,
        event: it.event || it.headline || 'Weather alert',
        severity: WMO_SEVERITY[Number(it.s)] || 'Moderate',
        headline: `${it.headline || it.event || 'Alert'} — ${m.name} (${m.dept || 'national meteorological service'})`,
        description: it.url ? `CAP: https://severeweather.wmo.int/${it.url}` : '',
        areaDesc: it.areaDesc || m.name,
        onset: wmoIso(it.effective || it.sent),
        expires: wmoIso(it.expires),
        coordinates: [],
        centroid: [m.lng, m.lat],
      };
    });
}

function extractCoordinates(geometry) {
  if (!geometry) return [];
  try {
    if (geometry.type === 'Polygon') {
      return geometry.coordinates[0]?.map(c => [c[0], c[1]]) || [];
    }
    if (geometry.type === 'MultiPolygon') {
      return geometry.coordinates[0]?.[0]?.map(c => [c[0], c[1]]) || [];
    }
  } catch { /* ignore */ }
  return [];
}

function calculateCentroid(coords) {
  if (coords.length === 0) return undefined;
  const sum = coords.reduce((acc, [lon, lat]) => [acc[0] + lon, acc[1] + lat], [0, 0]);
  return [sum[0] / coords.length, sum[1] / coords.length];
}

async function fetchAlerts() {
  const resp = await fetch(NWS_API, {
    headers: { Accept: 'application/geo+json', 'User-Agent': CHROME_UA },
    signal: AbortSignal.timeout(15_000),
  });
  if (!resp.ok) throw new Error(`NWS API error: ${resp.status}`);

  const data = await resp.json();
  const features = data.features || [];

  const alerts = features
    .filter(f => f?.properties?.severity !== 'Unknown')
    .slice(0, 50)
    .map(f => {
      const p = f.properties;
      const coords = extractCoordinates(f.geometry);
      return {
        id: f.id || '',
        event: p.event || '',
        severity: p.severity || 'Unknown',
        headline: p.headline || '',
        description: (p.description || '').slice(0, 500),
        areaDesc: p.areaDesc || '',
        onset: p.onset || '',
        expires: p.expires || '',
        coordinates: coords,
        centroid: calculateCentroid(coords),
      };
    });

  let wmo = [];
  try {
    wmo = await fetchWmoCaribbeanAlerts();
  } catch (err) {
    console.warn('[weather] WMO SWIC merge skipped:', err.message);
  }
  return { alerts: [...alerts, ...wmo] };
}

function validate(data) {
  return Array.isArray(data?.alerts) && data.alerts.length >= 1;
}

export function declareRecords(data) {
  return Array.isArray(data?.alerts) ? data.alerts.length : 0;
}

runSeed('weather', 'alerts', CANONICAL_KEY, fetchAlerts, {
  validateFn: validate,
  ttlSeconds: CACHE_TTL,
  sourceVersion: 'nws-active+wmo-swic-caribbean',

  declareRecords,
  schemaVersion: 1,
  maxStaleMin: 45,
}).catch((err) => {
  const _cause = err.cause ? ` (cause: ${err.cause.message || err.cause.code || err.cause})` : ''; console.error('FATAL:', (err.message || err) + _cause);
  process.exit(1);
});
