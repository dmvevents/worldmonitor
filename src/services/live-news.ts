import { toApiUrl } from '@/services/runtime';

interface LiveVideoInfo {
  videoId: string | null;
  hlsUrl: string | null;
  /** Most recent upload when the channel is not live (newscast replay for stations that only stream on air). */
  latestVideoId?: string | null;
}

const liveVideoCache = new Map<string, { videoId: string | null; hlsUrl: string | null; latestVideoId: string | null; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function fetchLiveVideoInfo(channelHandle: string): Promise<LiveVideoInfo> {
  const cached = liveVideoCache.get(channelHandle);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return { videoId: cached.videoId, hlsUrl: cached.hlsUrl, latestVideoId: cached.latestVideoId };
  }

  try {
    const res = await fetch(toApiUrl(`/api/youtube/live?channel=${encodeURIComponent(channelHandle)}`));
    if (!res.ok) throw new Error('API error');
    const data = await res.json();
    const videoId = data.videoId || null;
    const hlsUrl = data.hlsUrl || null;
    const latestVideoId = typeof data.latestVideoId === 'string' && /^[A-Za-z0-9_-]{11}$/.test(data.latestVideoId) ? data.latestVideoId : null;
    liveVideoCache.set(channelHandle, { videoId, hlsUrl, latestVideoId, timestamp: Date.now() });
    return { videoId, hlsUrl, latestVideoId };
  } catch (error) {
    console.warn(`[LiveNews] Failed to fetch live info for ${channelHandle}:`, error);
    return { videoId: null, hlsUrl: null };
  }
}

/** @deprecated Use fetchLiveVideoInfo instead */
export async function fetchLiveVideoId(channelHandle: string): Promise<string | null> {
  const info = await fetchLiveVideoInfo(channelHandle);
  return info.videoId;
}
