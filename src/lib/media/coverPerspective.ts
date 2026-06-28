/**
 * 3D vs 2D cover roles
 *
 * **Storage policy:** roles are never inferred from raster geometry — pixel
 * heuristics are too brittle on real marketplace/retailer images. A cover is
 * tagged `3d-*` only when:
 *
 * 1. The provider declares it (ScreenScraper `box-3D` → `3d-${region}`).
 * 2. The URL/title carries an explicit `box-3d` / `cart-3d` hint.
 *
 * Past raster-inferred `3d-*` tags on PicClick, PriceCharting, ChocoBonPlan, etc.
 * are demoted back to their plain region on re-enrich.
 *
 * `detectLikely3dCoverFromBuffer` remains for experiments/tests but does not
 * drive persisted roles.
 */
import sharp from "sharp";

import { resolveLocaleRegion } from "@/lib/locale/preference";
import {
  type MarginBackgroundSignals,
  marginSignalsIndicateListingPhoto,
  measureMarginBackgroundSignals,
} from "@/lib/media/coverListingPhoto";

const MIN_DETECTION_EDGE = 120;
const MIN_WIDTH_DELTA = 0.045;
const MIN_FACE_WIDTH_DELTA = 0.018;
const MIN_EDGE_SLOPE = 0.055;
const MIN_FACE_EDGE_SLOPE = 0.02;
const MIN_TOP_BOTTOM_EDGE_SLOPE = 0.12;
const MIN_VERTICAL_HEIGHT_ASYMMETRY = 0.04;
const MAX_ORTHOGRAPHIC_HEIGHT_ASYMMETRY = 0.05;
const MIN_SPINE_WIDTH = 8;
const MIN_SPINE_WIDTH_STRICT = 17;
const MIN_INSET_SPINE_WIDTH = 12;
const MAX_SPINE_WIDTH = 56;
const MIN_SPINE_COLOR_DELTA = 42;
const MIN_PARALLEL_EDGE_SLOPE = 0.02;
const MAX_FULL_BLEED_WIDTH_RATIO = 0.9;
const MIN_PACKSHOT_INSET_MARGIN_LEFT = 0.06;
const MIN_PACKSHOT_INSET_MARGIN_RIGHT = 0.05;
const MIN_SPINE_SATURATION = 0.4;
const MAX_FLAT_SCAN_SPINE_SATURATION = 0.25;
const MAX_SPINE_SCAN_COLUMNS = 0.22;
const MIN_FLAT_DIGITAL_NEUTRAL_MARGIN = 0.1;

const LIGHT_BACKGROUND_LUMINANCE = 242;
const LIGHT_BACKGROUND_MAX_DELTA = 28;
const DARK_BACKGROUND_LUMINANCE = 18;
const DARK_BACKGROUND_MAX_DELTA = 28;

export type Cover3dDetectionResult = {
  likely3d: boolean;
  confidence: number;
};

type SpineDetectionResult = Cover3dDetectionResult & {
  width: number;
  foundTransition: boolean;
  avgSaturation: number;
};

type EdgePerspectiveSignals = {
  leftSlope: number;
  rightSlope: number;
  widthDelta: number;
  convergingEdges: boolean;
  verticalHeightAsymmetry: number;
  topEdgeSlope: number;
  bottomEdgeSlope: number;
  skewedSilhouette: boolean;
};

type RasterGeometrySignals = {
  widthDelta: number;
  leftSlope: number;
  rightSlope: number;
  convergingEdges: boolean;
  parallelEdges: boolean;
  avgContentWidthRatio: number;
  fullBleed: boolean;
  packshotInset: boolean;
  margin: MarginBackgroundSignals;
  spine: SpineDetectionResult;
  globalEdges: EdgePerspectiveSignals;
  faceEdges: EdgePerspectiveSignals | null;
};

function normalizeHint(value?: string | null): string {
  return (value || "").toLowerCase();
}

/** Raster inference is disabled for persisted roles — see module header. */
export function coverSourceSupportsRaster3dDetection(
  _source?: string | null,
): boolean {
  return false;
}

function hasExplicit3dCoverHint(
  url?: string | null,
  title?: string | null,
): boolean {
  const hint = `${url || ""} ${title || ""}`.toLowerCase();
  return (
    hint.includes("box-3d") ||
    hint.includes("box_3d") ||
    hint.includes("cart-3d")
  );
}

