/**
 * Kayou HR lenticular scans — one sprite sheet (cols × rows) per face.
 *
 * Pointer / idle lean picks which panel fills the card frame; the foil layer
 * stays separate (house flare on top when present).
 */
import { lenticularTravelOffset } from "./lenticularStripPaths";
import {
  IDLE_POINTER_CENTER,
  IDLE_POINTER_X_AMP,
  IDLE_POINTER_Y_AMP,
} from "./foil/idleLean";
import type { Lean } from "./deviceTilt";
export type LenticularGrid = {
  cols: number;
  rows: number;
};

/** Trim scan gutters inside one panel cell (320×450 Heaven Scroll reference). */
export type LenticularPanelCrop = {
  left: number;
  top: number;
  right: number;
  bottom: number;
  /** Sprite-space nudge on img `top` (positive = art moves down in the frame). */
  shiftY?: number;
};

/** Attested narutocards.ca gutters per cols×rows family (exemplar scans). */
export const KAYOU_LENTICULAR_PANEL_CROPS: Readonly<
  Record<string, LenticularPanelCrop>
> = {
  "1x2": { left: 20, top: 20, right: 20, bottom: 12 },
  "2x2": { left: 10, top: 62, right: 8, bottom: 62 },
  "1x3": { left: 70, top: 16, right: 70, bottom: 14 },
  "2x3": { left: 10, top: 0, right: 10, bottom: 0 },
};

/** t4w* `nr.hr.*` dual-face strips (320×450) — fixed per panel, auto-crop off. */
export const KAYOU_LENTICULAR_CROP_PROFILE_DUAL_WAVE = "1x2-dual-wave";

/** Heaven Scrolls `nrss.hr.005` 2×3 — pale card chrome must stay visible. */
export const KAYOU_LENTICULAR_CROP_PROFILE_HEAVEN_2X3 = "2x3-heaven-scroll";

/** Heaven Scrolls `nrss.hr.002` 2×2 — same pale chrome as 2×3. */
export const KAYOU_LENTICULAR_CROP_PROFILE_HEAVEN_2X2 = "2x2-heaven-scroll";

/** Attested per-panel crops keyed by {@link KAYOU_LENTICULAR_CROP_PROFILE_DUAL_WAVE}. */
export const KAYOU_LENTICULAR_FIXED_PANEL_CROPS: Readonly<
  Record<string, readonly LenticularPanelCrop[]>
> = {
  [KAYOU_LENTICULAR_CROP_PROFILE_DUAL_WAVE]: [
    { left: 20, top: 20, right: 20, bottom: 10 },
    { left: 20, top: 0, right: 20, bottom: 20 },
  ],
  [KAYOU_LENTICULAR_CROP_PROFILE_HEAVEN_2X2]: [
    { left: 20, top: 88, right: 6, bottom: 10, shiftY: -20 },
    { left: 6, top: 88, right: 20, bottom: 10, shiftY: -20 },
    { left: 20, top: 5, right: 6, bottom: 62, shiftY: 32 },
    { left: 6, top: 5, right: 20, bottom: 62, shiftY: 32 },
  ],
  [KAYOU_LENTICULAR_CROP_PROFILE_HEAVEN_2X3]: [
    { left: 20, top: 54, right: 6, bottom: 6, shiftY: -17 },
    { left: 6, top: 54, right: 20, bottom: 6, shiftY: -17 },
    { left: 20, top: 4, right: 6, bottom: 4, shiftY: 1 },
    { left: 6, top: 4, right: 20, bottom: 4, shiftY: 1 },
    { left: 20, top: 8, right: 6, bottom: 52, shiftY: 22 },
    { left: 6, top: 8, right: 20, bottom: 52, shiftY: 22 },
  ],
};

export type LenticularStripLayoutOptions = {
  /** When set, skip pixel crop detection and use attested fixed panel crops. */
  cropProfile?: string | null;
};

const KAYOU_STRIP_REF_W = 320;
const KAYOU_STRIP_REF_H = 450;

export function lenticularGridKey(grid: LenticularGrid): string {
  const cols = Math.max(1, grid.cols);
  const rows = Math.max(1, grid.rows);
  return `${cols}x${rows}`;
}

function scaleLenticularPanelCrop(
  crop: LenticularPanelCrop,
  sx: number,
  sy: number,
): LenticularPanelCrop {
  return {
    left: Math.round(crop.left * sx),
    top: Math.round(crop.top * sy),
    right: Math.round(crop.right * sx),
    bottom: Math.round(crop.bottom * sy),
    ...(crop.shiftY != null ? { shiftY: Math.round(crop.shiftY * sy) } : {}),
  };
}

function lenticularPanelScale(
  grid: LenticularGrid,
  naturalWidth: number,
  naturalHeight: number,
): { sx: number; sy: number } {
  const cols = Math.max(1, grid.cols);
  const rows = Math.max(1, grid.rows);
  return {
    sx: naturalWidth / cols / (KAYOU_STRIP_REF_W / cols),
    sy: naturalHeight / rows / (KAYOU_STRIP_REF_H / rows),
  };
}

export function lenticularPanelCrop(
  grid: LenticularGrid,
  naturalWidth = KAYOU_STRIP_REF_W,
  naturalHeight = KAYOU_STRIP_REF_H,
): LenticularPanelCrop | null {
  const base = KAYOU_LENTICULAR_PANEL_CROPS[lenticularGridKey(grid)];
  if (!base) return null;
  const { sx, sy } = lenticularPanelScale(grid, naturalWidth, naturalHeight);
  return scaleLenticularPanelCrop(base, sx, sy);
}

