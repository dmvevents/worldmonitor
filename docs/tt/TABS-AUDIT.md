# Tabs audit — what each hub tab shows, and the restructure (2026-10-18)

Hub: `http://127.0.0.1:3100/dashboard`, `full` variant build with preset tabs. Two views were audited:
Anton's own browser tab (his persisted layout) and a fresh headless Chrome profile (what a new browser
gets). Feed counts come from fetching every URL in `server/worldmonitor/news/v1/_feeds.ts` for the `tt`,
`gy` and `chips` catalogs (147 feeds; 137 returned ≥1 item, 10 returned none at the time).

## 1. Before

### Main (default tab)

| View | Panels | What it was |
|---|---|---|
| Anton's browser | 8: map, live-news, **insights (AI Insights)**, markets, **tech**, **ai (AI/ML)**, monitors, **tech-readiness** | A tech/AI dashboard: 3 of the 6 content panels are AI or tech, no world/regional news, no intelligence, no strategic risk. The tab was created from a layout seeded while another variant was active and never matched the `full` defaults. |
| Fresh profile | **80** panels (every `full` panel incl. the disabled-by-default ones: cascade, correlation panels, telegram-intel, oref-sirens, …) | The default tab is captured from the boot panel set, which on the hub (Pro unlocked) enabled everything. Only 3 panels had rendered items after 12 s (intel 12, politics 20, us 17); the rest were empty shells. |

The `full` variant's real default — `FULL_PANELS` in `src/config/panels.ts`, which is what the registry
uses for `full` (the shorter `src/config/variants/full.ts` is only a description) — is **81 of 102 panels
enabled**: live-news, live-webcams, insights, threat-timeline, strategic-posture, forecast, cii,
strategic-risk, intel, gdelt-intel, the news regions (politics, us, europe, middleeast, africa, latam, asia),
energy, gov, thinktanks, commodities, markets, economic, finance, tech, crypto, ai, layoffs, the market and
energy intelligence panels, and so on. Free-tier users see the first 40 of those (`enforceFreePanelLimit`);
the hub is Pro-unlocked, so the default is the full set. Neither view showed that: Anton's tab had 8, the
fresh profile had captured 80 but in registry order with the intelligence block first.

### Trinidad & Tobago (preset-tt)

Panels (fresh profile, in order): live-news, tt-news, tt-gov, caribbean, tt-energy, tt-education,
tt-telecoms, tt-public-it, tt-safety, tt-weather, latam, politics, energy, energy-complex, monitors,
world-clock. News lenses already came first. Rendering: tt-news 20 items (T&T Headlines, CNC3, TTT, TT
Guardian, Tobago Headlines, Express Local News), tt-gov 4, caribbean 20, tt-energy 14, tt-education 12,
tt-telecoms 13, politics 20; tt-public-it, tt-safety, tt-weather, latam, energy showed 0 after 9 s (lazy
load / low-volume topic queries). Nothing AI-flavoured. Live strip: Hermes's TegoTV channels (not audited
here; see IPTV-HANDOFF §9).

Feed health per lens (server catalog, probed):

| Lens | Feeds | ≥1 item | Empty at probe time |
|---|---|---|---|
| `caribbean` | 18 | 18 | — |
| `tt-education` | 4 | 4 | — |
| `tt-energy` | 6 | 6 | — |
| `tt-gov` | 11 | 8 | Central Statistical Office, Ministry of National Security TT, Office of the Prime Minister |
| `tt-news` | 11 | 11 | — |
| `tt-public-it` | 5 | 4 | Auditor General & PAC |
| `tt-safety` | 5 | 4 | ODPM |
| `tt-telecoms` | 4 | 4 | — |
| `tt-weather` | 6 | 5 | TT Met Office |

`tt-news` carried Power 102 (feed last updated September 2023) and listed the national dailies after the
Express search feeds; Wired868 was missing; Loop TT no longer exists.

### Guyana (preset-gy)

Panels: live-news, gy-news, gy-gov, gy-oil, gy-essequibo, gy-economy, gy-safety, gy-weather, caribbean,
latam, politics, energy, energy-complex, monitors, world-clock. **It does show Guyana news**: gy-news 20
items from iNews Guyana, News Room Guyana, Kaieteur News, Demerara Waves, Village Voice GY, Guyana
Headlines; gy-gov 8 (DPI, Office of the President, Ministry of Natural Resources); gy-oil 11 (Stabroek Block
Watch, OilNOW, Guiana Basin Energy); gy-essequibo 20; gy-economy 12; gy-safety 10; caribbean 20. Generic
items appear only in the shared `politics` panel (CNN/Reuters/BBC world) and `latam`. Nothing AI-flavoured.

| Lens | Feeds | ≥1 item | Empty at probe time |
|---|---|---|---|
| `caribbean` | 8 | 8 | — |
| `gy-economy` | 4 | 4 | — |
| `gy-essequibo` | 4 | 4 | — |
| `gy-gov` | 6 | 4 | GECOM, Parliament of Guyana |
| `gy-news` | 9 | 8 | Stabroek News |
| `gy-oil` | 5 | 4 | Gas-to-Energy and Power |
| `gy-safety` | 3 | 3 | — |
| `gy-weather` | 3 | 3 | — |

