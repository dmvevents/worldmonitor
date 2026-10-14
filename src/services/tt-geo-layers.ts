/**
 * Data store for the two Trinidad & Tobago variant map layers:
 *
 *  - `ebcConstituencies`: EBC parliamentary constituency boundaries (static,
 *    same-origin GeoJSON artifact in public/data, refreshed via
 *    scripts/tt-ebc-export.sh). Boundary-only, aggregate public record.
 *  - `hurricanes`: active Atlantic tropical cyclones from the National
 *    Hurricane Center — current positions (CurrentStorms.json) plus the
 *    official forecast track and cone polygons from NOAA's tropical
 *    MapServer. NHC publishes no CORS headers, so both go through the
 *    same allowlisted RSS/feed proxy the news panels use.
 *
 * Both are fetched lazily the first time a renderer asks for them; the
 * renderer subscribes to be re-rendered when data lands. Mirrors the
 * read-through pattern of src/shared/storage-facility-registry-store.ts
 * but with its own fetch (no bootstrap key — the tt variant has no Redis seed).
 */
import { rssProxyUrl } from '@/utils/proxy';

export interface NhcStorm {
  id: string;
  binNumber: string;
  name: string;
  classification: string;
  intensityKt: number | null;
  pressureMb: number | null;
  lat: number;
  lon: number;
  movementDir: number | null;
  movementSpeedKt: number | null;
  lastUpdate: string;
  advisoryUrl: string | null;
}

export interface NhcStormData {
  fetchedAt: number;
  storms: NhcStorm[];
  tracks: GeoJSON.FeatureCollection;
  cones: GeoJSON.FeatureCollection;
}

const EBC_URL = '/data/tt-ebc-constituencies.geojson';
const NHC_CURRENT_STORMS_URL = 'https://www.nhc.noaa.gov/CurrentStorms.json';
const NHC_MAPSERVER = 'https://mapservices.weather.noaa.gov/tropical/rest/services/tropical/NHC_tropical_weather/MapServer';
// MapServer layer ids per Atlantic storm slot: AT1 → 6/7/8 (points/track/cone),
// each further slot is +26. Verified against /layers?f=pjson on 2026-10-14.
const NHC_SLOT_STRIDE = 26;
const NHC_TRACK_OFFSET = 7;
const NHC_CONE_OFFSET = 8;
const NHC_TTL_MS = 30 * 60 * 1000;
const RETRY_BACKOFF_MS = 5 * 60 * 1000;
const FETCH_TIMEOUT_MS = 15_000;

const EMPTY_FC: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

type Listener = () => void;
const listeners = new Set<Listener>();
function notify(): void {
  for (const l of listeners) {
    try { l(); } catch { /* listener errors must not break the store */ }
  }
}

/** Subscribe to data arrivals; returns an unsubscribe function. */
export function subscribeTtGeoLayers(listener: Listener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  // The dev feed proxy labels every body as XML; parse the text ourselves.
  return JSON.parse(await res.text()) as unknown;
}

// ── EBC constituencies ───────────────────────────────────────────────────────

let ebcData: GeoJSON.FeatureCollection | null = null;
let ebcPromise: Promise<void> | null = null;
let ebcFailedAt = 0;

/** Returns the constituency GeoJSON if loaded; kicks off the load otherwise. */
export function getEbcConstituencies(): GeoJSON.FeatureCollection | null {
  if (!ebcData && !ebcPromise && Date.now() - ebcFailedAt > RETRY_BACKOFF_MS) {
    ebcPromise = fetchJson(EBC_URL)
      .then((d) => {
        const fc = d as GeoJSON.FeatureCollection;
        if (fc?.type === 'FeatureCollection' && Array.isArray(fc.features)) {
          ebcData = fc;
          notify();
        }
      })
      .catch((err) => {
        console.warn('[tt-geo-layers] EBC constituencies unavailable:', err instanceof Error ? err.message : err);
        ebcFailedAt = Date.now(); // back off; a 404 must not refetch on every redraw
        ebcPromise = null;
      });
  }
  return ebcData;
}

// ── NHC hurricanes ───────────────────────────────────────────────────────────

let nhcData: NhcStormData | null = null;
let nhcPromise: Promise<void> | null = null;

interface RawCurrentStorm {
  id?: string; binNumber?: string; name?: string; classification?: string;
  intensity?: string | number; pressure?: string | number;
  latitudeNumeric?: number; longitudeNumeric?: number;
  movementDir?: number; movementSpeed?: number; lastUpdate?: string;
  publicAdvisory?: { url?: string };
}

function num(v: unknown): number | null {
  const n = typeof v === 'number' ? v : Number.parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : null;
}

