/**
 * Collector-band geometry + filters shared by client helpers and server PP-OCR.
 *
 * Live identify runs client PP-OCR first (`paddleCollectorOcr.client`,
 * ppu-paddle-ocr/web on ort-web); server `paddleCollectorOcr` (same lib on
 * onnxruntime-node) is the automatic HTTP fallback. Tesseract is an optional
 * offline helper — not on the scan critical path.
 */

export type CollectorBandRect = {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
};

/** Word box in the *source image* pixel space (after band offset applied). */
export type OcrWordBox = {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
};

export type CollectorOcrResult = {
  text: string;
  words: OcrWordBox[];
  /** Band crop used, in source image pixels. */
  band: CollectorBandRect;
  sourceWidth: number;
  sourceHeight: number;
  engine: "tesseract" | "ppocr-client";
};

/** eng+fra — collector footers are often FR even when UI locale is EN. */
export const COLLECTOR_OCR_LANGS = ["eng", "fra"] as const;

/**
 * Bottom strip where collector / set codes live (e.g. `184/204 • FR • 2`).
 * Keep this tight — 22% used to swallow Lorcana flavor text and poison OCR.
 */
export const OCR_BAND_HEIGHT_FRAC = 0.12;
/**
 * Side inset for a loose crop (the live AABB), where the card's own edge and
 * whatever lies beside it sit in the strip. A rectified band is cut on the
 * card's own corners and needs none: the collector number starts flush with
 * the left edge, and 4 % of the width eats its first digits.
 */
export const OCR_BAND_INSET_X_FRAC = 0.04;

export function collectorBandRect(
  width: number,
  height: number,
  insetXFrac: number = OCR_BAND_INSET_X_FRAC,
): CollectorBandRect {
  const w = Math.max(1, Math.floor(width));
  const h = Math.max(1, Math.floor(height));
  const insetX = Math.floor(w * Math.max(0, insetXFrac));
  const sh = Math.max(8, Math.floor(h * OCR_BAND_HEIGHT_FRAC));
  const sy = Math.max(0, h - sh);
  const sw = Math.max(1, w - insetX * 2);
  return { sx: insetX, sy, sw, sh };
}

/**
 * Collector band of a card detected inside a larger frame (live AABB), in
 * frame pixels. Same geometry as {@link collectorBandRect}, offset by the
 * card's position and clamped to the frame. Lets OCR read the footer at
 * native camera resolution instead of a 640 px identify thumbnail.
 */
export function collectorBandRectInRegion(
  region: { left: number; top: number; width: number; height: number },
  frame: { width: number; height: number },
): CollectorBandRect | null {
  if (region.width < 32 || region.height < 32) return null;
  const local = collectorBandRect(region.width, region.height);
  const sx = Math.max(0, Math.floor(region.left + local.sx));
  const sy = Math.max(0, Math.floor(region.top + local.sy));
  const ex = Math.min(
    frame.width,
    Math.ceil(region.left + local.sx + local.sw),
  );
  const ey = Math.min(
    frame.height,
    Math.ceil(region.top + local.sy + local.sh),
  );
  const sw = ex - sx;
  const sh = ey - sy;
  if (sw < 16 || sh < 6) return null;
  return { sx, sy, sw, sh };
}

/** Smallest band width PP-OCR reads footers reliably at (glyphs ≥ ~25 px). */
export const OCR_BAND_TARGET_WIDTH = 1600;
export const OCR_BAND_MAX_UPSCALE = 4;

/** Upscale factor for a band crop: hit the target width, never blow up >4×. */
export function collectorBandUpscale(bandWidth: number): number {
  if (bandWidth <= 0) return 1;
  return Math.min(
    OCR_BAND_MAX_UPSCALE,
    Math.max(1, OCR_BAND_TARGET_WIDTH / bandWidth),
  );
}

