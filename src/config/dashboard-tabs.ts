// Preset dashboard tabs: every regional/topic variant we ship locally is also
// reachable as an extra tab inside the others, so one dashboard can keep its
// default tab and switch to the Guyana or AI-compute monitors without running
// a second dev server. A preset tab enables exactly the panels that variant
// enables by default; the news panels resolve their feeds through
// CANONICAL_FEEDS regardless of the active site variant.
import { SITE_VARIANT } from './variant';
import { getVariantEnabledPanelKeys } from './panels';

export interface PresetTab {
  /** Stable id so the seeding logic can tell whether a preset already exists. */
  id: string;
  name: string;
  panelKeys: string[];
}

interface PresetTabSource { id: string; name: string; variant: string }

const PRESETS: Record<string, PresetTabSource> = {
  tt: { id: 'preset-tt', name: 'Trinidad & Tobago', variant: 'tt' },
  gy: { id: 'preset-gy', name: 'Guyana', variant: 'gy' },
  chips: { id: 'preset-chips', name: 'Chips & AI', variant: 'chips' },
};

// Which presets each variant offers besides its own default tab.
const VARIANT_PRESET_TABS: Partial<Record<string, string[]>> = {
  tt: ['gy', 'chips'],
  gy: ['tt', 'chips'],
  chips: ['tt', 'gy'],
};

export function getPresetTabs(variant: string = SITE_VARIANT): PresetTab[] {
  return (VARIANT_PRESET_TABS[variant] ?? [])
    .map((key) => PRESETS[key])
    .filter((p): p is PresetTabSource => p !== undefined)
    .map((p) => ({ id: p.id, name: p.name, panelKeys: getVariantEnabledPanelKeys(p.variant) }));
}
