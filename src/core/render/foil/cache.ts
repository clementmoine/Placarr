import { isAllowedNextImageRemoteUrl } from "@/core/enrich/media/nextImageRemoteGuard";

const fragmentCache = new Map<string, Promise<string>>();
const imageCache = new Map<string, Promise<ImageBitmap>>();
const bufferCache = new Map<string, Promise<ArrayBuffer>>();

let fragmentFetches = 0;
let imageFetches = 0;
let bufferFetches = 0;

export function fetchFragmentSource(url: string): Promise<string> {
  let cached = fragmentCache.get(url);
  if (!cached) {
    fragmentFetches += 1;
    // `no-store`: dumps are rewritten on disk during extract; a sticky HTTP
    // cache kept orphan `#endif` blobs after a re-extract and broke WebGL.
    cached = fetch(url, { cache: "no-store" }).then((response) => {
      if (!response.ok) throw new Error(`shader ${url}: ${response.status}`);
      return response.text();
    });
    fragmentCache.set(url, cached);
  }
  return cached;
}

/**
 * Decoded images, one fetch per URL however many layers sample it.
 *
 * `flipY` at decode, not at upload: `UNPACK_FLIP_Y_WEBGL` is unreliable for
 * `ImageBitmap` sources, and Unity's UV origin is bottom-left where the
 * browser decodes top-left — without the flip every effect is upside down.
 *
 * `colorSpaceConversion: "none"`: the app runs in gamma and samples texture
 * bytes as authored. The browser's default conversion pulls JPEGs into the
 * display space and washes the foil against what the phone shows.
 *
 * Absolute `https://` URLs that CDNs block from anonymous `fetch` (CORS) are
 * rewritten through `/_next/image` when the host is allowlisted — same-origin
 * for WebGL, server-side fetch for the bytes.
 */
/** Next.js only allows configured `images.qualities` (default: 75). */
const FOIL_NEXT_IMAGE_QUALITY = "75";

export function foilTextureRequestUrl(url: string): string {
  if (!/^https:\/\//i.test(url)) return url;
  if (!isAllowedNextImageRemoteUrl(url)) return url;
  const params = new URLSearchParams({
    url,
    w: "1080",
    q: FOIL_NEXT_IMAGE_QUALITY,
  });
  return `/_next/image?${params.toString()}`;
}

export function fetchImageBitmap(url: string): Promise<ImageBitmap> {
  const requestUrl = foilTextureRequestUrl(url);
  let cached = imageCache.get(requestUrl);
  if (!cached) {
    imageFetches += 1;
    cached = fetch(requestUrl)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`texture ${requestUrl}: ${response.status}`);
        }
        return response.blob();
      })
      .then((blob) =>
        createImageBitmap(blob, {
          imageOrientation: "flipY",
          colorSpaceConversion: "none",
        }),
      );
    imageCache.set(requestUrl, cached);
  }
  return cached;
}

export function fetchArrayBuffer(url: string): Promise<ArrayBuffer> {
  let cached = bufferCache.get(url);
  if (!cached) {
    bufferFetches += 1;
    cached = fetch(url).then((response) => {
      if (!response.ok) throw new Error(`buffer ${url}: ${response.status}`);
      return response.arrayBuffer();
    });
    bufferCache.set(url, cached);
  }
  return cached;
}

export function __foilCacheStats(): {
  fragmentFetches: number;
  imageFetches: number;
  bufferFetches: number;
} {
  return { fragmentFetches, imageFetches, bufferFetches };
}

export function __resetFoilCachesForTests(): void {
  fragmentCache.clear();
  imageCache.clear();
  bufferCache.clear();
  fragmentFetches = 0;
  imageFetches = 0;
  bufferFetches = 0;
}