/**
 * Collector-shaped token? Slash ids (`8/204`), set codes (`TB2-045`), or
 * `#12` — not bare digit noise like `4-12-7` (foil / OCR hallucinations).
 */
export function looksLikeCollectorToken(text: string): boolean {
  const raw = text.replace(/\s+/g, " ").trim();
  if (raw.length < 2) return false;
  // Reject hyphenated digit-only noise (common PP-OCR foil hallucination).
  if (/^\d+(?:[-\s.]\d+){1,4}$/.test(raw)) return false;
  if (/\d{1,4}\s*\/\s*\d{1,4}/.test(raw)) return true;
  if (/\b[A-Z]{1,4}\d{0,2}\s*-\s*\d{1,4}\b/i.test(raw)) return true;
  if (/\b(?:no\.?|n°|#)\s*\d{1,4}\b/i.test(raw)) return true;
  return false;
}

/** Keep collector-ish tokens; drop OCR noise ("hh", `4-12-7`, huge boxes). */
export function isPlausibleCollectorWord(
  text: string,
  box: { width: number; height: number },
  band: { sw: number; sh: number },
  confidence: number,
): boolean {
  const raw = text.replace(/\s+/g, " ").trim();
  if (!looksLikeCollectorToken(raw)) return false;
  const conf01 = confidence <= 1 ? confidence : confidence / 100;
  if (conf01 < 0.45) return false;
  if (box.width <= 0 || box.height <= 0) return false;
  if (box.width > band.sw * 0.85 || box.height > band.sh * 0.55) return false;
  if (box.width * box.height > band.sw * band.sh * 0.35) return false;
  return true;
}

type TessBBox = { x0: number; y0: number; x1: number; y1: number };

type TessWord = {
  text?: string;
  confidence?: number;
  bbox?: TessBBox;
};

type TessWorker = {
  setParameters: (params: Record<string, string>) => Promise<void>;
  recognize: (
    image: ImageBitmap | HTMLCanvasElement | Blob | string,
  ) => Promise<{ data: { text: string; words?: TessWord[] } }>;
  terminate: () => Promise<void>;
};

let workerPromise: Promise<TessWorker | null> | null = null;

async function getWorker(): Promise<TessWorker | null> {
  if (typeof window === "undefined") return null;
  if (!workerPromise) {
    workerPromise = (async () => {
      try {
        const { createWorker } = await import("tesseract.js");
        const worker = (await createWorker([...COLLECTOR_OCR_LANGS], 1, {
          logger: () => undefined,
        })) as unknown as TessWorker;
        await worker.setParameters({
          tessedit_char_whitelist:
            "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzÀÂÄÆÇÉÈÊËÎÏÔŒÙÛÜŸàâäæçéèêëîïôœùûüÿ/-#°•.",
          tessedit_pageseg_mode: "6",
        });
        return worker;
      } catch {
        return null;
      }
    })();
  }
  return workerPromise;
}

/** Drop the cached worker (tests / low-memory). */
export async function resetCollectorOcrWorker(): Promise<void> {
  const pending = workerPromise;
  workerPromise = null;
  if (!pending) return;
  const worker = await pending;
  try {
    await worker?.terminate();
  } catch {
    /* ignore */
  }
}

async function blobToBitmap(blob: Blob): Promise<ImageBitmap | null> {
  try {
    return await createImageBitmap(blob);
  } catch {
    return null;
  }
}

export async function cropCollectorBandBlob(image: Blob): Promise<Blob | null> {
  if (typeof document === "undefined") return null;
  const bitmap = await blobToBitmap(image);
  if (!bitmap) return null;
  try {
    const { sx, sy, sw, sh } = collectorBandRect(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = sw;
    canvas.height = sh;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, sw, sh);
    return await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((b) => resolve(b), "image/jpeg", 0.92);
    });
  } finally {
    bitmap.close();
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch(() => {
        clearTimeout(timer);
        resolve(null);
      });
  });
}

