/**
 * Live etch → Simey `--foil` paint-space projection.
 *
 * Live `_CardEtch` ≈ dark lines on light (μ≈196). Simey poke-holo foil scans ≈
 * light lines on black (μ≈26). RGB invert alone gets polarity right but leaves
 * mean luminance high (~59). This module:
 * 1. detects polarity from μ,
 * 2. inverts when dark-on-light,
 * 3. scales toward the Simey target μ (contrast-preserving gain).
 *
 * Pure — no DOM. The client hook applies it on ImageData.
 */

/** Typical poke-holo EN foil scan mean luminance (0–255). */
export const SIMEY_FOIL_TARGET_MU = 26;

/** Typical Live `_CardEtch` plate mean luminance (0–255). */
export const LIVE_ETCH_TYPICAL_MU = 196;

/** Above this μ → treat as dark-on-light (Live etch). */
const DARK_ON_LIGHT_MU = 140;
/** Below this μ → already light-on-dark (Simey-like). */
const LIGHT_ON_DARK_MU = 60;

export type PaintPolarity = "lightOnDark" | "darkOnLight" | "ambiguous";

/** Rec. 709 luma. */
export function luminanceRgb(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function meanLuminanceRgba(
  data: ArrayLike<number>,
  pixelCount = Math.floor(data.length / 4),
): number {
  if (pixelCount <= 0) return 0;
  let sum = 0;
  const n = Math.min(pixelCount, Math.floor(data.length / 4));
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    sum += luminanceRgb(data[o] ?? 0, data[o + 1] ?? 0, data[o + 2] ?? 0);
  }
  return sum / n;
}

export function detectPaintPolarity(meanMu: number): PaintPolarity {
  if (meanMu >= DARK_ON_LIGHT_MU) return "darkOnLight";
  if (meanMu <= LIGHT_ON_DARK_MU) return "lightOnDark";
  return "ambiguous";
}

function clampByte(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)));
}

/**
 * Project one RGB triple into Simey foil space given source polarity + μ.
 * Alpha is left to the caller.
 */
export function projectRgbToSimeyFoil(
  r: number,
  g: number,
  b: number,
  polarity: PaintPolarity,
  opts?: { targetMu?: number; sourceMu?: number },
): [number, number, number] {
  const targetMu = opts?.targetMu ?? SIMEY_FOIL_TARGET_MU;
  const sourceMu = opts?.sourceMu ?? LIVE_ETCH_TYPICAL_MU;
  let pr = r;
  let pg = g;
  let pb = b;
  if (polarity === "darkOnLight" || polarity === "ambiguous") {
    pr = 255 - pr;
    pg = 255 - pg;
    pb = 255 - pb;
  }
  // After invert, Live etch μ≈59; gain toward Simey μ≈26 without crushing to black.
  const postInvertMu =
    polarity === "darkOnLight" || polarity === "ambiguous"
      ? 255 - sourceMu
      : sourceMu;
  const gain = Math.min(1.35, Math.max(0.45, targetMu / Math.max(postInvertMu, 1)));
  return [clampByte(pr * gain), clampByte(pg * gain), clampByte(pb * gain)];
}

/**
 * In-place projection of an RGBA buffer (length multiple of 4).
 * Returns measured source μ + polarity used.
 */
export function projectRgbaBufferToSimeyFoil(
  data: Uint8ClampedArray | Uint8Array,
  opts?: { targetMu?: number },
): { sourceMu: number; polarity: PaintPolarity; gain: number } {
  const sourceMu = meanLuminanceRgba(data);
  const polarity = detectPaintPolarity(sourceMu);
  const targetMu = opts?.targetMu ?? SIMEY_FOIL_TARGET_MU;
  const postInvertMu =
    polarity === "darkOnLight" || polarity === "ambiguous"
      ? 255 - sourceMu
      : sourceMu;
  const gain = Math.min(1.35, Math.max(0.45, targetMu / Math.max(postInvertMu, 1)));

  for (let i = 0; i < data.length; i += 4) {
    let r = data[i] ?? 0;
    let g = data[i + 1] ?? 0;
    let b = data[i + 2] ?? 0;
    if (polarity === "darkOnLight" || polarity === "ambiguous") {
      r = 255 - r;
      g = 255 - g;
      b = 255 - b;
    }
    data[i] = clampByte(r * gain);
    data[i + 1] = clampByte(g * gain);
    data[i + 2] = clampByte(b * gain);
  }
  return { sourceMu, polarity, gain };
}
