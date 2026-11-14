/**
 * Ordered quality gates for live card frames (KYC / Innovatrics style).
 * Evaluate on the card ROI crop — never the full finder — so background blur
 * does not fake a pass or fail.
 */

export type QualityHint =
  | "ok"
  | "too_small"
  | "too_far"
  | "hold_still"
  | "blurry"
  | "too_dark"
  | "too_bright"
  | "glare"
  | "card_back"
  | "empty";

export type QualityGateResult = {
  ok: boolean;
  hint: QualityHint;
  blurVariance: number;
  meanLuminance: number;
  glareFraction: number;
};

export type QualityGateOptions = {
  /** Min ROI edge in source pixels (coverage proxy). */
  minEdgePx?: number;
  /** Laplacian variance below this → blurry (ROI ~64–128). */
  minBlurVariance?: number;
  meanLuminanceMin?: number;
  meanLuminanceMax?: number;
  /** Fraction of near-white pixels that counts as glare. */
  maxGlareFraction?: number;
  /** Mean saturation (0–1) below this with mid luminance → empty-ish. */
  minSaturation?: number;
};

export const DEFAULT_QUALITY_OPTIONS: Required<QualityGateOptions> = {
  minEdgePx: 80,
  minBlurVariance: 80,
  meanLuminanceMin: 35,
  meanLuminanceMax: 230,
  maxGlareFraction: 0.12,
  minSaturation: 0.04,
};

/** 4-neighbour Laplacian variance on grayscale (higher = sharper). */
export function laplacianVariance(
  gray: Float32Array | number[],
  width: number,
  height: number,
): number {
  if (width < 3 || height < 3) return 0;
  let sum = 0;
  let sumSq = 0;
  let n = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const lap =
        (gray[i - width] ?? 0) +
        (gray[i + width] ?? 0) +
        (gray[i - 1] ?? 0) +
        (gray[i + 1] ?? 0) -
        4 * (gray[i] ?? 0);
      sum += lap;
      sumSq += lap * lap;
      n += 1;
    }
  }
  if (!n) return 0;
  const mean = sum / n;
  return sumSq / n - mean * mean;
}

export type RgbaRoi = {
  data: Uint8ClampedArray | Uint8Array;
  width: number;
  height: number;
  /** Longest edge of the ROI in the original video/frame pixels. */
  sourceEdgePx: number;
};

/**
 * Fail-first quality check. First failing validator wins the hint.
 */
export function evaluateQualityGates(
  roi: RgbaRoi,
  options: QualityGateOptions = {},
): QualityGateResult {
  const opts = { ...DEFAULT_QUALITY_OPTIONS, ...options };
  const { data, width, height, sourceEdgePx } = roi;
  const pixelCount = width * height;
  if (pixelCount < 16) {
    return {
      ok: false,
      hint: "empty",
      blurVariance: 0,
      meanLuminance: 0,
      glareFraction: 0,
    };
  }

  if (sourceEdgePx < opts.minEdgePx) {
    return {
      ok: false,
      hint: "too_far",
      blurVariance: 0,
      meanLuminance: 0,
      glareFraction: 0,
    };
  }

  const gray = new Float32Array(pixelCount);
  let lumSum = 0;
  let satSum = 0;
  let glare = 0;
  for (let i = 0; i < pixelCount; i++) {
    const o = i * 4;
    const r = data[o] ?? 0;
    const g = data[o + 1] ?? 0;
    const b = data[o + 2] ?? 0;
    const y = 0.299 * r + 0.587 * g + 0.114 * b;
    gray[i] = y;
    lumSum += y;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    satSum += max === 0 ? 0 : (max - min) / max;
    if (y >= 245 && max - min < 18) glare += 1;
  }

  const meanLuminance = lumSum / pixelCount;
  const meanSat = satSum / pixelCount;
  const glareFraction = glare / pixelCount;
  const blurVariance = laplacianVariance(gray, width, height);

  // Flat + desaturated ≈ empty / blank pocket. Busy B&W art has high Laplacian.
  if (
    meanSat < opts.minSaturation &&
    blurVariance < opts.minBlurVariance &&
    meanLuminance > 40 &&
    meanLuminance < 220
  ) {
    return {
      ok: false,
      hint: "empty",
      blurVariance,
      meanLuminance,
      glareFraction,
    };
  }
  if (meanLuminance < opts.meanLuminanceMin) {
    return {
      ok: false,
      hint: "too_dark",
      blurVariance,
      meanLuminance,
      glareFraction,
    };
  }
  if (meanLuminance > opts.meanLuminanceMax) {
    return {
      ok: false,
      hint: "too_bright",
      blurVariance,
      meanLuminance,
      glareFraction,
    };
  }
  if (glareFraction > opts.maxGlareFraction) {
    return {
      ok: false,
      hint: "glare",
      blurVariance,
      meanLuminance,
      glareFraction,
    };
  }
  if (blurVariance < opts.minBlurVariance) {
    return {
      ok: false,
      hint: "blurry",
      blurVariance,
      meanLuminance,
      glareFraction,
    };
  }

  return {
    ok: true,
    hint: "ok",
    blurVariance,
    meanLuminance,
    glareFraction,
  };
}

/**
 * Cheap card-back heuristic: low art-band variance + cool/brownish flat border.
 * Conservative — only flags when both signals agree strongly.
 */
export function looksLikeCardBack(
  roi: RgbaRoi,
  {
    maxArtVariance = 120,
    maxSat = 0.18,
  }: { maxArtVariance?: number; maxSat?: number } = {},
): boolean {
  const { data, width, height } = roi;
  if (width < 8 || height < 8) return false;
  // Sample the upper 55% (art region on most TCGs).
  const artH = Math.floor(height * 0.55);
  const gray = new Float32Array(width * artH);
  let satSum = 0;
  let n = 0;
  for (let y = 0; y < artH; y++) {
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      const r = data[o] ?? 0;
      const g = data[o + 1] ?? 0;
      const b = data[o + 2] ?? 0;
      gray[y * width + x] = 0.299 * r + 0.587 * g + 0.114 * b;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      satSum += max === 0 ? 0 : (max - min) / max;
      n += 1;
    }
  }
  if (!n) return false;
  const variance = laplacianVariance(gray, width, artH);
  const meanSat = satSum / n;
  return variance < maxArtVariance && meanSat < maxSat;
}