function demoteInferred3dCoverRole(role?: string | null): string | null {
  if (!role || !coverRoleIndicates3d(role)) return role ?? null;
  const stripped = normalizeHint(role).replace(/^3d-/, "");
  return regionTokenFromPlainRole(stripped) || stripped || role;
}

/** Provider metadata we trust for `3d-*` without re-analysing pixels. */
function isProviderAuthoritative3dCoverRole(input: {
  role?: string | null;
  source?: string | null;
  url?: string | null;
  title?: string | null;
  authoritative3dCoverRoleSource?: boolean;
}): boolean {
  if (!coverRoleIndicates3d(input.role)) return false;
  if (hasExplicit3dCoverHint(input.url, input.title)) return true;
  return input.authoritative3dCoverRoleSource === true;
}

export function coverRoleIndicates3d(role?: string | null): boolean {
  const normalized = normalizeHint(role);
  if (!normalized) return false;
  return (
    normalized.startsWith("3d-") ||
    normalized.endsWith("-3d") ||
    normalized === "3d"
  );
}

/** Retailer / provider filenames that are flat scans, not 3D mockups. */
export function coverSourceHintsIndicate2d(
  url?: string | null,
  title?: string | null,
): boolean {
  const hint = `${url || ""} ${title || ""}`.toLowerCase();
  if (!hint.trim()) return false;
  return (
    hint.includes("bon-plan") ||
    hint.includes("bon plan") ||
    hint.includes("pas-cher") ||
    hint.includes("visuel-produit") ||
    hint.includes("visuel produit") ||
    /-produit\.(png|jpe?g|webp)/.test(hint) ||
    hint.includes("box-2d") ||
    hint.includes("box_2d") ||
    hint.includes("cart-2d")
  );
}

function regionTokenFromPlainRole(role?: string | null): string {
  const normalized = normalizeHint(role);
  if (!normalized) return "wor";
  const region = resolveLocaleRegion(normalized);
  return region || normalized;
}

/** Explicit provider/filename hints for 3D packshots (not inferred from pixels). */
export function inferCover3dRoleFromHints(input: {
  url?: string | null;
  title?: string | null;
  role?: string | null;
  source?: string | null;
  coverDefaultRegion?: string | null;
}): string | null {
  if (coverRoleIndicates3d(input.role)) return null;
  if (coverSourceHintsIndicate2d(input.url, input.title)) return null;

  const hint = `${input.url || ""} ${input.title || ""}`.toLowerCase();
  if (!hint.trim()) return null;

  const is3dHint =
    hint.includes("box-3d") ||
    hint.includes("box_3d") ||
    hint.includes("cart-3d");

  if (!is3dHint) return null;

  const region = input.coverDefaultRegion || regionTokenFromPlainRole(input.role);
  return `3d-${region}`;
}

function isBackgroundPixel(
  red: number,
  green: number,
  blue: number,
  alpha: number,
): boolean {
  if (alpha < 12) return true;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const luminance = (red + green + blue) / 3;
  const neutral =
    (luminance >= LIGHT_BACKGROUND_LUMINANCE &&
      max - min <= LIGHT_BACKGROUND_MAX_DELTA) ||
    (luminance <= DARK_BACKGROUND_LUMINANCE &&
      max - min <= DARK_BACKGROUND_MAX_DELTA);
  return neutral;
}

function contentSpanAtRow(
  data: Buffer,
  width: number,
  channels: number,
  y: number,
): { left: number; right: number; width: number } | null {
  let left = -1;
  let right = -1;
  for (let x = 0; x < width; x += 1) {
    const offset = (y * width + x) * channels;
    const red = data[offset] ?? 0;
    const green = data[offset + 1] ?? 0;
    const blue = data[offset + 2] ?? 0;
    const alpha = data[offset + 3] ?? 255;
    if (isBackgroundPixel(red, green, blue, alpha)) continue;
    if (left < 0) left = x;
    right = x;
  }
  if (left < 0 || right < 0) return null;
  return { left, right, width: right - left + 1 };
}

function pixelSaturation(red: number, green: number, blue: number): number {
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  if (max <= 0) return 0;
  return (max - min) / max;
}