/** Fixed attested crops for one profile (skips auto pixel detection when used). */
export function resolveFixedLenticularPanelCrops(
  profile: string,
  grid: LenticularGrid,
  naturalWidth: number,
  naturalHeight: number,
): LenticularPanelCrop[] | null {
  const template = KAYOU_LENTICULAR_FIXED_PANEL_CROPS[profile];
  if (!template) return null;
  const cols = Math.max(1, grid.cols);
  const rows = Math.max(1, grid.rows);
  if (template.length !== cols * rows) return null;
  const { sx, sy } = lenticularPanelScale(grid, naturalWidth, naturalHeight);
  return template.map((crop) => scaleLenticularPanelCrop(crop, sx, sy));
}

/** Per-panel crop when detected, else the attested family fallback. */
export function resolveLenticularPanelCrop(
  panelIndex: number,
  grid: LenticularGrid,
  naturalWidth: number,
  naturalHeight: number,
  panelCrops?: ReadonlyArray<LenticularPanelCrop> | null,
): LenticularPanelCrop {
  const detected = panelCrops?.[panelIndex];
  if (detected) return detected;
  return (
    lenticularPanelCrop(grid, naturalWidth, naturalHeight) ?? {
      left: 0,
      top: 0,
      right: 0,
      bottom: 0,
    }
  );
}

const LENTICULAR_DETECT_LUM = 235;
/** Row/column must be this fraction non-gutter before it counts as content. */
const LENTICULAR_DETECT_MIN_FRAC = 0.45;
/** Ignore panel rim when probing columns/rows (inter-panel speckle). */
const LENTICULAR_DETECT_EDGE_MARGIN_FRAC = 0.08;
/** Pale inter-row gutter on 1×N strips (New Year HR when seam < 50 % white). */
const STACKED_SEAM_ROW_MIN_WHITE = 0.85;
const STACKED_SEAM_CORE_MIN_WHITE = 0.95;
const STACKED_SEAM_SEARCH_FRAC = 0.06;
const STACKED_SEAM_CORE_MARGIN = 0.08;
/** Only shave lateral/top/bottom edges that are nearly pure scan gutter. */
const PANEL_EDGE_VERTICAL_MAX_WHITE = 0.85;
/** Never shave more than this fraction of panel width beyond the first content edge. */
const PANEL_LATERAL_TRIM_MAX_EXTRA_FRAC = 0.38;
/** Pale card art (scroll UI, tinted backgrounds) below this luminance. */
const LENTICULAR_PALE_CONTENT_LUM = 250;
/** When probe overshoots attested family inset by this much, reconsider. */
const LENTICULAR_FAMILY_CAP_MIN_EXCESS = 10;
/** Family inset is kept when the attested edge column is this pale-art dense. */
const LENTICULAR_FAMILY_CAP_PALE_MIN = 0.72;
const LENTICULAR_FAMILY_CAP_BOTTOM_BAND_FRAC = 0.35;

export type StackedStripRowBounds = readonly number[];

function findStackedHorizontalSeamBand(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  centerY: number,
  search: number,
  lumThreshold: number,
): { bandY0: number; bandY1: number } | null {
  const yMin = Math.max(0, Math.round(centerY) - search);
  const yMax = Math.min(height - 1, Math.round(centerY) + search);

  let bandY0 = -1;
  let bandY1 = -1;
  for (let y = yMin; y <= yMax; y += 1) {
    const core = rowCoreWhiteFraction(rgba, width, y, lumThreshold);
    const full = rowWhiteFraction(rgba, width, y, lumThreshold);
    if (
      core >= STACKED_SEAM_CORE_MIN_WHITE ||
      full >= STACKED_SEAM_ROW_MIN_WHITE
    ) {
      if (bandY0 < 0) bandY0 = y;
      bandY1 = y;
    } else if (bandY0 >= 0) {
      break;
    }
  }
  if (bandY0 < 0) return null;
  return { bandY0, bandY1 };
}

/** Split 1×N stacked rows on attested inter-row gutters (offset seams on t4w* HR). */
export function detectStackedStripRowBounds(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  grid: LenticularGrid,
  lumThreshold = LENTICULAR_DETECT_LUM,
): StackedStripRowBounds | null {
  const cols = Math.max(1, grid.cols);
  const rows = Math.max(1, grid.rows);
  if (cols !== 1 || rows <= 1) return null;

  const nominalH = height / rows;
  const search = Math.max(4, Math.floor(nominalH * STACKED_SEAM_SEARCH_FRAC));
  const bounds: number[] = [0];

  for (let row = 0; row < rows - 1; row += 1) {
    const boundary = Math.floor((row + 1) * nominalH);
    const seam = findStackedHorizontalSeamBand(
      rgba,
      width,
      height,
      boundary,
      search,
      lumThreshold,
    );
    bounds.push(seam ? seam.bandY1 + 1 : boundary);
  }
  bounds.push(height);
  return bounds;
}

function panelRowTop(
  row: number,
  height: number,
  rows: number,
  rowBounds?: StackedStripRowBounds | null,
): number {
  if (rowBounds && rowBounds.length === rows + 1) return rowBounds[row]!;
  return Math.floor(row * (height / rows));
}

function panelRowBottom(
  row: number,
  height: number,
  rows: number,
  rowBounds?: StackedStripRowBounds | null,
): number {
  if (rowBounds && rowBounds.length === rows + 1) return rowBounds[row + 1]!;
  return Math.floor((row + 1) * (height / rows));
}

function rgbaLuminance(rgba: Uint8ClampedArray, x: number, y: number, width: number): number {
  const i = (y * width + x) * 4;
  return (rgba[i]! + rgba[i + 1]! + rgba[i + 2]!) / 3;
}

function rowWhiteFraction(
  rgba: Uint8ClampedArray,
  width: number,
  y: number,
  lumThreshold: number,
): number {
  let white = 0;
  for (let x = 0; x < width; x += 1) {
    if (rgbaLuminance(rgba, x, y, width) >= lumThreshold) white += 1;
  }
  return width > 0 ? white / width : 0;
}

