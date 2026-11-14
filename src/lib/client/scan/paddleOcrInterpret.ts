/**
 * Pure interpretation of a flattened PP-OCR result (ppu-paddle-ocr) into
 * collector-band words + hint text. Shared by the on-device engine
 * (`paddleCollectorOcr.client.ts`) and the server fallback
 * (`lib/server/ocr/paddleCollectorOcr.ts`) — one filtering rule, one place.
 */
import { parseCollectorNumberHint } from "@/core/identify/collectorNumberHint";
import {
  isPlausibleCollectorWord,
  looksLikeCollectorToken,
  type CollectorBandRect,
  type OcrWordBox,
} from "@/lib/client/scan/collectorOcr";

/** Structural subset of ppu-paddle-ocr `FlattenedPaddleOcrResult`. */
export type PaddleFlatRaw = {
  text: string;
  confidence: number;
  results?: Array<{
    text: string;
    confidence: number;
    box: { x: number; y: number; width: number; height: number };
  }>;
};

/**
 * Map OCR items (in band-crop pixel space) back to source coordinates,
 * drop implausible words, and derive the collector-number hint text.
 */
export function interpretPaddleRaw(
  raw: PaddleFlatRaw,
  band: CollectorBandRect,
  origin: { sx: number; sy: number },
  scaleX: number,
  scaleY: number,
): { text: string; words: OcrWordBox[]; confidence: number } {
  const flat = Array.isArray(raw.results) ? raw.results : [];
  const words: OcrWordBox[] = [];
  for (const item of flat) {
    const text = item.text?.replace(/\s+/g, " ").trim() ?? "";
    const box = item.box;
    if (!box) continue;
    const boxW = box.width * scaleX;
    const boxH = box.height * scaleY;
    if (
      !isPlausibleCollectorWord(
        text,
        { width: boxW, height: boxH },
        band,
        item.confidence,
      )
    ) {
      continue;
    }
    words.push({
      text,
      x: origin.sx + box.x * scaleX,
      y: origin.sy + box.y * scaleY,
      width: boxW,
      height: boxH,
      confidence:
        item.confidence <= 1 ? item.confidence * 100 : item.confidence,
    });
  }

  const rawText = raw.text?.replace(/\s+/g, " ").trim() ?? "";
  const fromWords = words
    .map((w) => w.text)
    .join(" ")
    .trim();
  const hintFromWords = parseCollectorNumberHint(fromWords);
  const hintFromRaw = parseCollectorNumberHint(rawText);
  let text = hintFromWords?.raw ?? hintFromRaw?.raw ?? "";
  if (!text) {
    for (const item of flat) {
      const candidate = item.text?.replace(/\s+/g, " ").trim() ?? "";
      const hint = parseCollectorNumberHint(candidate);
      if (looksLikeCollectorToken(candidate) && hint) {
        text = hint.raw;
        break;
      }
    }
  }

  return { text, words, confidence: raw.confidence ?? 0 };
}

/**
 * Title / description words — no collector filter. Short garbage is dropped;
 * the rest is joined for {@link ocrTitleTokens}.
 */
export function interpretPaddleTitleRaw(
  raw: PaddleFlatRaw,
  band: CollectorBandRect,
  origin: { sx: number; sy: number },
  scaleX: number,
  scaleY: number,
): { text: string; words: OcrWordBox[]; confidence: number } {
  const flat = Array.isArray(raw.results) ? raw.results : [];
  const words: OcrWordBox[] = [];
  for (const item of flat) {
    const text = item.text?.replace(/\s+/g, " ").trim() ?? "";
    const box = item.box;
    if (!box || text.length < 3) continue;
    const conf = item.confidence <= 1 ? item.confidence * 100 : item.confidence;
    if (conf < 40) continue;
    const boxW = box.width * scaleX;
    const boxH = box.height * scaleY;
    if (boxH > band.sh * 0.9 && boxW > band.sw * 0.9) continue;
    words.push({
      text,
      x: origin.sx + box.x * scaleX,
      y: origin.sy + box.y * scaleY,
      width: boxW,
      height: boxH,
      confidence: conf,
    });
  }
  const text = words
    .map((w) => w.text)
    .join(" ")
    .trim();
  return { text, words, confidence: raw.confidence ?? 0 };
}
