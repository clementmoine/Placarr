/**
 * Detect a card-like quadrilateral in a camera/photo frame and dewarp it.
 *
 * Classical pipeline (no OpenCV): downscale → blur → Sobel → threshold →
 * largest blob → extreme-point corners → {@link applyCropQuad}.
 * Used before CLIP/dHash so loose / tilted framing still matches.
 */
import sharp from "sharp";

import {
  applyCropQuad,
  type CropQuad,
  type Point2,
} from "@/core/enrich/media/imageHomography";
import {
  detectCardQuadFromGray,
  extremePointQuad,
  insetQuad,
  isNearAxisAligned,
  type ClassicalCardQuad,
} from "@/lib/shared/vision/cardQuadClassical";

const DETECT_MAX_EDGE = 320;
const CARD_FACE_RATIO = 63 / 88;
/**
 * CLIP is resolution-sensitive against the catalogue index (built from full
 * face arts). 252px-wide dewarps lost ~0.15 cosine; ≥400px stays usable.
 */
const DEWARP_OUT_WIDTH = 420;
const DEWARP_OUT_HEIGHT = Math.round(DEWARP_OUT_WIDTH / CARD_FACE_RATIO);

export type DetectedCardQuad = {
  /** Corners in full-resolution source pixels (TL→TR→BR→BL). */
  quad: CropQuad;
  /** Axis-aligned bounds of the blob (full-res) — prefer for upright extract. */
  aabb: { left: number; top: number; width: number; height: number };
  /** Fraction of the frame covered by the blob (0–1). */
  coverage: number;
  score: number;
};

export { extremePointQuad, insetQuad, isNearAxisAligned };

function toDetected(c: ClassicalCardQuad, fullW: number, fullH: number): DetectedCardQuad {
  return {
    quad: {
      kind: "quad",
      points: c.corners,
      imageWidth: fullW,
      imageHeight: fullH,
      outWidth: DEWARP_OUT_WIDTH,
      outHeight: DEWARP_OUT_HEIGHT,
    },
    aabb: c.aabb,
    coverage: c.coverage,
    score: c.score,
  };
}

/**
 * Find the best card-like quad in `buffer`. Returns null when nothing
 * looks like a dominant rectangular card (honest miss → caller falls back).
 */
export async function detectCardQuad(
  buffer: Buffer,
): Promise<DetectedCardQuad | null> {
  let fullW = 0;
  let fullH = 0;
  try {
    const meta = await sharp(buffer).metadata();
    fullW = meta.width ?? 0;
    fullH = meta.height ?? 0;
  } catch {
    return null;
  }
  if (fullW < 48 || fullH < 48) return null;

  const scale = Math.min(1, DETECT_MAX_EDGE / Math.max(fullW, fullH));
  const dw = Math.max(32, Math.round(fullW * scale));
  const dh = Math.max(32, Math.round(fullH * scale));

  const { data } = await sharp(buffer)
    .resize(dw, dh, { fit: "fill" })
    .greyscale()
    .blur(1.2)
    .raw()
    .toBuffer({ resolveWithObject: true });

  const found = detectCardQuadFromGray(data, dw, dh, fullW, fullH);
  return found ? toDetected(found, fullW, fullH) : null;
}

/** Dewarp detected card to an upright face JPEG, or null if undetectable. */
export async function dewarpCardFace(
  buffer: Buffer,
): Promise<{ jpeg: Buffer; detection: DetectedCardQuad } | null> {
  const detection = await detectCardQuad(buffer);
  if (!detection) return null;
  try {
    const { points } = detection.quad;
    let jpeg: Buffer;
    if (isNearAxisAligned(points)) {
      // Keep native resolution when the card is already large enough for CLIP;
      // only upscale small detections (floor ~500px on the long edge).
      const box = detection.aabb;
      const longEdge = Math.max(box.width, box.height);
      const pipeline = sharp(buffer).extract(box);
      jpeg = await (longEdge < 500
        ? pipeline.resize({
            width:
              box.width >= box.height
                ? 520
                : Math.round(520 * (box.width / box.height)),
            height:
              box.height > box.width
                ? 520
                : Math.round(520 * (box.height / box.width)),
            fit: "fill",
            kernel: "lanczos3",
          })
        : pipeline)
        .jpeg({ quality: 92 })
        .toBuffer();
    } else {
      const png = await applyCropQuad(buffer, detection.quad);
      jpeg = await sharp(png).jpeg({ quality: 92 }).toBuffer();
    }
    return { jpeg, detection };
  } catch {
    return null;
  }
}

// Keep Point2 import used via re-exports / types for callers.
export type { Point2 };
