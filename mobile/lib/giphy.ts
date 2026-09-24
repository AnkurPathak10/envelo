const GIPHY_API_URL = 'https://api.giphy.com/v1/gifs';
const RESULT_LIMIT = 24;

interface GiphyRendition {
  height?: string;
  url?: string;
  width?: string;
  webp?: string;
}

interface GiphyApiItem {
  id?: string;
  title?: string;
  images?: {
    fixed_width?: GiphyRendition;
    downsized_medium?: GiphyRendition;
    original?: GiphyRendition;
  };
}

interface GiphyApiResponse {
  data?: GiphyApiItem[];
}

export interface GifResult {
  id: string;
  title: string;
  url: string;
  previewUrl: string;
  width: number;
  height: number;
}

export function isGiphyConfigured(): boolean {
  return Boolean(process.env.EXPO_PUBLIC_GIPHY_API_KEY?.trim());
}

function renditionSize(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function toGifResult(item: GiphyApiItem): GifResult | null {
  const id = item.id?.trim();
  const preview = item.images?.fixed_width;
  const original = item.images?.downsized_medium ?? item.images?.original;
  const previewUrl = preview?.webp ?? preview?.url;
  const url = original?.url ?? original?.webp ?? previewUrl;
  if (!id || !url || !previewUrl) return null;

  return {
    id,
    title: item.title?.trim() || 'GIF',
    url,
    previewUrl,
    width: renditionSize(original?.width ?? preview?.width, 320),
    height: renditionSize(original?.height ?? preview?.height, 240),
  };
}

export async function getGifs(
  query: string,
  signal?: AbortSignal
): Promise<GifResult[]> {
  const apiKey = process.env.EXPO_PUBLIC_GIPHY_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      'Add EXPO_PUBLIC_GIPHY_API_KEY to mobile/.env to use GIFs.'
    );
  }

  const trimmedQuery = query.trim().slice(0, 50);
  const endpoint = trimmedQuery ? 'search' : 'trending';
  const parameters = new URLSearchParams({
    api_key: apiKey,
    limit: String(RESULT_LIMIT),
    rating: 'pg',
  });
  if (trimmedQuery) parameters.set('q', trimmedQuery);

  const response = await fetch(
    `${GIPHY_API_URL}/${endpoint}?${parameters.toString()}`,
    { signal }
  );
  if (!response.ok) throw new Error('GIPHY could not load GIFs right now.');

  const body = (await response.json()) as GiphyApiResponse;
  return (body.data ?? [])
    .map(toGifResult)
    .filter((item): item is GifResult => item !== null);
}

export function isGiphyMediaUrl(value: string | null): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      /^(?:media\d*|i)\.giphy\.com$/i.test(url.hostname)
    );
  } catch {
    return false;
  }
}