function findContentBounds(
  data: Buffer,
  width: number,
  height: number,
  channels: number,
  yStart: number,
  yEnd: number,
): { left: number; right: number } | null {
  let left = width;
  let right = -1;
  for (let x = 0; x < width; x += 1) {
    for (let y = yStart; y < yEnd; y += 1) {
      const offset = (y * width + x) * channels;
      const red = data[offset] ?? 0;
      const green = data[offset + 1] ?? 0;
      const blue = data[offset + 2] ?? 0;
      const alpha = data[offset + 3] ?? 255;
      if (isBackgroundPixel(red, green, blue, alpha)) continue;
      left = Math.min(left, x);
      right = Math.max(right, x);
      break;
    }
  }
  if (right < 0 || left >= width) return null;
  return { left, right };
}

function averageSpineSaturation(
  data: Buffer,
  width: number,
  height: number,
  channels: number,
  yStart: number,
  yEnd: number,
  contentLeft: number,
  spineWidth: number,
): number {
  if (spineWidth <= 0) return 0;
  let sum = 0;
  let count = 0;
  for (let x = contentLeft; x < contentLeft + spineWidth; x += 1) {
    for (let y = yStart; y < yEnd; y += 2) {
      const offset = (y * width + x) * channels;
      const red = data[offset] ?? 0;
      const green = data[offset + 1] ?? 0;
      const blue = data[offset + 2] ?? 0;
      const alpha = data[offset + 3] ?? 255;
      if (isBackgroundPixel(red, green, blue, alpha)) continue;
      sum += pixelSaturation(red, green, blue);
      count += 1;
    }
  }
  if (count <= 0) return 0;
  return sum / count;
}

/** Spine strip anchored at the content bounding box, not the image border. */
function detectContentAnchoredSpine(
  data: Buffer,
  width: number,
  height: number,
  channels: number,
  contentLeft: number,
): SpineDetectionResult {
  const empty: SpineDetectionResult = {
    likely3d: false,
    confidence: 0,
    width: 0,
    foundTransition: false,
    avgSaturation: 0,
  };
  const yStart = Math.floor(height * 0.12);
  const yEnd = Math.floor(height * 0.88);
  const rowSpan = yEnd - yStart;
  if (rowSpan < 24) return empty;

  const maxSpineCols = Math.min(
    MAX_SPINE_WIDTH,
    Math.floor(width * MAX_SPINE_SCAN_COLUMNS),
  );
  if (maxSpineCols < MIN_SPINE_WIDTH) {
    return empty;
  }

  const faceStart = Math.floor(width * 0.32);
  const faceEnd = Math.floor(width * 0.68);
  let faceRed = 0;
  let faceGreen = 0;
  let faceBlue = 0;
  let faceCount = 0;
  for (let y = yStart; y < yEnd; y += 1) {
    for (let x = faceStart; x < faceEnd; x += 1) {
      const offset = (y * width + x) * channels;
      const red = data[offset] ?? 0;
      const green = data[offset + 1] ?? 0;
      const blue = data[offset + 2] ?? 0;
      const alpha = data[offset + 3] ?? 255;
      if (isBackgroundPixel(red, green, blue, alpha)) continue;
      faceRed += red;
      faceGreen += green;
      faceBlue += blue;
      faceCount += 1;
    }
  }
  if (faceCount < 120) return empty;
  faceRed /= faceCount;
  faceGreen /= faceCount;
  faceBlue /= faceCount;

  let spineEnd = 0;
  let foundFaceTransition = false;
  for (let x = contentLeft; x < contentLeft + maxSpineCols; x += 1) {
    let colRed = 0;
    let colGreen = 0;
    let colBlue = 0;
    let colCount = 0;
    for (let y = yStart; y < yEnd; y += 1) {
      const offset = (y * width + x) * channels;
      const red = data[offset] ?? 0;
      const green = data[offset + 1] ?? 0;
      const blue = data[offset + 2] ?? 0;
      const alpha = data[offset + 3] ?? 255;
      if (isBackgroundPixel(red, green, blue, alpha)) continue;
      colRed += red;
      colGreen += green;
      colBlue += blue;
      colCount += 1;
    }
    if (colCount < rowSpan * 0.3) {
      if (spineEnd >= MIN_SPINE_WIDTH) {
        foundFaceTransition = true;
        break;
      }
      continue;
    }

    const avgRed = colRed / colCount;
    const avgGreen = colGreen / colCount;
    const avgBlue = colBlue / colCount;
    const colorDelta =
      Math.abs(avgRed - faceRed) +
      Math.abs(avgGreen - faceGreen) +
      Math.abs(avgBlue - faceBlue);

    if (colorDelta >= MIN_SPINE_COLOR_DELTA) {
      spineEnd = x - contentLeft + 1;
      continue;
    }

    if (spineEnd >= MIN_SPINE_WIDTH) {
      foundFaceTransition = true;
      break;
    }
    spineEnd = 0;
  }

  const avgSaturation = averageSpineSaturation(
    data,
    width,
    height,
    channels,
    yStart,
    yEnd,
    contentLeft,
    spineEnd,
  );

  if (
    !foundFaceTransition ||
    spineEnd < MIN_SPINE_WIDTH ||
    spineEnd > MAX_SPINE_WIDTH
  ) {
    return {
      ...empty,
      width: spineEnd,
      foundTransition: foundFaceTransition,
      avgSaturation,
    };
  }

  return {
    likely3d: true,
    confidence: Math.min(1, 0.55 + spineEnd / 100 + avgSaturation * 0.15),
    width: spineEnd,
    foundTransition: true,
    avgSaturation,
  };
}

