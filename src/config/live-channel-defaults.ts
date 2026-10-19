// Per-variant default Live News channel sets (ids from OPTIONAL_LIVE_CHANNELS in
// src/components/LiveNewsPanel.ts). Kept in config so the dashboard tab presets
// can swap the channel strip when a tab switches region.
export const VARIANT_LIVE_CHANNEL_IDS: Partial<Record<string, string[]>> = {
  full: ['bloomberg', 'sky', 'euronews', 'dw', 'cnbc', 'cnn', 'france24', 'alarabiya', 'aljazeera', 'telesur-english', 'cbc-tv8', 'tvj-hls', 'bizz-tv', 'hgptv'],
  tt: ['ttt-live', 'ietv', 'synergy-tv', 'gayelle-tv', 'bizz-tv', 'sankhya-tv', 'scorch-tv', 'cnc3', 'tv6-news', 'tt-parliament', 'tha-tobago', 'tobago-updates', 'tobago-channel5', 'newsday-tt', 'ttps', 'freedom-1065', 'caricom', 'cbc-tv8', 'ziz-tv', 'sky', 'aljazeera'],
  gy: ['hgptv', 'mtv-guyana', 'little-guyana-tv', 'gtn-canada', 'ncn-guyana', 'newsroom-guyana', 'dtv8-guyana', 'ignite-news-gy', 'dpi-guyana', 'gy-parliament', 'kaieteur-news', 'inews-guyana', 'stabroek-news', 'glc-guyana', 'caricom', 'sky', 'aljazeera'],
  chips: ['bloomberg', 'cnbc', 'yahoo', 'nasa', 'sky', 'aljazeera'],
};
