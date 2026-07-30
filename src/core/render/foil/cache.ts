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
    cached = fetch(url).then((response) => {
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
 */
export function fetchImageBitmap(url: string): Promise<ImageBitmap> {
  let cached = imageCache.get(url);
  if (!cached) {
    imageFetches += 1;
    cached = fetch(url)
      .then((response) => {
        if (!response.ok) throw new Error(`texture ${url}: ${response.status}`);
        return response.blob();
      })
      .then((blob) =>
        createImageBitmap(blob, {
          imageOrientation: "flipY",
          colorSpaceConversion: "none",
        }),
      );
    imageCache.set(url, cached);
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