function filterSpansForGeometryAnalysis(
  spans: Array<{ left: number; right: number; width: number }>,
  imageWidth: number,
): Array<{ left: number; right: number; width: number }> {
  const minWidth = Math.max(48, Math.floor(imageWidth * 0.42));
  return spans.filter((span) => span.width >= minWidth);
}

function sampleContentSpans(
  data: Buffer,
  width: number,
  height: number,
  channels: number,
): Array<{ left: number; right: number; width: number }> {
  const spans: Array<{ left: number; right: number; width: number }> = [];
  for (const ratio of [0.12, 0.22, 0.34, 0.5, 0.66, 0.78, 0.88]) {
    const span = contentSpanAtRow(
      data,
      width,
      channels,
      Math.floor(height * ratio),
    );
    if (span && span.width >= 8) spans.push(span);
  }
  return spans;
}

function edgeSignalsFromSpans(
  spans: Array<{ y: number; left: number; right: number; width: number }>,
  minWidthDelta: number,
  minEdgeSlope: number,
): EdgePerspectiveSignals | null {
  if (spans.length < 2) return null;

  const top = spans[0];
  const bottom = spans[spans.length - 1];
  const widths = spans.map((span) => span.width);
  const minWidth = Math.min(...widths);
  const maxWidth = Math.max(...widths);
  const widthDelta = (maxWidth - minWidth) / Math.max(maxWidth, 1);

  const yDelta = Math.max(1, bottom.y - top.y);
  const leftSlope = (bottom.left - top.left) / yDelta;
  const rightSlope = (bottom.right - top.right) / yDelta;
  const convergingEdges =
    Math.abs(leftSlope) >= minEdgeSlope &&
    Math.abs(rightSlope) >= minEdgeSlope &&
    Math.sign(leftSlope) !== Math.sign(rightSlope);

  return {
    leftSlope,
    rightSlope,
    widthDelta,
    convergingEdges,
    verticalHeightAsymmetry: 0,
    topEdgeSlope: 0,
    bottomEdgeSlope: 0,
    skewedSilhouette: false,
  };
}

function measureVerticalHeightAsymmetry(
  data: Buffer,
  width: number,
  channels: number,
  yStart: number,
  yEnd: number,
  contentLeft: number,
  contentRight: number,
): number {
  const inset = Math.max(2, Math.floor((contentRight - contentLeft) * 0.02));
  const leftX = contentLeft + inset;
  const rightX = contentRight - inset;
  if (rightX <= leftX) return 0;

  const columnHeight = (x: number): number => {
    let top = -1;
    let bottom = -1;
    for (let y = yStart; y < yEnd; y += 1) {
      const offset = (y * width + x) * channels;
      const red = data[offset] ?? 0;
      const green = data[offset + 1] ?? 0;
      const blue = data[offset + 2] ?? 0;
      const alpha = data[offset + 3] ?? 255;
      if (isBackgroundPixel(red, green, blue, alpha)) continue;
      if (top < 0) top = y;
      bottom = y;
    }
    if (top < 0 || bottom < 0) return 0;
    return bottom - top + 1;
  };

  const leftHeight = columnHeight(leftX);
  const rightHeight = columnHeight(rightX);
  if (leftHeight <= 0 || rightHeight <= 0) return 0;
  return (
    Math.abs(leftHeight - rightHeight) / Math.max(leftHeight, rightHeight)
  );
}

