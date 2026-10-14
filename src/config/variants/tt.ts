// Trinidad & Tobago variant - VITE_VARIANT=tt (local: npm run dev:tt → http://localhost:3100)
// NOTE: As with energy.ts, this file is the structured canonical description.
// The runtime wiring lives in src/config/panels.ts (TT_PANELS, TT_MAP_LAYERS,
// TT_MOBILE_MAP_LAYERS), src/config/feeds.ts (TT_FEEDS) and
// src/config/map-layer-definitions.ts (VARIANT_LAYER_ORDER.tt) — modify both
// if the variant shape changes.
//
// Scope rule: public news and official sources only, aggregate and topic level.
// No profiling of private individuals, no voter or phone data, no social-media
// account scraping of named people.
import type { PanelConfig, MapLayers } from '@/types';
import type { VariantConfig } from './base';

// Re-export base config
export * from './base';

/** IANA timezone for all T&T-local time rendering (digest headers, world clock home). */
export const TT_TIMEZONE = 'America/Port_of_Spain';
/** ISO 3166-1 alpha-2 focus country. */
export const TT_COUNTRY_CODE = 'TT';
/** Default map centre: Trinidad & Tobago with the southern Caribbean, eastern Venezuela and Guyana in frame. */
export const TT_MAP_CENTER = { lat: 12.5, lon: -62.5, zoom: 5 } as const;

export const DEFAULT_PANELS: Record<string, PanelConfig> = {
  map: { name: 'Trinidad & Tobago / Southern Caribbean', enabled: true, priority: 1 },
  'live-news': { name: 'Live News', enabled: true, priority: 1 },
  // T&T public news + official sources
  'tt-news': { name: 'T&T News', enabled: true, priority: 1 },
  'tt-gov': { name: 'T&T Government & Official', enabled: true, priority: 1 },
  caribbean: { name: 'Caribbean & Geopolitics', enabled: true, priority: 1 },
  // Topic lenses relevant to Anton's work
  'tt-energy': { name: 'Energy & LNG', enabled: true, priority: 1 },
  'tt-education': { name: 'Education & Student Laptops', enabled: true, priority: 1 },
  'tt-telecoms': { name: 'Telecoms (TSTT, Digicel, TATT)', enabled: true, priority: 1 },
  'tt-public-it': { name: 'Public-Sector IT & Procurement', enabled: true, priority: 1 },
  'tt-safety': { name: 'Crime & Public Safety (aggregate)', enabled: true, priority: 1 },
  'tt-weather': { name: 'Weather, Hurricanes & Outages', enabled: true, priority: 1 },
  // Wider context
  latam: { name: 'Latin America', enabled: true, priority: 2 },
  politics: { name: 'World News', enabled: true, priority: 2 },
  energy: { name: 'Global Energy & Resources', enabled: true, priority: 2 },
  'energy-complex': { name: 'Oil & Gas Complex (WTI, Brent, NatGas)', enabled: true, priority: 2 },
  commodities: { name: 'Metals & Materials', enabled: false, priority: 2 },
  polymarket: { name: 'Predictions', enabled: false, priority: 2 },
  insights: { name: 'AI Insights', enabled: false, priority: 2 },
  climate: { name: 'Climate Anomalies', enabled: false, priority: 2 },
  'disease-outbreaks': { name: 'Disease Outbreaks', enabled: false, priority: 2 },
  monitors: { name: 'My Monitors', enabled: true, priority: 2 },
  'world-clock': { name: 'World Clock', enabled: true, priority: 2 },
};

// Only Caribbean-relevant layers on; everything else explicitly off.
export const DEFAULT_MAP_LAYERS: MapLayers = {
  conflicts: true, hotspots: true, weather: true, natural: true,
  cables: true, pipelines: true, storageFacilities: true, commodityPorts: true, waterways: true,
  sanctions: true,
  bases: false, nuclear: false, irradiators: false, radiationWatch: false, economic: false,
  outages: false, cyberThreats: false, datacenters: false, protests: false, flights: false,
  military: false, spaceports: false, minerals: false, fires: false, ucdpEvents: false,
  displacement: false, climate: false, ais: false, fuelShortages: false, liveTankers: false,
  startupHubs: false, cloudRegions: false, accelerators: false, techHQs: false, techEvents: false,
  stockExchanges: false, financialCenters: false, centralBanks: false, commodityHubs: false,
  gulfInvestments: false, positiveEvents: false, kindness: false, happiness: false,
  speciesRecovery: false, renewableInstallations: false, tradeRoutes: false, iranAttacks: false,
  gpsJamming: false, satellites: false, ciiChoropleth: false, resilienceScore: false, dayNight: false,
  miningSites: false, processingPlants: false, webcams: false, diseaseOutbreaks: false,
  ebcConstituencies: true, hurricanes: true,
};

export const MOBILE_DEFAULT_MAP_LAYERS: MapLayers = {
  ...DEFAULT_MAP_LAYERS,
  cables: false, pipelines: false, storageFacilities: false, commodityPorts: false, waterways: false,
  ebcConstituencies: false,
};

export const VARIANT_CONFIG: VariantConfig = {
  name: 'tt',
  description: 'Trinidad & Tobago focused monitor — public news, official sources, topic lenses, Caribbean geopolitics',
  panels: DEFAULT_PANELS,
  mapLayers: DEFAULT_MAP_LAYERS,
  mobileMapLayers: MOBILE_DEFAULT_MAP_LAYERS,
};
