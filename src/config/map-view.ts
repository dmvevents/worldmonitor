// Variant-aware default map view. Kept in config (not components) so the
// dependency direction types → config → services → components → app holds:
// panel-layout (app) reads this when constructing MapContainer.
//
// The view keys mirror the MapView union in src/components/MapContainer.ts;
// they are plain strings here to avoid a config → components import.
export type DefaultMapView =
  | 'global' | 'america' | 'mena' | 'eu' | 'asia' | 'latam' | 'africa' | 'oceania' | 'caribbean' | 'trinidad';

const VARIANT_DEFAULT_MAP_VIEW: Partial<Record<string, DefaultMapView>> = {
  // Trinidad & Tobago variant opens framed on both islands (the 'caribbean'
  // preset is one click away in the region selector) regardless of
  // where the viewer is (the user's own timezone would otherwise pick e.g.
  // 'america' on mobile).
  tt: 'trinidad',
};

/**
 * Resolve the initial map view for a variant. Variants without an explicit
 * default fall back to `fallback` (the pre-existing behaviour: 'global' on
 * desktop, the timezone/geo-resolved region on mobile).
 */
export function getDefaultMapView<T extends string>(variant: string, fallback: T): DefaultMapView | T {
  return VARIANT_DEFAULT_MAP_VIEW[variant] ?? fallback;
}