function measureHorizontalEdgeSlope(
  data: Buffer,
  width: number,
  channels: number,
  yStart: number,
  yEnd: number,
  contentLeft: number,
  contentRight: number,
  fromBottom: boolean,
): number {
  const step = Math.max(1, Math.floor((contentRight - contentLeft) / 8));
  const points: Array<{ x: number; y: number }> = [];

  for (let x = contentLeft; x <= contentRight; x += step) {
    if (fromBottom) {
      for (let y = yEnd - 1; y >= yStart; y -= 1) {
        const offset = (y * width + x) * channels;
        const red = data[offset] ?? 0;
        const green = data[offset + 1] ?? 0;
        const blue = data[offset + 2] ?? 0;
        const alpha = data[offset + 3] ?? 255;
        if (isBackgroundPixel(red, green, blue, alpha)) continue;
        points.push({ x, y });
        break;
      }
      continue;
    }

    for (let y = yStart; y < yEnd; y += 1) {
      const offset = (y * width + x) * channels;
      const red = data[offset] ?? 0;
      const green = data[offset + 1] ?? 0;
      const blue = data[offset + 2] ?? 0;
      const alpha = data[offset + 3] ?? 255;
      if (isBackgroundPixel(red, green, blue, alpha)) continue;
      points.push({ x, y });
      break;
    }
  }

  if (points.length < 2) return 0;
  const first = points[0];
  const last = points[points.length - 1];
  const xDelta = Math.max(1, last.x - first.x);
  return (last.y - first.y) / xDelta;
}

function trimRightThicknessEdge(
  data: Buffer,
  width: number,
  channels: number,
  yStart: number,
  yEnd: number,
  contentLeft: number,
  contentRight: number,
): number {
  const minFaceWidth = Math.max(40, Math.floor((contentRight - contentLeft) * 0.45));
  let faceRight = contentRight;
  for (let x = contentRight; x > contentLeft + minFaceWidth; x -= 1) {
    let luminance = 0;
    let count = 0;
    for (let y = yStart; y < yEnd; y += 4) {
      const offset = (y * width + x) * channels;
      const red = data[offset] ?? 0;
      const green = data[offset + 1] ?? 0;
      const blue = data[offset + 2] ?? 0;
      const alpha = data[offset + 3] ?? 255;
      if (isBackgroundPixel(red, green, blue, alpha)) continue;
      luminance += (red + green + blue) / 3;
      count += 1;
    }
    if (count > 0 && luminance / count >= 180) {
      faceRight = x - 1;
      continue;
    }
    break;
  }
  return faceRight;
}

function sampleRowSpansInRange(
  data: Buffer,
  width: number,
  height: number,
  channels: number,
  xStart: number,
  xEnd: number,
): Array<{ y: number; left: number; right: number; width: number }> {
  const spans: Array<{ y: number; left: number; right: number; width: number }> =
    [];
  for (const ratio of [0.15, 0.25, 0.35, 0.5, 0.65, 0.75, 0.85]) {
    const y = Math.floor(height * ratio);
    let left = -1;
    let right = -1;
    for (let x = xStart; x <= xEnd; x += 1) {
      const offset = (y * width + x) * channels;
      const red = data[offset] ?? 0;
      const green = data[offset + 1] ?? 0;
      const blue = data[offset + 2] ?? 0;
      const alpha = data[offset + 3] ?? 255;
      if (isBackgroundPixel(red, green, blue, alpha)) continue;
      if (left < 0) left = x;
      right = x;
    }
    if (left >= 0 && right >= 0) {
      spans.push({ y, left, right, width: right - left + 1 });
    }
  }
  return spans;
}