function slotIndex(binNumber: string): number | null {
  const m = /^AT(\d)$/.exec(binNumber);
  return m ? Number.parseInt(m[1]!, 10) : null;
}

async function fetchStormGeometry(layerId: number, stormName: string): Promise<GeoJSON.Feature[]> {
  const url = `${NHC_MAPSERVER}/${layerId}/query?where=1%3D1&outFields=*&f=geojson`;
  try {
    const fc = (await fetchJson(rssProxyUrl(url))) as GeoJSON.FeatureCollection;
    if (!Array.isArray(fc?.features)) return [];
    // Guard against NOAA renumbering the per-slot layers: only keep geometry
    // whose stormname matches the storm we resolved from CurrentStorms.json.
    const want = stormName.trim().toLowerCase();
    return fc.features.filter((feat) => {
      const name = String((feat.properties as Record<string, unknown> | null)?.stormname ?? '').trim().toLowerCase();
      return name === '' || name === want;
    });
  } catch (err) {
    console.warn(`[tt-geo-layers] NHC layer ${layerId} unavailable:`, err instanceof Error ? err.message : err);
    return [];
  }
}

async function loadNhc(): Promise<void> {
  const raw = (await fetchJson(rssProxyUrl(NHC_CURRENT_STORMS_URL))) as { activeStorms?: RawCurrentStorm[] };
  const active = Array.isArray(raw?.activeStorms) ? raw.activeStorms : [];
  const storms: NhcStorm[] = [];
  const trackFeatures: GeoJSON.Feature[] = [];
  const coneFeatures: GeoJSON.Feature[] = [];

  for (const s of active) {
    const bin = String(s.binNumber ?? '');
    const slot = slotIndex(bin);
    // Atlantic basin only (AT1..AT5) — the Pacific slots are irrelevant to the Caribbean view.
    if (slot === null) continue;
    const lat = num(s.latitudeNumeric);
    const lon = num(s.longitudeNumeric);
    if (lat === null || lon === null) continue;
    storms.push({
      id: String(s.id ?? bin),
      binNumber: bin,
      name: String(s.name ?? 'Unnamed'),
      classification: String(s.classification ?? ''),
      intensityKt: num(s.intensity),
      pressureMb: num(s.pressure),
      lat, lon,
      movementDir: num(s.movementDir),
      movementSpeedKt: num(s.movementSpeed),
      lastUpdate: String(s.lastUpdate ?? ''),
      advisoryUrl: s.publicAdvisory?.url ?? null,
    });
    const base = (slot - 1) * NHC_SLOT_STRIDE;
    const stormName = String(s.name ?? '');
    const [track, cone] = await Promise.all([
      fetchStormGeometry(base + NHC_TRACK_OFFSET, stormName),
      fetchStormGeometry(base + NHC_CONE_OFFSET, stormName),
    ]);
    trackFeatures.push(...track);
    coneFeatures.push(...cone);
  }

  nhcData = {
    fetchedAt: Date.now(),
    storms,
    tracks: { type: 'FeatureCollection', features: trackFeatures },
    cones: { type: 'FeatureCollection', features: coneFeatures },
  };
  notify();
}

let nhcTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleNhcRefresh(): void {
  if (nhcTimer) clearTimeout(nhcTimer);
  // Keep the layer current on an idle map: re-pull after the TTL even if
  // nothing else triggers a redraw. No-op once every subscriber is gone.
  nhcTimer = setTimeout(() => {
    nhcTimer = null;
    if (listeners.size > 0) getNhcStorms();
  }, NHC_TTL_MS + 1_000);
}

/** Returns NHC storm data if loaded and fresh; (re)loads otherwise. */
export function getNhcStorms(): NhcStormData | null {
  const stale = !nhcData || Date.now() - nhcData.fetchedAt > NHC_TTL_MS;
  if (stale && !nhcPromise) {
    nhcPromise = loadNhc()
      .catch((err) => {
        console.warn('[tt-geo-layers] NHC CurrentStorms unavailable:', err instanceof Error ? err.message : err);
        // Never leave an expired cone on screen as if current: drop the old
        // geometry and stamp the attempt so a dead endpoint is retried after
        // the TTL rather than on every redraw.
        nhcData = { fetchedAt: Date.now(), storms: [], tracks: EMPTY_FC, cones: EMPTY_FC };
        notify();
      })
      .finally(() => { nhcPromise = null; scheduleNhcRefresh(); });
  }
  return nhcData;
}

/** Test-only: reset module state. */
export function __resetTtGeoLayersForTests(): void {
  ebcData = null; ebcPromise = null; ebcFailedAt = 0; nhcData = null; nhcPromise = null; listeners.clear();
  if (nhcTimer) { clearTimeout(nhcTimer); nhcTimer = null; }
}
