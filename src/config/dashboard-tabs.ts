// Preset dashboard tabs: every regional/topic variant we ship locally is also
// reachable as an extra tab inside the others, so one dashboard can keep its
// default tab and switch to the Guyana or AI-compute monitors without running
// a second dev server. A preset tab enables exactly the panels that variant
// enables by default; the news panels resolve their feeds through
// CANONICAL_FEEDS regardless of the active site variant.
import { SITE_VARIANT } from './variant';
import { getVariantEnabledPanelKeys } from './panels';
import { getDefaultMapView } from './map-view';
import { VARIANT_LIVE_CHANNEL_IDS } from './live-channel-defaults';

export interface PresetTab {
  /** Stable id so the seeding logic can tell whether a preset already exists. */
  id: string;
  name: string;
  panelKeys: string[];
  /** Map region the tab opens on (see map-view.ts). */
  mapView: string;
  /** Map panel header shown while the tab is active. */
  mapTitle: string;
  /** Live News channel ids to put first when the tab is selected. */
  liveChannelIds: string[];
}

interface PresetTabSource { id: string; name: string; variant: string; mapTitle: string }

const PRESETS: Record<string, PresetTabSource> = {
  full: { id: 'preset-full', name: 'World Monitor', variant: 'full', mapTitle: 'Global Situation' },
  tt: { id: 'preset-tt', name: 'Trinidad & Tobago', variant: 'tt', mapTitle: 'Trinidad & Tobago / Southern Caribbean' },
  gy: { id: 'preset-gy', name: 'Guyana', variant: 'gy', mapTitle: 'Guyana / Guiana Shield' },
  chips: { id: 'preset-chips', name: 'Chips & AI', variant: 'chips', mapTitle: 'AI Compute: Data Centres, Fabs and Cloud Regions' },
};

// Which presets each variant offers besides its own default tab.
const VARIANT_PRESET_TABS: Partial<Record<string, string[]>> = {
  // The global dashboard keeps its default tab and gains the regional/topic monitors as tabs.
  full: ['tt', 'gy', 'chips'],
  tt: ['gy', 'chips'],
  gy: ['tt', 'chips'],
  chips: ['tt', 'gy'],
};

export function getPresetTabs(variant: string = SITE_VARIANT): PresetTab[] {
  return (VARIANT_PRESET_TABS[variant] ?? [])
    .map((key) => PRESETS[key])
    .filter((p): p is PresetTabSource => p !== undefined)
    .map(toPresetTab);
}

function toPresetTab(p: PresetTabSource): PresetTab {
  return {
    id: p.id,
    name: p.name,
    panelKeys: getVariantEnabledPanelKeys(p.variant),
    mapView: getDefaultMapView(p.variant, 'global'),
    mapTitle: p.mapTitle,
    liveChannelIds: VARIANT_LIVE_CHANNEL_IDS[p.variant] ?? [],
  };
}

/** The active variant's own default tab, expressed as a preset (used when switching back to it). */
export function getOwnVariantPreset(variant: string = SITE_VARIANT): PresetTab | null {
  const p = PRESETS[variant];
  return p ? toPresetTab(p) : null;
}
