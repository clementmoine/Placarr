/**
 * Decode retail barcodes from a live video frame.
 *
 * Prefer native BarcodeDetector when present; otherwise the same ZXing
 * ponyfill @yudiel/react-qr-scanner uses (Safari/iOS has no native API —
 * Auto mode used to silently skip barcodes there).
 */

const FORMATS = [
  "ean_13",
  "ean_8",
  "upc_a",
  "upc_e",
  "code_128",
  "qr_code",
] as const;

export type BarcodeDetectorSource = "native" | "zxing" | "none";

let lastDetectorSource: BarcodeDetectorSource = "none";

/** Which backend answered the last ensureDetector() (native vs ZXing ponyfill). */
export function getBarcodeDetectorSource(): BarcodeDetectorSource {
  return lastDetectorSource;
}

type DetectorResult = {
  rawValue?: string;
  boundingBox?: { x: number; y: number; width: number; height: number };
};

type DetectorInstance = {
  detect: (source: ImageBitmapSource) => Promise<DetectorResult[]>;
};

export type BarcodeHit = {
  value: string;
  /** Pixel box in the video’s intrinsic coordinate space, when the detector provides one. */
  box?: { x: number; y: number; width: number; height: number };
};

type DetectorCtor = new (opts?: {
  formats?: string[];
}) => DetectorInstance;

let detector: DetectorInstance | null | undefined;
let detectorPromise: Promise<DetectorInstance | null> | null = null;

function globalRoot(): typeof globalThis {
  if (typeof window !== "undefined") return window;
  return globalThis;
}

function nativeCtor(): DetectorCtor | null {
  const Ctor = (globalRoot() as { BarcodeDetector?: DetectorCtor })
    .BarcodeDetector;
  return typeof Ctor === "function" ? Ctor : null;
}

async function loadPonyfillCtor(): Promise<DetectorCtor | null> {
  try {
    const mod = await import("barcode-detector/ponyfill");
    const Ctor = mod.BarcodeDetector as unknown as DetectorCtor;
    return typeof Ctor === "function" ? Ctor : null;
  } catch {
    return null;
  }
}

async function ensureDetector(): Promise<DetectorInstance | null> {
  if (detector !== undefined) return detector;
  if (detectorPromise) return detectorPromise;

  detectorPromise = (async () => {
    const Native = nativeCtor();
    if (Native) {
      try {
        detector = new Native({ formats: [...FORMATS] });
        lastDetectorSource = "native";
        return detector;
      } catch {
        /* fall through to ponyfill */
      }
    }
    const Pony = await loadPonyfillCtor();
    if (!Pony) {
      detector = null;
      lastDetectorSource = "none";
      return null;
    }
    try {
      // Lazy ZXing WASM ponyfill — Safari / desktop without BarcodeDetector.
      detector = new Pony({ formats: [...FORMATS] });
      lastDetectorSource = "zxing";
      return detector;
    } catch {
      detector = null;
      lastDetectorSource = "none";
      return null;
    }
  })();

  return detectorPromise;
}

/**
 * Auto can decode barcodes whenever the ZXing ponyfill (or native API) loads.
 * Always true in the client bundle — do not gate on Chrome-only native API.
 */
export function isBarcodeDetectorSupported(): boolean {
  return true;
}

/** Reset cached detector (tests). */
export function resetBarcodeDetectorForTests(): void {
  detector = undefined;
  detectorPromise = null;
  lastDetectorSource = "none";
}

export async function detectBarcodeFromVideo(
  video: HTMLVideoElement,
): Promise<string | null> {
  const hit = await detectBarcodeHitFromVideo(video);
  return hit?.value ?? null;
}

/** Same as detectBarcodeFromVideo, plus optional bounding box for vision overlay. */
export async function detectBarcodeHitFromVideo(
  video: HTMLVideoElement,
): Promise<BarcodeHit | null> {
  if (!video.videoWidth) return null;
  const d = await ensureDetector();
  if (!d) return null;
  try {
    const codes = await d.detect(video);
    const first = codes[0];
    const raw = first?.rawValue?.trim();
    if (!raw) return null;
    const bb = first.boundingBox;
    const box =
      bb &&
      Number.isFinite(bb.x) &&
      Number.isFinite(bb.y) &&
      Number.isFinite(bb.width) &&
      Number.isFinite(bb.height) &&
      bb.width > 0 &&
      bb.height > 0
        ? { x: bb.x, y: bb.y, width: bb.width, height: bb.height }
        : undefined;
    return { value: raw, box };
  } catch {
    return null;
  }
}
