# World Monitor T&T Fork UX/Robustness Review

**Date:** 2026-10-17  
**Instance:** Trinidad & Tobago Intelligence Hub (http://127.0.0.1:3100)  
**Branch:** main (dmvevents/worldmonitor fork)  
**Context:** Regional preset tabs missing custom panels due to instantiation bug (being fixed separately)

---

## 1. Tab-by-Tab Layout Analysis

### Trinidad & Tobago Tab

**Objective:** Surface T&T-specific intelligence (government, crime, telecoms, education, energy, Caribbean geopolitics).

**Layout Assessment:** ❌ **Fails objective**

- Shows only 5 shared panels: Live News (Bizz TV), Energy & Resources, Energy Complex, World Clock, My Monitors
- **Missing custom panels:** T&T News, Government & Official, Caribbean & Geopolitics, Energy & LNG, Education, Telecoms, Public-Sector IT, Crime & Public Safety, Weather & Hurricanes
- **Bottom 30% empty:** Three "CREATE INTERACTIVE WIDGET" (PRO) and "CONNECT MCP" (PRO) upsell cards occupy panel slots that should contain T&T-specific content
- **Live News panel:** Shows single Bizz TV (TRT) channel with "PLAY LIVE FEED" button—placeholder state, not actual feed integration
- **Empty bottom row:** Wasted vertical space below upsell cards

### Guyana Tab

**Objective:** Surface Guyana-specific intelligence (government, border disputes, resource extraction, regional geopolitics).

**Layout Assessment:** ❌ **Fails objective**

- Identical panel layout to T&T tab (only difference: Live News shows HGPTV instead of Bizz TV)
- Same 5 shared panels, same 3 Pro upsell cards
- **Missing custom panels:** All Guyana-specific panels that should differentiate this tab
- Same placeholder Live News state and empty bottom row

### Main Tab (Global)

**Objective:** Comprehensive global intelligence dashboard with AI-powered insights, breaking news, markets, military activity.

**Layout Assessment:** ⚠️ **Partial success**

- **Good:** Shows AI Insights header, Markets panel with indices, Technology panel, Tech Readiness Index
- **Issues:**
  - **AI Insights shows "UNAVAILABLE"** (3 breaking, 0 developing, 7 alerts displayed but marked unavailable)
  - **Live News:** Bloomberg feed placeholder with "PLAY LIVE FEED" button (not integrated)
  - **Bottom upsell cards:** Two PRO cards still occupy panel slots
  - **Missing:** Live Intelligence stream, Geopolitical Risk Map panels
  - **News duplication:** World News panel headlines repeat across multiple sources (Hurricane Trudy appears 3x in screenshot)

---

## 2. Upstream Comparison (worldmonitor.app)

Based on upstream product documentation and expected SPA defaults:

| Feature | Upstream Expected | T&T Fork Status | Issue |
|---------|------------------|-----------------|-------|
| AI Insights | Available, populated | Header shows "UNAVAILABLE" | Backend integration broken |
| Live Intelligence | Real-time feed panel | Missing entirely | Not instantiated |
| Markets Panel | ✅ Present | ✅ Present | Working |
| Regional News Panels | Variant-specific | Missing (regional tabs) | Known preset bug |
| Live TV Integration | Embedded video players | Placeholder "PLAY LIVE FEED" | Not connected |
| Pro Upsell Cards | Hidden when Pro unlocked | Always visible | Entitlement check missing |
| Panel Density | 6-8 panels visible | 5 panels + 3 upsell cards | Low information density |
| Empty States | Honest "No data" messages | Spinners/placeholders | UX degradation |

**Degraded/Missing Standard Features:**

1. **AI Insights backend:** Marked UNAVAILABLE despite showing counts
2. **Live Intelligence feed:** Not present in any tab
3. **Pro upsell suppression:** Cards shown even in self-hosted (presumably Pro-unlocked) instance
4. **Regional panel instantiation:** Known bug, being fixed
5. **Live TV integration:** Shows placeholders, not embedded streams

---

## 3. Robustness Recommendations (Ranked by Impact/Effort)

| Rank | Recommendation | Impact | Effort | Component | Reasoning |
|------|---------------|--------|--------|-----------|-----------|
| 1 | **Hide Pro upsell cards when unlocked** | High | Low | `PanelLayoutManager.addProUpsellCards()` | Self-hosted instance should not show paid upgrade prompts; check `isProUser()` before rendering |
| 2 | **Honest empty states for unavailable features** | High | Low | `NewsPanel.ts`, `LiveNewsPanel.ts` | Replace spinners with "Configure data source" or "Feature not enabled" messages |
| 3 | **Panel density optimization** | High | Medium | `panel-layout.ts` | Regional tabs need 8-10 panels; remove bottom empty row; tighten vertical spacing |
| 4 | **Data freshness indicator** | Medium | Low | New component: `DataFreshnessIndicator.ts` | Add timestamp badge to panels showing last update (leverages existing `seed-meta:<key>` Redis data) |
| 5 | **Preset self-heal on mount** | High | Medium | `dashboard-tabs.ts`, `panel-layout.ts` | Validate preset tab panels exist in variant defaults on mount; log warnings; fall back to shared panels |
| 6 | **AI Insights graceful degradation** | Medium | Low | `AIInsightsPanel.ts` (if exists) | Change "UNAVAILABLE" to "Configure AI backend" with settings link; hide counts when zero |
| 7 | **Live TV offline handling** | Medium | Low | `LiveNewsPanel.ts` | Replace "PLAY LIVE FEED" button with "Stream offline" or channel schedule when source unreachable |
| 8 | **News deduplication** | Low | Medium | `analysis.worker.ts` | Improve clustering to merge duplicate headlines from different sources within same panel |
| 9 | **Panel ordering per tab** | Medium | Medium | `dashboard-tabs.ts` presets | Define explicit panel order arrays per preset (e.g., T&T News first, then Government, then Crime) |
| 10 | **Mobile panel nav visibility** | Low | Low | `MobilePanelNav.ts` | Ensure tab switcher is accessible on mobile viewports (not visible in screenshots) |

### Priority Implementation Order (Quick Wins First):

**Week 1 (Low-hanging fruit):**

- Hide Pro upsell cards (#1) — one conditional in `PanelLayoutManager`
- Honest empty states (#2) — replace loading spinners with clear messages
- AI Insights degradation (#6) — change "UNAVAILABLE" text

**Week 2 (Medium effort, high impact):**

- Preset self-heal (#5) — validate panel keys on mount
- Panel density (#3) — adjust grid layout, remove empty bottom row
- Data freshness indicator (#4) — add timestamp badges

**Week 3 (Polish):**

- Live TV offline handling (#7)
- Panel ordering (#9)
- News deduplication (#8)

---

## 4. Visual Defects Identified

1. **Clipped text:** None observed
2. **Overlapping elements:** None observed
3. **Wrong zoom/region:** 
   - Main tab: Map shows global view with "Trinidad & Tobago - double-click to resume" tooltip visible—suggests user zoomed out from regional view
4. **Duplicated items:**
   - Hurricane Trudy appears 3x in World News panel (Main tab)
   - "Trump orders US government to cut ties with Anthropic; Magelan declares supply chain 'risk talks' on ..." appears twice in AI/ML section
5. **Layout breaks:** None observed
6. **Color/contrast issues:** None observed—dark theme applied consistently
7. **Icon/badge issues:** PRO badges show correctly on panel headers

---

## 5. Specific Component Changes Required

### PanelLayoutManager (`src/app/panel-layout.ts`)

```typescript
// Before rendering Pro upsell cards:
addProUpsellCards() {
  if (isProUser() || !isWebEnvironment()) {
    return; // Skip upsell cards for Pro users or desktop/self-hosted
  }
  // ... existing card rendering
}
```

### Panel Base Class (`src/components/Panel.ts`)

```typescript
// Add method for honest empty states:
showEmptyState(reason: 'no-data' | 'not-configured' | 'offline', message: string) {
  this.setContent(`
    <div class="panel-empty-state">
      <div class="empty-icon">${getIconForReason(reason)}</div>
      <p>${message}</p>
      ${reason === 'not-configured' ? '<a href="/settings">Configure</a>' : ''}
    </div>
  `);
}
```

### Preset Tabs (`src/config/dashboard-tabs.ts`)

```typescript
// Validate panel keys on mount:
function toPresetTab(p: PresetTabSource): PresetTab {
  const panelKeys = getVariantEnabledPanelKeys(p.variant);
  const validKeys = panelKeys.filter(key => isPanelInVariantDefaults(key, SITE_VARIANT));
  
  if (validKeys.length !== panelKeys.length) {
    console.warn(`Preset ${p.id}: ${panelKeys.length - validKeys.length} panels not in host variant`, {
      missing: panelKeys.filter(k => !validKeys.includes(k))
    });
  }
  
  return { ...presetFields, panelKeys: validKeys.length > 0 ? validKeys : getSharedPanelKeys() };
}
```

### UnifiedSettings (`src/components/UnifiedSettings.ts`)

```typescript
// Add data freshness section:
renderDataFreshness() {
  const freshness = getSeedMetaFreshness(); // from bootstrap
  return `
    <div class="settings-section">
      <h3>Data Freshness</h3>
      ${freshness.map(s => `
        <div class="freshness-item ${s.isStale ? 'stale' : 'fresh'}">
          <span>${s.name}</span>
          <span>${formatRelativeTime(s.fetchedAt)}</span>
        </div>
      `).join('')}
    </div>
  `;
}
```

---

## Summary

The T&T fork suffers from **low information density** (30% of screen real estate wasted on Pro upsell cards and empty space), **unclear feature states** (AI Insights "UNAVAILABLE", Live News placeholders), and **missing regional content** (known preset bug). The Main tab performs better but still shows degraded AI features and duplication.

**Highest-impact fixes:**

1. Suppress Pro upsell cards in self-hosted instances
2. Replace loading/unavailable states with honest explanations
3. Implement preset self-heal to prevent empty regional tabs
4. Add visible data freshness indicators
5. Optimize panel density (remove empty bottom row, tighten spacing)

These changes require minimal effort (mostly conditional rendering and copy changes) but dramatically improve perceived quality and trustworthiness of the self-hosted instance.