function rowCoreWhiteFraction(
  rgba: Uint8ClampedArray,
  width: number,
  y: number,
  lumThreshold: number,
): number {
  const x0 = Math.floor(width * STACKED_SEAM_CORE_MARGIN);
  const x1 = Math.floor(width * (1 - STACKED_SEAM_CORE_MARGIN));
  if (x1 <= x0) return 0;
  let white = 0;
  for (let x = x0; x < x1; x += 1) {
    if (rgbaLuminance(rgba, x, y, width) >= lumThreshold) white += 1;
  }
  return white / (x1 - x0);
}

function panelRowCoreWhiteFraction(
  rgba: Uint8ClampedArray,
  width: number,
  y: number,
  panelX0: number,
  panelX1: number,
  lumThreshold: number,
): number {
  const panelW = panelX1 - panelX0;
  const margin = Math.max(1, Math.floor(panelW * STACKED_SEAM_CORE_MARGIN));
  const x0 = panelX0 + margin;
  const x1 = panelX1 - margin;
  if (x1 <= x0) return 0;
  let white = 0;
  for (let x = x0; x < x1; x += 1) {
    if (rgbaLuminance(rgba, x, y, width) >= lumThreshold) white += 1;
  }
  return white / (x1 - x0);
}

function edgeWhiteFraction(
  rgba: Uint8ClampedArray,
  width: number,
  x: number,
  y0: number,
  y1: number,
  lumThreshold: number,
): number {
  if (y1 <= y0) return 0;
  let white = 0;
  for (let y = y0; y < y1; y += 1) {
    if (rgbaLuminance(rgba, x, y, width) >= lumThreshold) white += 1;
  }
  return white / (y1 - y0);
}