Stabroek News and Kaieteur News were both Google News `site:` queries; Stabroek's returned 0 items on the
day, Kaieteur's direct feed serves 25.

### Chips & AI (preset-chips)

Panels: live-news, chips-semis, chips-datacenters, chips-ailabs, chips-policy, chips-markets, ai, hardware,
cloud, markets, heatmap, layoffs, polymarket, monitors, world-clock. All five chips lenses rendered 18–20
items; ai 11, hardware 12, layoffs 10. This tab is the AI dashboard and stays so.

| Lens | Feeds | ≥1 item | Empty at probe time |
|---|---|---|---|
| `chips-ailabs` | 7 | 7 | — |
| `chips-datacenters` | 8 | 8 | — |
| `chips-markets` | 4 | 4 | — |
| `chips-policy` | 4 | 4 | — |
| `chips-semis` | 12 | 12 | — |

## 2. What changed

1. **Main tab = the general World Monitor default, news first.** The variant's own default tab is rebuilt
   once (marker `worldmonitor-tabs-default-reseed-v1:full` in localStorage) from the `full` default panel
   set plus two hub extras: the **Caribbean** lens and a **world clock** (`PRESET_EXTRA_PANELS` in
   `src/config/dashboard-tabs.ts`). Later customisations stick. Anton's 8-panel AI layout and the fresh
   profile's 80-panel capture both become the 82-panel default (81 + the Caribbean lens; world clock was
   already in the full set), with the news lenses first. If a leaner Main is wanted, the free-tier default
   (first 40) or a curated subset is a one-line change in `PRESET_EXTRA_PANELS` / the own-variant preset.
2. **News leads every tab.** `orderNewsFirst()` orders each preset tab map → live strip → news lenses
   (panels with a `CANONICAL_FEEDS` category) → everything else, each group in the variant's order.
   Untouched preset tabs pick the order up on boot; customised ones keep the user's order. Main therefore
   opens with politics, us, europe, middleeast, africa, latam, asia, energy, gov, thinktanks, tech, finance,
   economic, crypto, ai, caribbean … before intel / cii / strategic-risk / markets.
3. **T&T news lens** (`tt-news`, client + server + docs): TT Guardian, Trinidad Express, Newsday, CNC3, TV6
   News, TTT, **Wired868 (added, Google News `site:wired868.com when:2d`)**, Express Local News, Tobago
   Updates, Tobago Headlines, T&T Headlines. **Removed Power 102** (stale since 2023). Loop TT not added
   (site gone). Guardian, Newsday, CNC3, Wired868 publish no reachable RSS (404 / WAF 403 / timeout), so
   they stay on Google News site queries.
4. **Guyana news lens** (`gy-news`): Stabroek News, Kaieteur News, Guyana Chronicle, News Room Guyana,
   Demerara Waves, iNews Guyana, Guyana Times, Village Voice GY, Guyana Headlines. **Kaieteur switched to
   its direct feed** `https://kaieteurnewsonline.com/feed/` (25 items). OilNOW stays in `gy-oil`
   (site 403s, Google News query); DPI (ex-GINA) stays in `gy-gov` (direct feed, 20 items).
5. Chips & AI: unchanged apart from the news-first order (its lenses already led).

Scope rule unchanged: public news and official sources, aggregate and topic level.

## 3. Feed URLs verified for this change (fetched 2026-10-18)

| Feed | URL | Result |
|---|---|---|
| Kaieteur News (direct, added) | https://kaieteurnewsonline.com/feed/ | 200, 25 items, newest same day |
| Wired868 (added, Google News) | https://news.google.com/rss/search?q=site:wired868.com+when:2d&hl=en-US&gl=US&ceid=US:en | 200, 4 items |
| Power 102 (removed) | https://power102fm.com/feed/ | 200 but 2 items, newest 2023-09-13 |
| Stabroek News direct (not usable) | https://www.stabroeknews.com/feed/ (and /rss, /feed/atom/, /category/news/feed/) | 404 / 522 |
| News Room Guyana direct (not usable) | https://newsroom.gy/feed/ | 403 (WAF) |
| OilNOW direct (not usable) | https://oilnow.gy/feed/ | 403 (WAF) |
| Guardian direct (none) | https://www.guardian.co.tt/rss, /feed, /rss/news | 404 |
| Newsday direct (not usable) | https://newsday.co.tt/feed/ | connection timeout |
| CNC3 direct (not usable) | https://www.cnc3.co.tt/feed/ | 403 |
| Wired868 direct (not usable) | https://wired868.com/feed/ | 403 |
| Loop TT | https://tt.loopnews.com/rss.xml, https://www.looptt.com/rss.xml | unreachable (outlet closed) |
| Direct feeds kept | iNews 10, Guyana Chronicle 10, Guyana Times 10, Demerara Waves 10, Village Voice 10, DPI 20, TTT 10, Express 25, TV6 25, TT Parliament 10 (newest Sep 23), Tobago Updates 10 (newest Aug 28) | 200 |

