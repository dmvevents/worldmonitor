import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { getPresetTabs, getOwnVariantPreset } from '../src/config/dashboard-tabs';
import { VARIANT_LIVE_CHANNEL_IDS } from '../src/config/live-channel-defaults';
import { VARIANT_FEEDS } from '../server/worldmonitor/news/v1/_feeds';
import { ALL_PANELS } from '../src/config/panels';

const __dirname = dirname(fileURLToPath(import.meta.url));
const liveNewsSrc = readFileSync(resolve(__dirname, '../src/components/LiveNewsPanel.ts'), 'utf-8');
const mapViewSrc = readFileSync(resolve(__dirname, '../src/config/map-view.ts'), 'utf-8');

// Channel ids declared anywhere in LiveNewsPanel (FULL/TECH/OPTIONAL arrays share one literal shape).
const declaredChannelIds = new Set([...liveNewsSrc.matchAll(/\{\s*id:\s*'([a-z0-9-]+)'/g)].map((m) => m[1]));
const mapViews = new Set(
  (mapViewSrc.match(/export type DefaultMapView =([\s\S]*?);/)?.[1] ?? '').match(/'([a-z]+)'/g)?.map((v) => v.replace(/'/g, '')) ?? [],
);

describe('dashboard tab presets (regional / topic monitors)', () => {
  for (const variant of ['full', 'tt', 'gy', 'chips']) {
    it(`${variant}: every preset tab resolves to real panels, a known map view and declared live channels`, () => {
      const presets = getPresetTabs(variant);
      assert.ok(presets.length >= 2, `${variant} should offer at least two preset tabs`);
      for (const preset of presets) {
        assert.ok(preset.panelKeys.length >= 5, `${preset.id} must enable several panels`);
        for (const key of preset.panelKeys) {
          assert.ok(ALL_PANELS[key], `${preset.id} enables unknown panel "${key}"`);
        }
        assert.ok(mapViews.has(preset.mapView), `${preset.id} map view "${preset.mapView}" is not a DefaultMapView`);
        assert.ok(preset.mapTitle.trim().length > 0, `${preset.id} needs a map header title`);
        assert.ok(preset.liveChannelIds.length >= 4, `${preset.id} needs a live channel set`);
        for (const id of preset.liveChannelIds) {
          assert.ok(declaredChannelIds.has(id), `${preset.id} references undeclared live channel "${id}"`);
        }
      }
    });
  }

  it('every variant default live-channel id is declared in LiveNewsPanel', () => {
    for (const [variant, ids] of Object.entries(VARIANT_LIVE_CHANNEL_IDS)) {
      for (const id of ids ?? []) {
        assert.ok(declaredChannelIds.has(id), `VARIANT_LIVE_CHANNEL_IDS.${variant} references undeclared channel "${id}"`);
      }
    }
  });

  it('news panels enabled by a preset have feeds in the variant catalog (server mirror of the client feeds)', () => {
    for (const variant of ['tt', 'gy', 'chips']) {
      const own = getOwnVariantPreset(variant);
      assert.ok(own, `${variant} needs an own-variant preset`);
      const catalog = VARIANT_FEEDS[variant] ?? {};
      const regional = own.panelKeys.filter((k) => k.startsWith(`${variant}-`) || k === 'caribbean');
      assert.ok(regional.length >= 4, `${variant} preset should carry its regional news lenses`);
      for (const key of regional) {
        assert.ok(Array.isArray(catalog[key]), `preset news panel "${key}" has no ${variant} feed category`);
        assert.ok((catalog[key] ?? []).length >= 3, `category "${key}" should have at least 3 feeds`);
      }
    }
  });

  it('the own-variant preset restores the variant default view and channels', () => {
    assert.equal(getOwnVariantPreset('tt')?.mapView, 'trinidad');
    assert.equal(getOwnVariantPreset('gy')?.mapView, 'guyana');
    assert.equal(getOwnVariantPreset('full')?.mapView, 'global');
    assert.deepEqual(getOwnVariantPreset('tt')?.liveChannelIds, VARIANT_LIVE_CHANNEL_IDS.tt);
  });
});