function wordsFromTess(
  words: TessWord[] | undefined,
  band: CollectorBandRect,
): OcrWordBox[] {
  if (!words?.length) return [];
  const out: OcrWordBox[] = [];
  for (const w of words) {
    const raw = w.text?.replace(/\s+/g, " ").trim() ?? "";
    if (!raw) continue;
    const conf = typeof w.confidence === "number" ? w.confidence : 0;
    const b = w.bbox;
    if (!b) continue;
    const width = Math.max(1, b.x1 - b.x0);
    const height = Math.max(1, b.y1 - b.y0);
    if (!isPlausibleCollectorWord(raw, { width, height }, band, conf)) {
      continue;
    }
    out.push({
      text: raw,
      x: band.sx + b.x0,
      y: band.sy + b.y0,
      width,
      height,
      confidence: conf,
    });
  }
  return out;
}

/**
 * OCR the collector band with word boxes in source-image pixels.
 * Never throws. Caps latency so live Auto stays snappy.
 */
export async function recognizeCollectorOcrDetailed(
  image: Blob,
  opts?: { timeoutMs?: number },
): Promise<CollectorOcrResult | null> {
  const timeoutMs = opts?.timeoutMs ?? 900;
  const run = async (): Promise<CollectorOcrResult | null> => {
    const bitmap = await blobToBitmap(image);
    if (!bitmap) return null;
    try {
      const band = collectorBandRect(bitmap.width, bitmap.height);
      const canvas = document.createElement("canvas");
      canvas.width = band.sw;
      canvas.height = band.sh;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      ctx.drawImage(
        bitmap,
        band.sx,
        band.sy,
        band.sw,
        band.sh,
        0,
        0,
        band.sw,
        band.sh,
      );
      const worker = await getWorker();
      if (!worker) return null;
      const { data } = await worker.recognize(canvas);
      const text = data.text?.replace(/\s+/g, " ").trim() ?? "";
      const words = wordsFromTess(data.words, band);
      if (!text && !words.length) return null;
      return {
        text,
        words,
        band,
        sourceWidth: bitmap.width,
        sourceHeight: bitmap.height,
        engine: "tesseract",
      };
    } finally {
      bitmap.close();
    }
  };
  return withTimeout(run(), timeoutMs);
}

export async function recognizeCollectorOcr(
  image: Blob,
  opts?: { timeoutMs?: number },
): Promise<string | null> {
  const detailed = await recognizeCollectorOcrDetailed(image, opts);
  return detailed?.text || null;
}

/**
 * Crop collector band from a video AABB and OCR with boxes in video pixels.
 */
export async function recognizeCollectorOcrFromVideoRegion(
  video: HTMLVideoElement,
  region: { left: number; top: number; width: number; height: number },
  opts?: { timeoutMs?: number },
): Promise<CollectorOcrResult | null> {
  if (!video.videoWidth || region.width < 16 || region.height < 16) return null;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(region.width));
  canvas.height = Math.max(1, Math.round(region.height));
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(
    video,
    region.left,
    region.top,
    region.width,
    region.height,
    0,
    0,
    canvas.width,
    canvas.height,
  );
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((b) => resolve(b), "image/jpeg", 0.9);
  });
  if (!blob) return null;
  const detailed = await recognizeCollectorOcrDetailed(blob, opts);
  if (!detailed) return null;
  return {
    ...detailed,
    band: {
      sx: region.left + detailed.band.sx,
      sy: region.top + detailed.band.sy,
      sw: detailed.band.sw,
      sh: detailed.band.sh,
    },
    words: detailed.words.map((w) => ({
      ...w,
      x: region.left + w.x,
      y: region.top + w.y,
    })),
    sourceWidth: video.videoWidth,
    sourceHeight: video.videoHeight,
  };
}

/** Warm Tesseract in the background (first identify stays fast). */
export function prefetchCollectorOcr(): void {
  if (typeof window === "undefined") return;
  void getWorker();
}