function edgeWhiteFractionHorizontal(
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

/** Extend per-panel crops so pale horizontal gutters between stacked rows are excluded. */
function refineStackedStripSeamCrops(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  grid: LenticularGrid,
  crops: LenticularPanelCrop[],
  lumThreshold: number,
  rowBounds?: StackedStripRowBounds | null,
): void {
  const cols = Math.max(1, grid.cols);
  const rows = Math.max(1, grid.rows);
  if (cols !== 1 || rows <= 1) return;

  const nominalH = height / rows;
  const search = Math.max(4, Math.floor(nominalH * STACKED_SEAM_SEARCH_FRAC));

  for (let row = 0; row < rows - 1; row += 1) {
    const panelBottom = panelRowBottom(row, height, rows, rowBounds);
    const panelTop = panelRowTop(row + 1, height, rows, rowBounds);
    const boundary = rowBounds
      ? panelBottom
      : Math.floor((row + 1) * nominalH);
    const yMin = Math.max(0, boundary - search);
    const yMax = Math.min(height - 1, boundary + search);

    let bandY0 = -1;
    let bandY1 = -1;
    for (let y = yMin; y <= yMax; y += 1) {
      const core = rowCoreWhiteFraction(rgba, width, y, lumThreshold);
      const full = rowWhiteFraction(rgba, width, y, lumThreshold);
      if (
        core >= STACKED_SEAM_CORE_MIN_WHITE ||
        full >= STACKED_SEAM_ROW_MIN_WHITE
      ) {
        if (bandY0 < 0) bandY0 = y;
        bandY1 = y;
      } else if (bandY0 >= 0) {
        break;
      }
    }
    if (bandY0 < 0) continue;

    const upper = crops[row];
    const lower = crops[row + 1];
    if (!upper || !lower) continue;

    upper.bottom = Math.max(upper.bottom, panelBottom - bandY0);
    lower.top = Math.max(lower.top, bandY1 - panelTop + 1);
  }
}

/** Shave white scan margins still touching a cropped panel edge. */
function trimStackedPanelWhiteEdges(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  grid: LenticularGrid,
  crops: LenticularPanelCrop[],
  lumThreshold: number,
  rowBounds?: StackedStripRowBounds | null,
): void {
  const cols = Math.max(1, grid.cols);
  const rows = Math.max(1, grid.rows);
  const panelW = width / cols;

  for (let i = 0; i < cols * rows; i += 1) {
    const crop = crops[i];
    if (!crop) continue;
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x0 = Math.floor(col * panelW);
    const x1 = Math.floor((col + 1) * panelW);
    const y0 = panelRowTop(row, height, rows, rowBounds);
    const y1 = panelRowBottom(row, height, rows, rowBounds);
    const panelH = Math.max(1, y1 - y0);
    const maxTop = Math.max(0, Math.floor(panelH) - crop.bottom - 1);
    const maxBottom = Math.max(0, Math.floor(panelH) - crop.top - 1);
    const maxLeft = Math.max(0, Math.floor(panelW) - crop.right - 1);
    const maxRight = Math.max(0, Math.floor(panelW) - crop.left - 1);

    let contentX0 = x0 + crop.left;
    let contentX1 = x1 - crop.right;
    let contentY0 = y0 + crop.top;
    let contentY1 = y1 - crop.bottom;

    while (crop.top < maxTop) {
      const y = y0 + crop.top;
      if (
        edgeWhiteFractionHorizontal(
          rgba,
          width,
          y,
          contentX0,
          contentX1,
          lumThreshold,
        ) <= PANEL_EDGE_VERTICAL_MAX_WHITE
      ) {
        break;
      }
      crop.top += 1;
      contentY0 = y0 + crop.top;
    }

    while (crop.bottom < maxBottom) {
      const y = y1 - crop.bottom - 1;
      if (
        edgeWhiteFractionHorizontal(
          rgba,
          width,
          y,
          contentX0,
          contentX1,
          lumThreshold,
        ) <= PANEL_EDGE_VERTICAL_MAX_WHITE
      ) {
        break;
      }
      crop.bottom += 1;
      contentY1 = y1 - crop.bottom;
    }

    contentX0 = x0 + crop.left;
    contentX1 = x1 - crop.right;
    contentY0 = y0 + crop.top;
    contentY1 = y1 - crop.bottom;

    const maxLateralExtra = Math.max(
      32,
      Math.floor(panelW * PANEL_LATERAL_TRIM_MAX_EXTRA_FRAC),
    );
    const initialLeft = crop.left;
    while (crop.left < maxLeft && crop.left - initialLeft < maxLateralExtra) {
      const x = x0 + crop.left;
      if (
        edgeWhiteFraction(rgba, width, x, contentY0, contentY1, lumThreshold) <=
        PANEL_EDGE_VERTICAL_MAX_WHITE
      ) {
        break;
      }
      crop.left += 1;
      contentX0 = x0 + crop.left;
    }

    const initialRight = crop.right;
    while (crop.right < maxRight && crop.right - initialRight < maxLateralExtra) {
      const x = x1 - crop.right - 1;
      if (
        edgeWhiteFraction(rgba, width, x, contentY0, contentY1, lumThreshold) <=
        PANEL_EDGE_VERTICAL_MAX_WHITE
      ) {
        break;
      }
      crop.right += 1;
      contentX1 = x1 - crop.right;
    }
  }
}

function rowContentFraction(
  rgba: Uint8ClampedArray,
  width: number,
  y: number,
  x0: number,
  x1: number,
  lumThreshold: number,
): number {
  let dark = 0;
  let total = 0;
  for (let x = x0; x < x1; x += 1) {
    total += 1;
    if (rgbaLuminance(rgba, x, y, width) < lumThreshold) dark += 1;
  }
  return total > 0 ? dark / total : 0;
}

function columnContentFraction(
  rgba: Uint8ClampedArray,
  width: number,
  x: number,
  y0: number,
  y1: number,
  lumThreshold: number,
): number {
  let dark = 0;
  let total = 0;
  for (let y = y0; y < y1; y += 1) {
    total += 1;
    if (rgbaLuminance(rgba, x, y, width) < lumThreshold) dark += 1;
  }
  return total > 0 ? dark / total : 0;
}

function columnPaleArtFraction(
  rgba: Uint8ClampedArray,
  width: number,
  x: number,
  y0: number,
  y1: number,
  paleThreshold = LENTICULAR_PALE_CONTENT_LUM,
): number {
  let pale = 0;
  let total = 0;
  for (let y = y0; y < y1; y += 1) {
    total += 1;
    if (rgbaLuminance(rgba, x, y, width) < paleThreshold) pale += 1;
  }
  return total > 0 ? pale / total : 0;
}

/** Do not crop tighter than attested family inset when pale UI sits at that edge. */
function capAggressiveCropWithFamilyFallback(
  detected: number,
  familyInset: number,
  paleAtFamilyEdge: number,
): number {
  if (
    familyInset < 0 ||
    detected <= familyInset + LENTICULAR_FAMILY_CAP_MIN_EXCESS ||
    paleAtFamilyEdge < LENTICULAR_FAMILY_CAP_PALE_MIN
  ) {
    return detected;
  }
  return Math.min(detected, familyInset);
}

function relaxAggressivePanelCropsWithFamilyFallback(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  grid: LenticularGrid,
  crops: LenticularPanelCrop[],
  rowBounds: StackedStripRowBounds | null,
): void {
  const family = lenticularPanelCrop(grid, width, height);
  if (!family) return;

  const cols = Math.max(1, grid.cols);
  const rows = Math.max(1, grid.rows);
  const panelW = width / cols;

  for (let i = 0; i < crops.length; i += 1) {
    const crop = crops[i];
    if (!crop) continue;
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x0 = Math.floor(col * panelW);
    const y0 = panelRowTop(row, height, rows, rowBounds);
    const x1 = Math.floor((col + 1) * panelW);
    const y1 = panelRowBottom(row, height, rows, rowBounds);
    const probeY0 = y0 + crop.top + 1;
    const probeY1 = y1 - crop.bottom - 1;
    if (probeY1 <= probeY0) continue;
    const bottomBandY0 =
      probeY1 -
      Math.max(1, Math.floor((probeY1 - probeY0) * LENTICULAR_FAMILY_CAP_BOTTOM_BAND_FRAC));

    const paleLeft = Math.max(
      columnPaleArtFraction(rgba, width, x0 + family.left, probeY0, probeY1),
      columnPaleArtFraction(rgba, width, x0 + family.left, bottomBandY0, probeY1),
    );
    const paleRight = Math.max(
      columnPaleArtFraction(rgba, width, x1 - 1 - family.right, probeY0, probeY1),
      columnPaleArtFraction(rgba, width, x1 - 1 - family.right, bottomBandY0, probeY1),
    );

    crop.left = capAggressiveCropWithFamilyFallback(
      crop.left,
      family.left,
      paleLeft,
    );
    crop.right = capAggressiveCropWithFamilyFallback(
      crop.right,
      family.right,
      paleRight,
    );
  }
}

/**
 * Trim scan gutters per panel cell from raw RGBA (browser canvas or tests).
 * Heaven Scroll strips place inter-row gutters asymmetrically inside each cell,
 * so one uniform inset per grid family leaves white bands on some faces.
 */
export function detectLenticularPanelCropsFromRgba(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  grid: LenticularGrid,
  lumThreshold = LENTICULAR_DETECT_LUM,
  rowBoundsIn?: StackedStripRowBounds | null,
): LenticularPanelCrop[] {
  const cols = Math.max(1, grid.cols);
  const rows = Math.max(1, grid.rows);
  const panelW = width / cols;
  const rowBounds = rowBoundsIn ?? null;
  const crops: LenticularPanelCrop[] = [];

  for (let i = 0; i < cols * rows; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x0 = Math.floor(col * panelW);
    const y0 = panelRowTop(row, height, rows, rowBounds);
    const x1 = Math.floor((col + 1) * panelW);
    const y1 = panelRowBottom(row, height, rows, rowBounds);
    const panelH = Math.max(1, y1 - y0);
    const marginX = Math.max(1, Math.floor(panelW * LENTICULAR_DETECT_EDGE_MARGIN_FRAC));
    const marginY = Math.max(1, Math.floor(panelH * LENTICULAR_DETECT_EDGE_MARGIN_FRAC));

    let top = 0;
    let bottom = 0;
    let left = -1;
    let right = -1;
    const maxTopInit = Math.max(0, Math.floor(panelH) - 1);
    while (top < maxTopInit) {
      const y = y0 + top;
      if (
        panelRowCoreWhiteFraction(rgba, width, y, x0, x1, lumThreshold) <
        PANEL_EDGE_VERTICAL_MAX_WHITE
      ) {
        break;
      }
      top += 1;
    }

    const maxBottomInit = Math.max(0, Math.floor(panelH) - top - 1);
    while (bottom < maxBottomInit) {
      const y = y1 - bottom - 1;
      if (
        panelRowCoreWhiteFraction(rgba, width, y, x0, x1, lumThreshold) <
        PANEL_EDGE_VERTICAL_MAX_WHITE
      ) {
        break;
      }
      bottom += 1;
    }

    const probeY0 = y0 + marginY;
    const probeY1 = y1 - marginY;

    for (let x = x0; x < x1; x += 1) {
      if (
        columnContentFraction(rgba, width, x, probeY0, probeY1, lumThreshold) >=
        LENTICULAR_DETECT_MIN_FRAC
      ) {
        left = x - x0;
        break;
      }
    }

    for (let x = x1 - 1; x >= x0; x -= 1) {
      if (
        columnContentFraction(rgba, width, x, probeY0, probeY1, lumThreshold) >=
        LENTICULAR_DETECT_MIN_FRAC
      ) {
        right = x1 - 1 - x;
        break;
      }
    }

    if (left < 0 || right < 0) {
      crops.push({ left: 0, top: 0, right: 0, bottom: 0 });
    } else {
      crops.push({ left, top, right, bottom });
    }
  }

  refineStackedStripSeamCrops(rgba, width, height, grid, crops, lumThreshold, rowBounds);
  trimStackedPanelWhiteEdges(rgba, width, height, grid, crops, lumThreshold, rowBounds);
  relaxAggressivePanelCropsWithFamilyFallback(
    rgba,
    width,
    height,
    grid,
    crops,
    rowBounds,
  );
  return crops;
}

export function resolveLenticularStripLayoutFromRgba(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  grid: LenticularGrid,
  lumThreshold = LENTICULAR_DETECT_LUM,
  options?: LenticularStripLayoutOptions,
): { crops: LenticularPanelCrop[]; rowBounds: StackedStripRowBounds | null } {
  const rowBounds = detectStackedStripRowBounds(rgba, width, height, grid, lumThreshold);
  const profile = options?.cropProfile?.trim();
  const fixed =
    profile && profile.length > 0
      ? resolveFixedLenticularPanelCrops(profile, grid, width, height)
      : null;
  const crops =
    fixed ??
    detectLenticularPanelCropsFromRgba(
      rgba,
      width,
      height,
      grid,
      lumThreshold,
      rowBounds,
    );
  return { crops, rowBounds };
}

/** Auto pixel crop detection — use {@link resolveLenticularStripLayoutFromRgba} to opt into fixed profiles. */
export function detectLenticularStripLayoutFromRgba(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  grid: LenticularGrid,
  lumThreshold = LENTICULAR_DETECT_LUM,
): { crops: LenticularPanelCrop[]; rowBounds: StackedStripRowBounds | null } {
  return resolveLenticularStripLayoutFromRgba(
    rgba,
    width,
    height,
    grid,
    lumThreshold,
  );
}

/** Visible art rectangle inside one panel after scan crop. */
export function lenticularPanelContentSize(
  naturalWidth: number,
  naturalHeight: number,
  grid: LenticularGrid,
  panelIndex = 0,
  panelCrops?: ReadonlyArray<LenticularPanelCrop> | null,
  rowBounds?: StackedStripRowBounds | null,
): { w: number; h: number } {
  const cols = Math.max(1, grid.cols);
  const rows = Math.max(1, grid.rows);
  const panelW = naturalWidth / cols;
  const row = Math.floor(panelIndex / cols);
  const panelH =
    rowBounds && rowBounds.length === rows + 1
      ? rowBounds[row + 1]! - rowBounds[row]!
      : naturalHeight / rows;
  const crop = resolveLenticularPanelCrop(
    panelIndex,
    grid,
    naturalWidth,
    naturalHeight,
    panelCrops,
  );
  return {
    w: Math.max(1, panelW - crop.left - crop.right),
    h: Math.max(1, panelH - crop.top - crop.bottom),
  };
}

/** Largest cropped panel rect — one card viewport shared by every face. */
export function lenticularViewportContentSize(
  naturalWidth: number,
  naturalHeight: number,
  grid: LenticularGrid,
  panelCrops?: ReadonlyArray<LenticularPanelCrop> | null,
  rowBounds?: StackedStripRowBounds | null,
): { w: number; h: number } {
  const total = lenticularPanelCount(grid);
  let w = 0;
  let h = 0;
  for (let i = 0; i < total; i += 1) {
    const size = lenticularPanelContentSize(
      naturalWidth,
      naturalHeight,
      grid,
      i,
      panelCrops,
      rowBounds,
    );
    w = Math.max(w, size.w);
    h = Math.max(h, size.h);
  }
  return { w: Math.max(1, w), h: Math.max(1, h) };
}

export function lenticularPanelCount(grid: LenticularGrid): number {
  return Math.max(1, grid.cols * grid.rows);
}

/** Map horizontal light position (0–100) to a panel index. */
export function lenticularPanelIndex(
  lightX: number,
  grid: LenticularGrid,
): number {
  const total = lenticularPanelCount(grid);
  if (total <= 1) return 0;
  const t = Math.max(0, Math.min(100, lightX)) / 100;
  return Math.min(total - 1, Math.floor(t * total));
}

/** CSS `background-position` percentages for a row-major panel index. */
export function lenticularBackgroundPosition(
  index: number,
  grid: LenticularGrid,
): { x: number; y: number } {
  const cols = Math.max(1, grid.cols);
  const rows = Math.max(1, grid.rows);
  const col = index % cols;
  const row = Math.floor(index / cols);
  return {
    x: cols > 1 ? (col / (cols - 1)) * 100 : 0,
    y: rows > 1 ? (row / (rows - 1)) * 100 : 0,
  };
}

/** One panel’s pixel size in the sprite. */
export function lenticularPanelSize(
  naturalWidth: number,
  naturalHeight: number,
  grid: LenticularGrid,
): { w: number; h: number } {
  const cols = Math.max(1, grid.cols);
  const rows = Math.max(1, grid.rows);
  return { w: naturalWidth / cols, h: naturalHeight / rows };
}

/** True when cropped panel art is wider than tall. */
export function lenticularPanelIsLandscape(
  naturalWidth: number,
  naturalHeight: number,
  grid: LenticularGrid,
  panelIndex = 0,
  panelCrops?: ReadonlyArray<LenticularPanelCrop> | null,
): boolean {
  const { w, h } = lenticularPanelContentSize(
    naturalWidth,
    naturalHeight,
    grid,
    panelIndex,
    panelCrops,
  );
  return w > h;
}

export function lenticularArtAspectRatio(
  naturalWidth: number,
  naturalHeight: number,
  grid: LenticularGrid,
  _panelIndex = 0,
  panelCrops?: ReadonlyArray<LenticularPanelCrop> | null,
): string {
  const { w, h } =
    lenticularPanelCount(grid) > 1
      ? lenticularViewportContentSize(
          naturalWidth,
          naturalHeight,
          grid,
          panelCrops,
        )
      : lenticularPanelContentSize(
          naturalWidth,
          naturalHeight,
          grid,
          _panelIndex,
          panelCrops,
        );
  return `${Math.round(w)} / ${Math.round(h)}`;
}

/** Panel shown at rest for aspect ratio / orientation probes. */
export function lenticularIdlePanelIndex(grid: LenticularGrid): number {
  const idle = lenticularIdleNorm(grid);
  return resolveLenticularStripQuad(grid, idle.x, idle.y).tl;
}

export function lenticularArtStyle(
  imageUrl: string,
  grid: LenticularGrid,
  panelIndex = 0,
): Record<string, string | number> {
  const { x, y } = lenticularBackgroundPosition(panelIndex, grid);
  const cols = Math.max(1, grid.cols);
  const rows = Math.max(1, grid.rows);
  return {
    backgroundImage: `url("${imageUrl}")`,
    backgroundRepeat: "no-repeat",
    backgroundSize: `${cols * 100}% ${rows * 100}%`,
    backgroundPosition: `${x}% ${y}%`,
  };
}

/** Which two panels to interleave for a Kayou sprite grid + pointer position. */
export type LenticularStripPair = {
  panelA: number;
  panelB: number;
  /** 0 → panelA, 1 → panelB (strip scrub between the pair). */
  blend: number;
  /** N×M only — active scrub axis (`x` = columns, `y` = rows). */
  scrubAxis?: "x" | "y";
};

/**
 * Four corners of the active N×M cell for diagonal (bilinear) strip scrub.
 * `blendX` / `blendY` are independent — both axes can be mid-transition at once.
 */
export type LenticularStripQuad = {
  tl: number;
  tr: number;
  bl: number;
  br: number;
  blendX: number;
  blendY: number;
};

/** Default pointer position at rest — 1×N starts on the first stacked face. */
export function lenticularIdleNorm(grid: LenticularGrid): {
  x: number;
  y: number;
} {
  const cols = Math.max(1, grid.cols);
  const rows = Math.max(1, grid.rows);
  if (cols === 1 && rows > 1) return { x: 0.5, y: 0 };
  if (rows === 1 && cols > 1) return { x: 0, y: 0.5 };
  if (cols > 1 && rows > 1) return { x: 0.25, y: 0.25 };
  return { x: 0.5, y: 0.5 };
}

/** Map pointer position to the scrub axes for this grid family. */
export function lenticularPointerNorm(
  grid: LenticularGrid,
  normX: number,
  normY: number,
  travel = 0.72,
): { x: number; y: number } {
  const idle = lenticularIdleNorm(grid);
  const cols = Math.max(1, grid.cols);
  const rows = Math.max(1, grid.rows);
  const tx = lenticularTravelOffset(
    Math.max(0, Math.min(1, normX)),
    travel,
  );
  const ty = lenticularTravelOffset(
    Math.max(0, Math.min(1, normY)),
    travel,
  );
  if (cols === 1 && rows > 1) return { x: idle.x, y: ty };
  if (rows === 1 && cols > 1) return { x: tx, y: idle.y };
  return { x: tx, y: ty };
}

/** Same scrub mapping as pointer input, from foil light coordinates (0–100). */
export function lenticularNormFromLean(
  grid: LenticularGrid,
  lightX: number,
  lightY: number,
  travel = 0.72,
): { x: number; y: number } {
  return lenticularPointerNorm(
    grid,
    lightX / 100,
    lightY / 100,
    travel,
  );
}

/**
 * Idle lean → full 0–1 scrub on each axis (no travel padding).
 * Maps the fake pointer swing from {@link idlePointerFromSeconds} edge to edge.
 */
export function lenticularNormFromIdleLean(
  grid: LenticularGrid,
  lean: Lean,
): { x: number; y: number } {
  const idle = lenticularIdleNorm(grid);
  const cols = Math.max(1, grid.cols);
  const rows = Math.max(1, grid.rows);
  const clamp01 = (value: number) =>
    value < 0 ? 0 : value > 1 ? 1 : value;
  const nx = clamp01(
    (lean.lightX - (IDLE_POINTER_CENTER - IDLE_POINTER_X_AMP)) /
      (IDLE_POINTER_X_AMP * 2),
  );
  const ny = clamp01(
    (lean.lightY - (IDLE_POINTER_CENTER - IDLE_POINTER_Y_AMP)) /
      (IDLE_POINTER_Y_AMP * 2),
  );
  if (cols === 1 && rows > 1) return { x: idle.x, y: ny };
  if (rows === 1 && cols > 1) return { x: nx, y: idle.y };
  return { x: nx, y: ny };
}

export function lenticularPanelImgLayout(
  natural: { w: number; h: number },
  grid: LenticularGrid,
  panelIndex: number,
  boxW: number,
  boxH: number,
  panelCrops?: ReadonlyArray<LenticularPanelCrop> | null,
  sharedScale?: number,
  rowBounds?: StackedStripRowBounds | null,
): { width: number; height: number; left: number; top: number } | null {
  if (natural.w <= 0 || natural.h <= 0 || boxW <= 0 || boxH <= 0) return null;
  const cols = Math.max(1, grid.cols);
  const rows = Math.max(1, grid.rows);
  const panelW = natural.w / cols;
  const col = panelIndex % cols;
  const row = Math.floor(panelIndex / cols);
  const y0 = panelRowTop(row, natural.h, rows, rowBounds);
  const panelH =
    rowBounds && rowBounds.length === rows + 1
      ? rowBounds[row + 1]! - rowBounds[row]!
      : natural.h / rows;
  const crop = resolveLenticularPanelCrop(
    panelIndex,
    grid,
    natural.w,
    natural.h,
    panelCrops,
  );
  const contentW = Math.max(1, panelW - crop.left - crop.right);
  const contentH = Math.max(1, panelH - crop.top - crop.bottom);
  const viewport = lenticularViewportContentSize(
    natural.w,
    natural.h,
    grid,
    panelCrops,
    rowBounds,
  );
  const scale =
    sharedScale ??
    lenticularGridImgScale(
      natural,
      grid,
      boxW,
      boxH,
      panelCrops,
      rowBounds,
    );
  const imgW = natural.w * scale;
  const imgH = natural.h * scale;
  const viewportLeft = (boxW - viewport.w * scale) / 2;
  const viewportTop = (boxH - viewport.h * scale) / 2;
  const padX = (viewport.w - contentW) / 2;
  const padY = (viewport.h - contentH) / 2;
  const shiftY = crop.shiftY ?? 0;
  const left = viewportLeft - (col * panelW + crop.left) * scale + padX * scale;
  const top =
    viewportTop - (y0 + crop.top) * scale + padY * scale + shiftY * scale;
  return { width: imgW, height: imgH, left, top };
}

/** One scale for both panels so strip clips reveal aligned pixels. */
export function lenticularPairImgLayouts(
  natural: { w: number; h: number },
  grid: LenticularGrid,
  panelA: number,
  panelB: number,
  boxW: number,
  boxH: number,
  panelCrops?: ReadonlyArray<LenticularPanelCrop> | null,
  rowBounds?: StackedStripRowBounds | null,
): {
  scale: number;
  a: { width: number; height: number; left: number; top: number };
  b: { width: number; height: number; left: number; top: number };
} | null {
  const scale = lenticularGridImgScale(
    natural,
    grid,
    boxW,
    boxH,
    panelCrops,
    rowBounds,
  );
  const a = lenticularPanelImgLayout(
    natural,
    grid,
    panelA,
    boxW,
    boxH,
    panelCrops,
    scale,
    rowBounds,
  );
  const b = lenticularPanelImgLayout(
    natural,
    grid,
    panelB,
    boxW,
    boxH,
    panelCrops,
    scale,
    rowBounds,
  );
  if (!a || !b) return null;
  return { scale, a, b };
}

/** One scale for all four bilinear corners. */
export function lenticularQuadImgLayouts(
  natural: { w: number; h: number },
  grid: LenticularGrid,
  quad: Pick<LenticularStripQuad, "tl" | "tr" | "bl" | "br">,
  boxW: number,
  boxH: number,
  panelCrops?: ReadonlyArray<LenticularPanelCrop> | null,
  rowBounds?: StackedStripRowBounds | null,
): {
  scale: number;
  tl: { width: number; height: number; left: number; top: number };
  tr: { width: number; height: number; left: number; top: number };
  bl: { width: number; height: number; left: number; top: number };
  br: { width: number; height: number; left: number; top: number };
} | null {
  const scale = lenticularGridImgScale(
    natural,
    grid,
    boxW,
    boxH,
    panelCrops,
    rowBounds,
  );
  const tl = lenticularPanelImgLayout(
    natural,
    grid,
    quad.tl,
    boxW,
    boxH,
    panelCrops,
    scale,
    rowBounds,
  );
  const tr = lenticularPanelImgLayout(
    natural,
    grid,
    quad.tr,
    boxW,
    boxH,
    panelCrops,
    scale,
    rowBounds,
  );
  const bl = lenticularPanelImgLayout(
    natural,
    grid,
    quad.bl,
    boxW,
    boxH,
    panelCrops,
    scale,
    rowBounds,
  );
  const br = lenticularPanelImgLayout(
    natural,
    grid,
    quad.br,
    boxW,
    boxH,
    panelCrops,
    scale,
    rowBounds,
  );
  if (!tl || !tr || !bl || !br) return null;
  return { scale, tl, tr, bl, br };
}

/** One cover scale for every panel — avoids jumps when the active pair changes. */
export function lenticularGridImgScale(
  natural: { w: number; h: number },
  grid: LenticularGrid,
  boxW: number,
  boxH: number,
  panelCrops?: ReadonlyArray<LenticularPanelCrop> | null,
  rowBounds?: StackedStripRowBounds | null,
): number {
  const viewport = lenticularViewportContentSize(
    natural.w,
    natural.h,
    grid,
    panelCrops,
    rowBounds,
  );
  return Math.max(boxW / viewport.w, boxH / viewport.h);
}

/** Normalized scrub axis used for perspective tilt (continuous, not per-pair blend). */
export function lenticularScrubNorm(
  grid: LenticularGrid,
  normX: number,
  normY: number,
  scrubAxis?: "x" | "y",
): number {
  const cols = Math.max(1, grid.cols);
  const rows = Math.max(1, grid.rows);
  const x = Math.max(0, Math.min(1, normX));
  const y = Math.max(0, Math.min(1, normY));
  if (cols === 1 && rows > 1) return y;
  if (rows === 1 && cols > 1) return x;
  return scrubAxis === "y" ? y : x;
}

/** Strip rib orientation follows the active scrub axis. */
export type LenticularStripAxis = "vertical" | "horizontal";

export function lenticularStripAxis(
  grid: LenticularGrid,
  scrubAxis?: "x" | "y",
): LenticularStripAxis {
  const cols = Math.max(1, grid.cols);
  const rows = Math.max(1, grid.rows);
  if (cols === 1 && rows > 1) return "horizontal";
  if (rows === 1 && cols > 1) return "vertical";
  return scrubAxis === "y" ? "horizontal" : "vertical";
}

/**
 * Bilinear cell for N×M grids — both axes scrub independently so diagonals
 * mix all four corners (nested vertical × horizontal strip clips).
 */
export function resolveLenticularStripQuad(
  grid: LenticularGrid,
  normX: number,
  normY: number,
): LenticularStripQuad {
  const cols = Math.max(1, grid.cols);
  const rows = Math.max(1, grid.rows);
  const x = Math.max(0, Math.min(1, normX));
  const y = Math.max(0, Math.min(1, normY));

  if (cols * rows <= 1) {
    return { tl: 0, tr: 0, bl: 0, br: 0, blendX: 0, blendY: 0 };
  }

  if (cols === 1) {
    const pair = resolveLenticularStripPair(grid, x, y);
    return {
      tl: pair.panelA,
      tr: pair.panelA,
      bl: pair.panelB,
      br: pair.panelB,
      blendX: 0,
      blendY: pair.blend,
    };
  }

  if (rows === 1) {
    const pair = resolveLenticularStripPair(grid, x, y);
    return {
      tl: pair.panelA,
      tr: pair.panelB,
      bl: pair.panelA,
      br: pair.panelB,
      blendX: pair.blend,
      blendY: 0,
    };
  }

  const hSpan = Math.max(1, cols - 1);
  const hSeg = Math.min(hSpan, x * hSpan);
  const hCol = Math.min(cols - 1, Math.floor(hSeg));
  const blendX = hCol < cols - 1 ? hSeg - hCol : 0;

  const vSpan = Math.max(1, rows - 1);
  const vSeg = Math.min(vSpan, y * vSpan);
  const vRow = Math.min(rows - 1, Math.floor(vSeg));
  const blendY = vRow < rows - 1 ? vSeg - vRow : 0;

  const tl = vRow * cols + hCol;
  const tr = hCol < cols - 1 ? tl + 1 : tl;
  const bl = vRow < rows - 1 ? tl + cols : tl;
  const br =
    vRow < rows - 1 && hCol < cols - 1
      ? tl + cols + 1
      : vRow < rows - 1
        ? bl
        : tr;

  return { tl, tr, bl, br, blendX, blendY };
}

export function resolveLenticularStripPair(
  grid: LenticularGrid,
  normX: number,
  normY: number,
): LenticularStripPair {
  const cols = Math.max(1, grid.cols);
  const rows = Math.max(1, grid.rows);
  const x = Math.max(0, Math.min(1, normX));
  const y = Math.max(0, Math.min(1, normY));

  if (cols * rows <= 1) {
    return { panelA: 0, panelB: 0, blend: 0 };
  }

  /** 1×N — faces stacked; scrub Y maps linearly across N−1 transitions. */
  if (cols === 1) {
    const span = Math.max(1, rows - 1);
    const segment = Math.min(span, y * span);
    const indexA = Math.min(rows - 1, Math.floor(segment));
    const indexB = Math.min(rows - 1, indexA + 1);
    const blend = indexA === indexB ? 1 : segment - indexA;
    return { panelA: indexA, panelB: indexB, blend, scrubAxis: "y" };
  }

  /** N×1 — scrub X maps linearly across N−1 transitions. */
  if (rows === 1) {
    const span = Math.max(1, cols - 1);
    const segment = Math.min(span, x * span);
    const indexA = Math.min(cols - 1, Math.floor(segment));
    const indexB = Math.min(cols - 1, indexA + 1);
    const blend = indexA === indexB ? 1 : segment - indexA;
    return { panelA: indexA, panelB: indexB, blend, scrubAxis: "x" };
  }

  /** N×M — project the bilinear cell onto the dominant axis (legacy probes). */
  const quad = resolveLenticularStripQuad(grid, x, y);
  if (quad.blendX >= quad.blendY) {
    const left = quad.blendY >= 0.5 ? quad.bl : quad.tl;
    const right = quad.blendY >= 0.5 ? quad.br : quad.tr;
    return {
      panelA: left,
      panelB: right,
      blend: left === right ? 1 : quad.blendX,
      scrubAxis: "x",
    };
  }
  const top = quad.blendX >= 0.5 ? quad.tr : quad.tl;
  const bottom = quad.blendX >= 0.5 ? quad.br : quad.bl;
  return {
    panelA: top,
    panelB: bottom,
    blend: top === bottom ? 1 : quad.blendY,
    scrubAxis: "y",
  };
}

export function applyLenticularArtCss(
  node: HTMLElement,
  grid: LenticularGrid,
  lightX: number,
): void {
  const { x, y } = lenticularBackgroundPosition(
    lenticularPanelIndex(lightX, grid),
    grid,
  );
  node.style.setProperty("--lenticular-bg-x", `${x}%`);
  node.style.setProperty("--lenticular-bg-y", `${y}%`);
}