function measureEdgePerspectiveSignals(
  data: Buffer,
  width: number,
  height: number,
  channels: number,
  contentLeft: number,
  contentRight: number,
  xStart: number,
  xEnd: number,
  minWidthDelta: number,
  minEdgeSlope: number,
): EdgePerspectiveSignals | null {
  const yStart = Math.floor(height * 0.12);
  const yEnd = Math.floor(height * 0.88);
  const spans = sampleRowSpansInRange(
    data,
    width,
    height,
    channels,
    xStart,
    xEnd,
  );
  const edgeSignals = edgeSignalsFromSpans(spans, minWidthDelta, minEdgeSlope);
  if (!edgeSignals) return null;

  const verticalHeightAsymmetry = measureVerticalHeightAsymmetry(
    data,
    width,
    channels,
    yStart,
    yEnd,
    contentLeft,
    contentRight,
  );
  const topEdgeSlope = measureHorizontalEdgeSlope(
    data,
    width,
    channels,
    yStart,
    yEnd,
    contentLeft,
    contentRight,
    false,
  );
  const bottomEdgeSlope = measureHorizontalEdgeSlope(
    data,
    width,
    channels,
    yStart,
    yEnd,
    contentLeft,
    contentRight,
    true,
  );
  const skewedSilhouette =
    Math.abs(topEdgeSlope) >= MIN_TOP_BOTTOM_EDGE_SLOPE &&
    Math.abs(bottomEdgeSlope) >= MIN_TOP_BOTTOM_EDGE_SLOPE &&
    Math.sign(topEdgeSlope) !== Math.sign(bottomEdgeSlope);

  return {
    ...edgeSignals,
    verticalHeightAsymmetry,
    topEdgeSlope,
    bottomEdgeSlope,
    skewedSilhouette,
  };
}

function measureRasterGeometrySignals(
  data: Buffer,
  width: number,
  height: number,
  channels: number,
): RasterGeometrySignals | null {
  const spans = sampleContentSpans(data, width, height, channels);
  const geometrySpans = filterSpansForGeometryAnalysis(spans, width);
  if (geometrySpans.length < 2) return null;

  const widths = geometrySpans.map((span) => span.width);
  const minWidth = Math.min(...widths);
  const maxWidth = Math.max(...widths);
  const widthDelta = (maxWidth - minWidth) / Math.max(maxWidth, 1);

  const top = geometrySpans[0];
  const bottom = geometrySpans[geometrySpans.length - 1];
  const yDelta = Math.max(1, Math.floor(height * 0.64));
  const leftSlope = (bottom.left - top.left) / yDelta;
  const rightSlope = (bottom.right - top.right) / yDelta;
  const convergingEdges =
    Math.abs(leftSlope) >= MIN_EDGE_SLOPE &&
    Math.abs(rightSlope) >= MIN_EDGE_SLOPE &&
    Math.sign(leftSlope) !== Math.sign(rightSlope);
  const parallelEdges =
    Math.abs(leftSlope) <= MIN_PARALLEL_EDGE_SLOPE &&
    Math.abs(rightSlope) <= MIN_PARALLEL_EDGE_SLOPE;

  const avgContentWidthRatio =
    widths.reduce((sum, spanWidth) => sum + spanWidth, 0) /
    widths.length /
    width;
  const minLeft = Math.min(...geometrySpans.map((span) => span.left));
  const maxRight = Math.max(...geometrySpans.map((span) => span.right));
  const marginLeft = minLeft / width;
  const marginRight = (width - maxRight - 1) / width;
  const fullBleed =
    avgContentWidthRatio >= MAX_FULL_BLEED_WIDTH_RATIO &&
    marginLeft <= 0.04 &&
    marginRight <= 0.04;

  const yStart = Math.floor(height * 0.12);
  const yEnd = Math.floor(height * 0.88);
  const contentBounds = findContentBounds(
    data,
    width,
    height,
    channels,
    yStart,
    yEnd,
  );
  if (!contentBounds) return null;

  const packshotInset =
    contentBounds.left / width >= MIN_PACKSHOT_INSET_MARGIN_LEFT &&
    (width - contentBounds.right - 1) / width >=
      MIN_PACKSHOT_INSET_MARGIN_RIGHT;

  const spine = detectContentAnchoredSpine(
    data,
    width,
    height,
    channels,
    contentBounds.left,
  );

  const globalEdges =
    measureEdgePerspectiveSignals(
      data,
      width,
      height,
      channels,
      contentBounds.left,
      contentBounds.right,
      contentBounds.left,
      contentBounds.right,
      MIN_WIDTH_DELTA,
      MIN_EDGE_SLOPE,
    ) ?? {
      leftSlope,
      rightSlope,
      widthDelta,
      convergingEdges,
      verticalHeightAsymmetry: 0,
      topEdgeSlope: 0,
      bottomEdgeSlope: 0,
      skewedSilhouette: false,
    };

  const faceLeft = contentBounds.left + Math.max(spine.width, MIN_SPINE_WIDTH);
  const faceRight = trimRightThicknessEdge(
    data,
    width,
    channels,
    yStart,
    yEnd,
    contentBounds.left,
    contentBounds.right,
  );
  const faceEdges =
    faceRight > faceLeft + 24
      ? measureEdgePerspectiveSignals(
          data,
          width,
          height,
          channels,
          contentBounds.left,
          contentBounds.right,
          faceLeft,
          faceRight,
          MIN_FACE_WIDTH_DELTA,
          MIN_FACE_EDGE_SLOPE,
        )
      : null;

  const margin = measureMarginBackgroundSignals(
    data,
    width,
    height,
    channels,
  );

  return {
    widthDelta,
    leftSlope,
    rightSlope,
    convergingEdges,
    parallelEdges,
    avgContentWidthRatio,
    fullBleed,
    packshotInset,
    margin,
    spine,
    globalEdges,
    faceEdges,
  };
}

