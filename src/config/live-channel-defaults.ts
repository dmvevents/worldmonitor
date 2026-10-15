// Per-variant default Live News channel sets (ids from OPTIONAL_LIVE_CHANNELS in
// src/components/LiveNewsPanel.ts). Kept in config so the dashboard tab presets
// can swap the channel strip when a tab switches region.
export const VARIANT_LIVE_CHANNEL_IDS: Partial<Record<string, string[]>> = {
  tt: ['ttt-live', 'cnc3', 'tv6-news', 'tt-parliament', 'tobago-updates', 'bizz-tv', 'cbc-tv8', 'telesur-english', 'sky', 'aljazeera'],
  gy: ['ncn-guyana', 'hgptv', 'mtv-guyana', 'little-guyana-tv', 'telesur-english', 'canal-i', 'venevision-int', 'tvj-hls', 'sky', 'aljazeera'],
  chips: ['bloomberg', 'cnbc', 'yahoo', 'nasa', 'sky', 'aljazeera'],
};