## 4. After — verified on the rebuilt hub (headless Chrome, fresh profile, first boot after the re-seed, 2026-10-18 17:10 EDT)

| Tab | Enabled panels | Order (first panels) | News rendering |
|---|---|---|---|
| Main | 82 (full default 81 + Caribbean) | map → live strip → **politics, us, europe, middleeast, africa, latam, asia** (under the map in the ultra-wide layout) → energy, gov, thinktanks, commodities, markets, economic, supply-chain, finance, tech, crypto, ai, layoffs, caribbean → intel, cii, strategic-risk … | politics 20 (CNN World, Reuters World, BBC World, AP, Guardian), us 15, europe 20, middleeast 20, africa 15, asia 16, latam 6, energy 15, gov 13, thinktanks 15, finance 15 after 18 s; the rest mount lazily on scroll |
| Trinidad & Tobago | 17 | live strip → tt-news, tt-gov, caribbean, tt-energy, tt-education, tt-telecoms, tt-public-it, tt-safety, tt-weather → latam, politics, energy, energy-complex, monitors, world-clock | tt-news 20 (T&T Headlines, CNC3, TTT, **Wired868**, TT Guardian …), tt-gov 4, caribbean 20, tt-energy 14, tt-education 12, tt-telecoms 13; after scrolling tt-public-it 8, tt-safety 15, tt-weather 19 |
| Guyana | 16 | live strip → gy-news, gy-gov, gy-oil, gy-essequibo, gy-economy, gy-safety, gy-weather, caribbean → latam, politics, energy … | gy-news 20 (iNews, News Room, Demerara Waves, Village Voice, Guyana Headlines, Chronicle, Kaieteur), gy-gov 8 (DPI, Office of the President, Natural Resources), gy-oil 11 (Stabroek Block Watch, OilNOW, Guiana Basin), gy-essequibo 20, caribbean 20 |
| Chips & AI | 18 | live strip → chips-semis, chips-datacenters, chips-ailabs, chips-policy, chips-markets, ai, hardware, cloud, markets, layoffs … | all five chips lenses 18–20 items, ai 11, layoffs 10 |

Lower rows on every tab are deferred shells until scrolled into view (the grid `#panelsGrid` is the scroll
container; 900 px look-ahead). That is the pre-existing lazy-mount behaviour, re-checked on this build by
scrolling the T&T tab: every lens mounted and loaded.

**Regression found and fixed during verification.** The first version applied the re-seeded Main tab
*after* boot (`applyTabPanelState` from `initPanelTabs`). On that first boot, lenses on the other tabs stayed
as unmounted shells until the next reload (T&T showed only tt-news and tt-gov; Guyana only gy-news and
gy-gov). The re-seed now runs before `createPanels()` and rewrites the boot panel set and saved order
directly, so no post-boot apply is needed; confirmed by the table above. The post-boot apply path itself
(restoring a tab whose set differs from the boot set) is unchanged and remains a suspect for the same
symptom; noted in the worklog as an open item.

**Known empty-at-probe feeds (topic queries, not errors):** GECOM, Parliament of Guyana, Gas-to-Energy and
Power, Central Statistical Office, Ministry of National Security TT, Office of the Prime Minister, Auditor
General & PAC, ODPM, TT Met Office — Google News `site:`/topic queries that return 0 on quiet days. Stabroek
News is not indexed by Google News at all (0 items even at 7 days) and Newsday barely (2 at 7 days); both
sites refuse direct feeds (404/522, timeout) and Bing News returns years-old items, so those two names are
present but thin until the outlets expose a feed. The `Guyana Press` combined query (Stabroek, Kaieteur, News
Room, Demerara) and the national headline queries cover the gap.

**Anton's browser:** his tab still had the 8-panel Main at the time of writing (re-seed marker absent); a
reload applies the re-seed once and switches Main to the default above.

## 5. Addendum 2026-10-19 — WM Analyst joins the T&T and Guyana tabs

- `chat-analyst` added to `TT_PANELS` and `GY_PANELS` in `src/config/panels.ts` (and mirrored in
  `src/config/variants/tt.ts` / `gy.ts`). On these tabs the panel sends `geoContext` (TT / GY) and the server
  adds the tab's own digest as "Regional Headlines", so the answer is about Trinidad or Guyana, not the global brief.
- Gotcha found while doing it: `src/config/variants/<v>.ts` `DEFAULT_PANELS` does not drive the preset tabs —
  `getVariantEnabledPanelKeys()` reads `panels.ts`. Editing only the variant file builds a bundle without the panel.
- Existing profiles: `healPresetTabs` re-applies a preset whose stored enabled set is a strict subset of the new
  one, so the panel appears on the next load without a reset.
