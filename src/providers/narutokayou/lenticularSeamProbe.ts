/**
 * Detect stacked-face lenticular strips from horizontal gutter seams in RGBA.
 *
 * Kayou serves many single-face HR cards as 320×450 portrait scans — same size
 * as true 1×N lenticular sprites. Seam whiteness separates the two families.
 */
import type { LenticularGrid } from "@/core/render/kayouLenticularArt";

const DEFAULT_LUM = 235;
const DEFAULT_MIN_SEAM_WHITE = 0.5;
const SEAM_BAND_FRAC = 0.022;
/** 1×2 when the mid-row gutter is pale vs panel rows (New Year HR.011–012). */
const REL_1X2_MIN_HALF = 0.45;
const REL_1X2_MAX_PANEL_ROW = 0.15;
const REL_1X2_MIN_DELTA = 0.35;
/** Strong mid-row gutter (t4w5 Team 7) — below pure-white, above pale-relative. */
const STRONG_1X2_MIN_HALF = 0.75;
const STRONG_1X2_MIN_DELTA = 0.15;
/** Thin full-width gutters (New Year HR.017–018): core + full row nearly pure white. */
const PURE_SEAM_MIN_WHITE = 0.995;
const PURE_SEAM_CORE_MARGIN = 0.08;
const PURE_SEAM_SEARCH_FRAC = 0.06;

function rgbaLuminance(
  rgba: Uint8ClampedArray,
  x: number,
  y: number,
  width: number,
): number {
  const i = (y * width + x) * 4;
  return (rgba[i]! + rgba[i + 1]! + rgba[i + 2]!) / 3;
}

function rowWhiteFractionInSpan(
  rgba: Uint8ClampedArray,
  width: number,
  y: number,
  x0: number,
  x1: number,
  lumThreshold: number,
): number {
  if (x1 <= x0) return 0;
  let white = 0;
  for (let x = x0; x < x1; x += 1) {
    if (rgbaLuminance(rgba, x, y, width) >= lumThreshold) white += 1;
  }
  return white / (x1 - x0);
}

/** Fraction of near-white pixels on a horizontal band centered at `y`. */
export function kayouRowSeamWhiteFraction(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  y: number,
  lumThreshold = DEFAULT_LUM,
): number {
  if (!(width > 0 && height > 0)) return 0;
  const band = Math.max(2, Math.round(height * SEAM_BAND_FRAC));
  let white = 0;
  let total = 0;
  for (let yy = Math.max(0, Math.round(y) - band); yy <= Math.min(height - 1, Math.round(y) + band); yy += 1) {
    for (let x = 0; x < width; x += 1) {
      total += 1;
      if (rgbaLuminance(rgba, x, yy, width) >= lumThreshold) white += 1;
    }
  }
  return total > 0 ? white / total : 0;
}

/** True when a near-pure white gutter row sits near `centerY` (offset seams, narrow gutters). */
export function hasKayouPureHorizontalSeamNear(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  centerY: number,
  minWhite = PURE_SEAM_MIN_WHITE,
  lumThreshold = DEFAULT_LUM,
): boolean {
  if (!(width > 0 && height > 0)) return false;
  const search = Math.max(8, Math.floor(height * PURE_SEAM_SEARCH_FRAC));
  const x0 = Math.floor(width * PURE_SEAM_CORE_MARGIN);
  const x1 = Math.floor(width * (1 - PURE_SEAM_CORE_MARGIN));
  const yStart = Math.max(0, Math.round(centerY) - search);
  const yEnd = Math.min(height - 1, Math.round(centerY) + search);

  for (let y = yStart; y <= yEnd; y += 1) {
    const core = rowWhiteFractionInSpan(rgba, width, y, x0, x1, lumThreshold);
    const full = rowWhiteFractionInSpan(rgba, width, y, 0, width, lumThreshold);
    if (core >= minWhite && full >= minWhite) return true;
  }
  return false;
}

/**
 * Infer a 1×N stacked strip from inter-row gutters, or null for a single face.
 */
export function probeKayouStackedStripGrid(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  minSeamWhite = DEFAULT_MIN_SEAM_WHITE,
): LenticularGrid | null {
  if (!(width > 0 && height > 0)) return null;

  if (hasKayouPureHorizontalSeamNear(rgba, width, height, height / 2)) {
    return { cols: 1, rows: 2 };
  }

  if (
    hasKayouPureHorizontalSeamNear(rgba, width, height, height / 3) &&
    hasKayouPureHorizontalSeamNear(rgba, width, height, (2 * height) / 3)
  ) {
    return { cols: 1, rows: 3 };
  }

  const seamThird = kayouRowSeamWhiteFraction(rgba, width, height, height / 3);
  const seamHalf = kayouRowSeamWhiteFraction(rgba, width, height, height / 2);
  const seamTwoThirds = kayouRowSeamWhiteFraction(
    rgba,
    width,
    height,
    (2 * height) / 3,
  );

  const thirdStrong =
    seamThird >= minSeamWhite && seamTwoThirds >= minSeamWhite;
  if (thirdStrong) {
    return { cols: 1, rows: 3 };
  }

  if (seamHalf >= minSeamWhite) {
    const panelRow = Math.max(seamThird, seamTwoThirds);
    const minPanelRow = Math.min(seamThird, seamTwoThirds);
    if (
      seamHalf - panelRow >= REL_1X2_MIN_DELTA ||
      minPanelRow < REL_1X2_MAX_PANEL_ROW
    ) {
      return { cols: 1, rows: 2 };
    }
  }

  const panelRow = Math.max(seamThird, seamTwoThirds);
  if (
    seamHalf >= STRONG_1X2_MIN_HALF &&
    seamHalf - panelRow >= STRONG_1X2_MIN_DELTA
  ) {
    return { cols: 1, rows: 2 };
  }

  if (
    seamHalf >= REL_1X2_MIN_HALF &&
    seamThird < REL_1X2_MAX_PANEL_ROW &&
    seamTwoThirds < REL_1X2_MAX_PANEL_ROW &&
    seamHalf - panelRow >= REL_1X2_MIN_DELTA
  ) {
    return { cols: 1, rows: 2 };
  }

  return null;
}
