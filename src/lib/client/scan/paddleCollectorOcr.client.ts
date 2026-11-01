/**
 * Client collector-band OCR via `ppu-paddle-ocr/web` (MIT) — PP-OCRv5 Latin
 * mobile det+rec on ONNX Runtime Web, WebGPU preferred → WASM fallback.
 *
 * Models are self-hosted under `/models/ppocr/` (same immutable cache as the
 * DocAligner model), so nothing leaves the origin after first load. The web
 * entry runs on canvas-native preprocessing: no OpenCV.js, bundles cleanly
 * under Turbopack / webpack.
 */
import type { PaddleOcrService as PaddleOcrServiceClass } from "ppu-paddle-ocr/web";

import {
  collectorBandRect,
  collectorBandUpscale,
  type CollectorBandRect,
  type CollectorOcrResult,
} from "@/lib/client/scan/collectorOcr";
import { interpretPaddleRaw } from "@/lib/client/scan/paddleOcrInterpret";

type PaddleOcrInstance = InstanceType<typeof PaddleOcrServiceClass>;

/** Self-hosted PP-OCRv5 Latin mobile bundle (det is script-agnostic). */
export const PPOCR_CLIENT_MODELS = {
  detection: "/models/ppocr/PP-OCRv5_mobile_det_infer.onnx",
  recognition: "/models/ppocr/latin_PP-OCRv5_mobile_rec_infer.onnx",
  charactersDictionary: "/models/ppocr/ppocrv5_latin_dict.txt",
} as const;

let servicePromise: Promise<PaddleOcrInstance | null> | null = null;
let serviceReady = false;

/** True once det/rec sessions exist — before that, OCR is simply skipped. */
export function isPaddleOcrClientReady(): boolean {
  return serviceReady;
}

async function loadService(): Promise<PaddleOcrInstance | null> {
  if (typeof window === "undefined") return null;
  if (!servicePromise) {
    servicePromise = (async () => {
      try {
        const { PaddleOcrService } = await import("ppu-paddle-ocr/web");
        const service = new PaddleOcrService({
          model: { ...PPOCR_CLIENT_MODELS },
        });
        await service.initialize();
        serviceReady = true;
        return service;
      } catch (err) {
        console.warn("[paddleCollectorOcr.client] init failed", err);
        return null;
      }
    })();
  }
  return servicePromise;
}

/** Warm det/rec sessions at camera start. Soft-fail. */
export async function prefetchPaddleCollectorOcrClient(): Promise<void> {
  try {
    await loadService();
  } catch {
    /* soft */
  }
}

export async function resetPaddleCollectorOcrClient(): Promise<void> {
  const pending = servicePromise;
  servicePromise = null;
  serviceReady = false;
  const service = pending ? await pending : null;
  try {
    await service?.destroy();
  } catch {
    /* ignore */
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    promise
      .then((v) => {
        clearTimeout(timer);
        resolve(v);
      })
      .catch(() => {
        clearTimeout(timer);
        resolve(null);
      });
  });
}

/** A band already cut from the camera frame at native resolution. */
export type PreCroppedBand = {
  /** Band rect in *source frame* pixels (what word boxes map back to). */
  band: CollectorBandRect;
  sourceWidth: number;
  sourceHeight: number;
};

type BandCanvas = {
  canvas: HTMLCanvasElement;
  band: CollectorBandRect;
  /** canvas px per source px. */
  scale: number;
  sourceWidth: number;
  sourceHeight: number;
};

function drawUpscaled(
  bitmap: ImageBitmap,
  src: CollectorBandRect,
  scale: number,
): HTMLCanvasElement | null {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(16, Math.round(src.sw * scale));
  canvas.height = Math.max(32, Math.round(src.sh * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(
    bitmap,
    src.sx,
    src.sy,
    src.sw,
    src.sh,
    0,
    0,
    canvas.width,
    canvas.height,
  );
  return canvas;
}

/**
 * Prepare the det/rec input. Either the blob is a full card face (band is
 * cut here — legacy thumbnail path) or it is already the native-res band
 * (`pre`), in which case we only upscale so glyphs reach PP-OCR's sweet spot.
 */
async function prepareBand(
  blob: Blob,
  pre?: PreCroppedBand,
): Promise<BandCanvas | null> {
  const bitmap = await createImageBitmap(blob).catch(() => null);
  if (!bitmap) return null;
  try {
    if (pre) {
      const scale = collectorBandUpscale(bitmap.width);
      const canvas = drawUpscaled(
        bitmap,
        { sx: 0, sy: 0, sw: bitmap.width, sh: bitmap.height },
        scale,
      );
      if (!canvas) return null;
      // Source px → canvas px: blob px per band px × upscale.
      const blobPerSource = bitmap.width / Math.max(1, pre.band.sw);
      return {
        canvas,
        band: pre.band,
        scale: blobPerSource * scale,
        sourceWidth: pre.sourceWidth,
        sourceHeight: pre.sourceHeight,
      };
    }
    const band = collectorBandRect(bitmap.width, bitmap.height);
    const scale = collectorBandUpscale(band.sw);
    const canvas = drawUpscaled(bitmap, band, scale);
    if (!canvas) return null;
    return {
      canvas,
      band,
      scale,
      sourceWidth: bitmap.width,
      sourceHeight: bitmap.height,
    };
  } finally {
    bitmap.close();
  }
}

/**
 * OCR collector band on-device. Returns null on miss / timeout / init fail
 * so the caller can fall back to the server.
 *
 * Pass `preCropped` when `image` is the native-resolution band grabbed from
 * the camera ({@link grabCollectorBandBlob}) — word boxes then come back in
 * frame pixels.
 */
export async function recognizeCollectorOcrClient(
  image: Blob,
  opts?: { timeoutMs?: number; preCropped?: PreCroppedBand },
): Promise<(CollectorOcrResult & { engine: "ppocr-client" }) | null> {
  const timeoutMs = opts?.timeoutMs ?? 1500;
  // Still warming up (first open): don't hold the sample for the download —
  // keep loading in the background, let the server read the band this time.
  if (!serviceReady) {
    void loadService();
    return null;
  }
  const run = async (): Promise<
    (CollectorOcrResult & { engine: "ppocr-client" }) | null
  > => {
    const service = await loadService();
    if (!service) return null;
    const prepared = await prepareBand(image, opts?.preCropped);
    if (!prepared) return null;

    const raw = await service.recognize(prepared.canvas, { flatten: true });
    const inv = 1 / prepared.scale;
    const { text, words } = interpretPaddleRaw(
      raw,
      prepared.band,
      { sx: prepared.band.sx, sy: prepared.band.sy },
      inv,
      inv,
    );
    return {
      text,
      words,
      band: prepared.band,
      sourceWidth: prepared.sourceWidth,
      sourceHeight: prepared.sourceHeight,
      engine: "ppocr-client",
    };
  };

  return withTimeout(run(), timeoutMs);
}
