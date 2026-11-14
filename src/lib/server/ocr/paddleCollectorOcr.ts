/**
 * Server-side collector-band OCR via PP-OCR (ppu-paddle-ocr + onnxruntime-node).
 *
 * Tesseract.js was reading flavor text as garbage on live phone frames.
 * Consensus 2025–2026 (r/LocalLLaMA, RapidOCR docs): PP-OCRv5/v6 on photos
 * beats Tesseract for scene text. Same engine as the on-device path
 * (`lib/client/scan/paddleCollectorOcr.client.ts`); this is the fallback when
 * the phone has no packs loaded or times out.
 */
import sharp, { type Metadata as SharpMetadata } from "sharp";

import {
  collectorBandRect,
  type CollectorBandRect,
  type OcrWordBox,
} from "@/lib/client/scan/collectorOcr";
import {
  interpretPaddleRaw,
  type PaddleFlatRaw,
} from "@/lib/client/scan/paddleOcrInterpret";
import { runServerOrtExclusive } from "@/lib/server/ortExclusive";

export type ServerOcrStatus =
  "ok" | "empty" | "timeout" | "init_fail" | "bad_image";

export type ServerCollectorOcrResult = {
  text: string;
  words: OcrWordBox[];
  band: CollectorBandRect;
  sourceWidth: number;
  sourceHeight: number;
  engine: "paddle-v5-latin" | "paddle-v6-tiny";
  confidence: number;
  status: ServerOcrStatus;
};

type PaddleService = {
  initialize: () => Promise<void>;
  destroy: () => Promise<void>;
  recognize: (
    image: ArrayBuffer,
    options?: { flatten?: boolean },
  ) => Promise<{
    text: string;
    confidence: number;
    results?: Array<{
      text: string;
      confidence: number;
      box: { x: number; y: number; width: number; height: number };
    }>;
  }>;
};

type PaddleRaw = PaddleFlatRaw;

let servicePromise: Promise<PaddleService | null> | null = null;

async function getService(): Promise<PaddleService | null> {
  if (!servicePromise) {
    servicePromise = (async () => {
      try {
        const mod = await import("ppu-paddle-ocr");
        // Latin mobile = FR/EN/DE/ES… — matches EU TCG footers without CJK weight.
        const service = new mod.PaddleOcrService({
          model: mod.V5_LATIN_MOBILE_MODEL,
        }) as unknown as PaddleService;
        // Init creates det+rec sessions — serialize with DINOv2 (shared ORT).
        await runServerOrtExclusive(() => service.initialize());
        return service;
      } catch (err) {
        console.warn("[paddleCollectorOcr] init failed", err);
        return null;
      }
    })();
  }
  return servicePromise;
}

/** Warm the ONNX sessions (admin / first identify). Soft-fails. */
export async function prefetchPaddleCollectorOcr(): Promise<void> {
  await getService();
}

function toArrayBuffer(buf: Buffer): ArrayBuffer {
  const copy = new Uint8Array(buf.byteLength);
  copy.set(buf);
  return copy.buffer;
}

async function prepareBandJpeg(
  image: Buffer,
  region: CollectorBandRect,
): Promise<{ jpeg: Buffer; targetW: number; targetH: number } | null> {
  const targetW = Math.max(region.sw, 640);
  const targetH = Math.max(
    48,
    Math.round((region.sh * targetW) / Math.max(1, region.sw)),
  );
  try {
    const jpeg = await sharp(image)
      .extract({
        left: region.sx,
        top: region.sy,
        width: region.sw,
        height: region.sh,
      })
      .resize({
        width: targetW,
        height: targetH,
        fit: "fill",
        kernel: "lanczos3",
      })
      // Grayscale + mild contrast helps tiny Lorcana `8/204` footers.
      .grayscale()
      .normalize()
      .sharpen()
      .jpeg({ quality: 92 })
      .toBuffer();
    return { jpeg, targetW, targetH };
  } catch {
    return null;
  }
}

/**
 * Crop the collector band from a full-card JPEG and OCR it with PP-OCR.
 * Never throws — returns a statused result (or null only on total abort).
 */
