/**
 * Live classical card-edge detection from a video frame (client).
 */
import {
  detectCardQuadFromGray,
  rgbaToGray,
  type ClassicalCardQuad,
} from "@/lib/shared/vision/cardQuadClassical";

const DETECT_MAX_EDGE = 320;

export type LiveCardDetection = ClassicalCardQuad & {
  /** Video intrinsic size used for the detection. */
  videoWidth: number;
  videoHeight: number;
};

/**
 * Detect card edges in the current video frame.
 * Returns null when nothing card-like dominates the frame.
 */
export function detectCardQuadFromVideo(
  video: HTMLVideoElement,
): LiveCardDetection | null {
  const fullW = video.videoWidth;
  const fullH = video.videoHeight;
  if (!fullW || !fullH) return null;

  const scale = Math.min(1, DETECT_MAX_EDGE / Math.max(fullW, fullH));
  const dw = Math.max(32, Math.round(fullW * scale));
  const dh = Math.max(32, Math.round(fullH * scale));

  const canvas = document.createElement("canvas");
  canvas.width = dw;
  canvas.height = dh;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, fullW, fullH, 0, 0, dw, dh);
  const image = ctx.getImageData(0, 0, dw, dh);
  const gray = rgbaToGray(image.data, dw, dh);

  // Light 3×3 box blur (≈ sharp.blur(1.2) for edge closing).
  const blurred = boxBlur3(gray, dw, dh);
  const found = detectCardQuadFromGray(blurred, dw, dh, fullW, fullH);
  if (!found) return null;
  return { ...found, videoWidth: fullW, videoHeight: fullH };
}

function boxBlur3(
  gray: Uint8Array,
  width: number,
  height: number,
): Uint8Array {
  const out = new Uint8Array(gray.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= height) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= width) continue;
          sum += gray[yy * width + xx]!;
          n += 1;
        }
      }
      out[y * width + x] = (sum / n) | 0;
    }
  }
  return out;
}