/**
 * Orthographic flat scan: digital render or flat scan filling the frame, with
 * parallel left/right edges and no real packshot inset or saturated spine.
 * Typical PicClick/eBay seller art — not a photographed 3D box.
 */
export function rasterSignalsIndicateFlatDigitalScan(
  signals: RasterGeometrySignals,
): boolean {
  const { fullBleed, packshotInset, spine, globalEdges, margin } = signals;
  if (!fullBleed || packshotInset) return false;
  if (globalEdges.verticalHeightAsymmetry > MAX_ORTHOGRAPHIC_HEIGHT_ASYMMETRY) {
    return false;
  }
  if (margin.neutralRatio < MIN_FLAT_DIGITAL_NEUTRAL_MARGIN) {
    return false;
  }

  const hasRealPackshotSpine =
    spine.foundTransition &&
    spine.width >= MIN_SPINE_WIDTH_STRICT &&
    spine.avgSaturation >= MIN_SPINE_SATURATION;

  return !hasRealPackshotSpine;
}

/**
 * High-precision raster classifier — requires strong independent signals.
 * Not infallible; tuned to avoid flat-scan false positives.
 */
export function classifyCover3dFromRasterSignals(
  signals: RasterGeometrySignals,
): Cover3dDetectionResult {
  const {
    parallelEdges,
    fullBleed,
    packshotInset,
    spine,
    globalEdges,
    faceEdges,
  } = signals;

  if (rasterSignalsIndicateFlatDigitalScan(signals)) {
    return { likely3d: false, confidence: 0 };
  }

  if (marginSignalsIndicateListingPhoto(signals.margin)) {
    return { likely3d: false, confidence: 0 };
  }

  const spineModeStrong =
    spine.foundTransition &&
    spine.width >= MIN_SPINE_WIDTH_STRICT &&
    spine.avgSaturation >= MIN_SPINE_SATURATION;
  const spineModeInset =
    packshotInset &&
    spine.foundTransition &&
    spine.width >= MIN_INSET_SPINE_WIDTH;

  const edgePerspective = (edges: EdgePerspectiveSignals, minWidthDelta: number) =>
    edges.convergingEdges && edges.widthDelta >= minWidthDelta;

  const skewedWithCorroboration = (edges: EdgePerspectiveSignals) =>
    edges.skewedSilhouette &&
    (packshotInset ||
      (spine.foundTransition && spine.width >= MIN_SPINE_WIDTH));

  const edgeModeStrong =
    edgePerspective(globalEdges, MIN_WIDTH_DELTA) ||
    (faceEdges != null && edgePerspective(faceEdges, MIN_FACE_WIDTH_DELTA)) ||
    skewedWithCorroboration(globalEdges) ||
    (faceEdges != null && skewedWithCorroboration(faceEdges));

  const edgeModeInset =
    packshotInset &&
    globalEdges.verticalHeightAsymmetry >= MIN_VERTICAL_HEIGHT_ASYMMETRY &&
    spine.foundTransition &&
    spine.width >= MIN_SPINE_WIDTH;

  const edgeModeWithSpine =
    edgeModeStrong &&
    spine.foundTransition &&
    spine.width >= MIN_SPINE_WIDTH;

  const fakeSpineOnFlatScan =
    parallelEdges &&
    fullBleed &&
    spine.foundTransition &&
    spine.width >= MIN_SPINE_WIDTH &&
    spine.avgSaturation <= MAX_FLAT_SCAN_SPINE_SATURATION &&
    !edgeModeStrong;

  if (fakeSpineOnFlatScan) {
    return { likely3d: false, confidence: 0 };
  }

  const likely3d =
    spineModeStrong ||
    spineModeInset ||
    edgeModeStrong ||
    edgeModeInset ||
    edgeModeWithSpine;
  if (!likely3d) {
    return { likely3d: false, confidence: 0 };
  }

  const edgeConfidence = Math.max(
    globalEdges.convergingEdges ? globalEdges.widthDelta / 0.16 + 0.55 : 0,
    faceEdges?.convergingEdges
      ? faceEdges.widthDelta / 0.12 + 0.58
      : 0,
    skewedWithCorroboration(globalEdges) ? 0.76 : 0,
    faceEdges && skewedWithCorroboration(faceEdges) ? 0.78 : 0,
    edgeModeInset ? 0.7 + globalEdges.verticalHeightAsymmetry : 0,
  );

  const confidence = Math.min(
    1,
    Math.max(
      spineModeStrong ? spine.confidence : 0,
      spineModeInset ? 0.7 + spine.avgSaturation * 0.2 : 0,
      edgeConfidence,
      edgeModeWithSpine ? 0.74 : 0,
    ),
  );

  return { likely3d: true, confidence };
}

