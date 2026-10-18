// Per-variant default Live News channel sets (ids from OPTIONAL_LIVE_CHANNELS in
// src/components/LiveNewsPanel.ts). Kept in config so the dashboard tab presets
// can swap the channel strip when a tab switches region.
export const VARIANT_LIVE_CHANNEL_IDS: Partial<Record<string, string[]>> = {
  full: ['bloomberg', 'sky', 'euronews', 'dw', 'cnbc', 'cnn', 'france24', 'alarabiya', 'aljazeera', 'telesur-english', 'cbc-tv8', 'tvj-hls', 'bizz-tv', 'hgptv'],
  tt: ['ttt-live', 'ietv', 'synergy-tv', 'gayelle-tv', 'bizz-tv', 'cnc3', 'tv6-news', 'tt-parliament', 'tobago-updates', 'cbc-tv8', 'ziz-tv', 'telesur-english', 'sky', 'aljazeera'],
  gy: ['hgptv', 'mtv-guyana', 'little-guyana-tv', 'gtn-canada', 'ncn-guyana', 'dtv8-guyana', 'ignite-news-gy', 'gy-parliament', 'telesur-english', 'canal-i', 'venevision-int', 'tvj-hls', 'sky', 'aljazeera'],
  chips: ['bloomberg', 'cnbc', 'yahoo', 'nasa', 'sky', 'aljazeera'],
};