export async function recognizeCollectorBandServer(
  image: Buffer,
  opts?: { timeoutMs?: number },
): Promise<ServerCollectorOcrResult | null> {
  // Init is *outside* the recognize timeout — cold ONNX + model fetch must
  // not race CLIP and leave the HUD stuck on ocr=—.
  const service = await getService();
  if (!service) {
    return {
      text: "",
      words: [],
      band: { sx: 0, sy: 0, sw: 1, sh: 1 },
      sourceWidth: 0,
      sourceHeight: 0,
      engine: "paddle-v5-latin",
      confidence: 0,
      status: "init_fail",
    };
  }

  const timeoutMs = opts?.timeoutMs ?? 2500;

  const run = async (): Promise<ServerCollectorOcrResult> => {
    let meta: SharpMetadata;
    try {
      meta = await sharp(image).metadata();
    } catch {
      return {
        text: "",
        words: [],
        band: { sx: 0, sy: 0, sw: 1, sh: 1 },
        sourceWidth: 0,
        sourceHeight: 0,
        engine: "paddle-v5-latin",
        confidence: 0,
        status: "bad_image",
      };
    }
    const fullW = meta.width ?? 0;
    const fullH = meta.height ?? 0;
    if (fullW < 32 || fullH < 32) {
      return {
        text: "",
        words: [],
        band: { sx: 0, sy: 0, sw: 1, sh: 1 },
        sourceWidth: fullW,
        sourceHeight: fullH,
        engine: "paddle-v5-latin",
        confidence: 0,
        status: "bad_image",
      };
    }

    const band = collectorBandRect(fullW, fullH);
    const prepared = await prepareBandJpeg(image, band);
    if (!prepared) {
      return {
        text: "",
        words: [],
        band,
        sourceWidth: fullW,
        sourceHeight: fullH,
        engine: "paddle-v5-latin",
        confidence: 0,
        status: "bad_image",
      };
    }

    let raw: PaddleRaw;
    try {
      raw = await runServerOrtExclusive(() =>
        service.recognize(toArrayBuffer(prepared.jpeg), {
          flatten: true,
        }),
      );
    } catch (err) {
      console.warn("[paddleCollectorOcr] recognize failed", err);
      return {
        text: "",
        words: [],
        band,
        sourceWidth: fullW,
        sourceHeight: fullH,
        engine: "paddle-v5-latin",
        confidence: 0,
        status: "empty",
      };
    }

    let interpreted = interpretPaddleRaw(
      raw,
      band,
      { sx: band.sx, sy: band.sy },
      band.sw / prepared.targetW,
      band.sh / prepared.targetH,
    );

    // Lorcana puts `8/204` bottom-left; full-band foil noise sometimes wins.
    // If nothing parseable, retry the left 58% of the band only.
    if (!interpreted.text) {
      const left: CollectorBandRect = {
        sx: band.sx,
        sy: band.sy,
        sw: Math.max(8, Math.floor(band.sw * 0.58)),
        sh: band.sh,
      };
      const leftPrep = await prepareBandJpeg(image, left);
      if (leftPrep) {
        try {
          const leftRaw = await service.recognize(
            toArrayBuffer(leftPrep.jpeg),
            { flatten: true },
          );
          const leftOut = interpretPaddleRaw(
            leftRaw,
            band,
            { sx: left.sx, sy: left.sy },
            left.sw / leftPrep.targetW,
            left.sh / leftPrep.targetH,
          );
          if (leftOut.text) interpreted = leftOut;
        } catch {
          /* soft */
        }
      }
    }

    if (!interpreted.text && !interpreted.words.length) {
      return {
        text: "",
        words: [],
        band,
        sourceWidth: fullW,
        sourceHeight: fullH,
        engine: "paddle-v5-latin",
        confidence: 0,
        status: "empty",
      };
    }

    return {
      text: interpreted.text,
      words: interpreted.words,
      band,
      sourceWidth: fullW,
      sourceHeight: fullH,
      engine: "paddle-v5-latin",
      confidence: interpreted.confidence,
      status: interpreted.text ? "ok" : "empty",
    };
  };

  return await Promise.race([
    run(),
    new Promise<ServerCollectorOcrResult>((resolve) => {
      setTimeout(
        () =>
          resolve({
            text: "",
            words: [],
            band: { sx: 0, sy: 0, sw: 1, sh: 1 },
            sourceWidth: 0,
            sourceHeight: 0,
            engine: "paddle-v5-latin",
            confidence: 0,
            status: "timeout",
          }),
        timeoutMs,
      );
    }),
  ]);
}