/**
 * Raster 3D detection from image bytes. Uses strict multi-signal classification.
 * Runs on the original download — before margin trim/crop.
 */
export async function detectLikely3dCoverFromBuffer(
  buffer: Buffer,
): Promise<Cover3dDetectionResult> {
  try {
    const image = sharp(buffer).rotate();
    const metadata = await image.metadata();
    if (
      !metadata.width ||
      !metadata.height ||
      metadata.format === "gif" ||
      metadata.format === "svg"
    ) {
      return { likely3d: false, confidence: 0 };
    }

    if (metadata.width > metadata.height * 1.02) {
      return { likely3d: false, confidence: 0 };
    }

    const shortest = Math.min(metadata.width, metadata.height);
    if (shortest < MIN_DETECTION_EDGE) {
      return { likely3d: false, confidence: 0 };
    }

    const { data, info } = await image
      .clone()
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const signals = measureRasterGeometrySignals(
      data,
      info.width,
      info.height,
      info.channels,
    );
    if (!signals) {
      return { likely3d: false, confidence: 0 };
    }

    return classifyCover3dFromRasterSignals(signals);
  } catch {
    return { likely3d: false, confidence: 0 };
  }
}

/** Detects orthographic flat digital covers (not photographed 3D packshots). */
export async function detectFlatDigitalCoverFromBuffer(
  buffer: Buffer,
): Promise<boolean> {
  try {
    const image = sharp(buffer).rotate();
    const metadata = await image.metadata();
    if (
      !metadata.width ||
      !metadata.height ||
      metadata.format === "gif" ||
      metadata.format === "svg"
    ) {
      return false;
    }

    if (metadata.width > metadata.height * 1.02) {
      return false;
    }

    const shortest = Math.min(metadata.width, metadata.height);
    if (shortest < MIN_DETECTION_EDGE) {
      return false;
    }

    const { data, info } = await image
      .clone()
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const signals = measureRasterGeometrySignals(
      data,
      info.width,
      info.height,
      info.channels,
    );
    if (!signals) return false;

    return rasterSignalsIndicateFlatDigitalScan(signals);
  } catch {
    return false;
  }
}

export async function resolveCoverAttachmentRole(input: {
  type: string;
  url?: string | null;
  title?: string | null;
  role?: string | null;
  source?: string | null;
  imageBuffer?: Buffer | null;
  authoritative3dCoverRoleSource?: boolean;
  gridStyleCoverLabelsSource?: boolean;
}): Promise<string | null | undefined> {
  if (input.type !== "cover") return input.role;

  const normalizedRole = normalizeHint(input.role);
  if (
    input.gridStyleCoverLabelsSource &&
    (normalizedRole === "grid-vertical" ||
      normalizedRole === "grid-horizontal" ||
      normalizedRole === "3d-grid-vertical" ||
      normalizedRole === "3d-grid-horizontal")
  ) {
    return input.role;
  }

  if (coverSourceHintsIndicate2d(input.url, input.title)) {
    if (coverRoleIndicates3d(input.role)) {
      return demoteInferred3dCoverRole(input.role);
    }
    return input.role;
  }

  const hinted = inferCover3dRoleFromHints(input);
  if (hinted) return hinted;

  if (isProviderAuthoritative3dCoverRole(input)) {
    return input.role;
  }

  if (coverRoleIndicates3d(input.role)) {
    return demoteInferred3dCoverRole(input.role);
  }

  return input.role;
}
