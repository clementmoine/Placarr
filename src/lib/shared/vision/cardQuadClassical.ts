/**
 * Classical card-quad detection (no OpenCV / sharp).
 * Downscaled gray → Sobel → closed edges → (1) enclosed interiors, convex
 * hull → 4 corners at any tilt; (2) scanline-fill fallback for broken
 * borders / cards touching the frame. Shared by server dewarp and client live
 * vision overlay.
 */

export type Point2 = { x: number; y: number };

export type ClassicalCardQuad = {
  /** Corners in full-resolution source pixels (TL→TR→BR→BL). */
  corners: [Point2, Point2, Point2, Point2];
  aabb: { left: number; top: number; width: number; height: number };
  coverage: number;
  score: number;
  /**
   * `high`: closed-loop blob, convex, ≥ 80 % rectangular — trust the corners.
   * `low`: scanline-fill fallback — may have merged neighbours; a learned
   * detector should override it when available.
   */
  precision: "high" | "low";
};

function sobelMagnitude(
  gray: Uint8Array | Buffer,
  width: number,
  height: number,
): Float32Array {
  const mag = new Float32Array(width * height);
  const at = (x: number, y: number) =>
    gray[
      Math.max(0, Math.min(height - 1, y)) * width +
        Math.max(0, Math.min(width - 1, x))
    ] ?? 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const gx =
        -at(x - 1, y - 1) +
        at(x + 1, y - 1) -
        2 * at(x - 1, y) +
        2 * at(x + 1, y) -
        at(x - 1, y + 1) +
        at(x + 1, y + 1);
      const gy =
        -at(x - 1, y - 1) -
        2 * at(x, y - 1) -
        at(x + 1, y - 1) +
        at(x - 1, y + 1) +
        2 * at(x, y + 1) +
        at(x + 1, y + 1);
      mag[y * width + x] = Math.hypot(gx, gy);
    }
  }
  return mag;
}

function percentileThreshold(values: Float32Array, pct: number): number {
  const sample: number[] = [];
  const step = Math.max(1, Math.floor(values.length / 4000));
  for (let i = 0; i < values.length; i += step) {
    const v = values[i]!;
    if (v > 0) sample.push(v);
  }
  if (!sample.length) return 1;
  sample.sort((a, b) => a - b);
  const idx = Math.min(
    sample.length - 1,
    Math.max(0, Math.floor((pct / 100) * sample.length)),
  );
  return Math.max(8, sample[idx]!);
}

function dilate3(mask: Uint8Array, width: number, height: number): Uint8Array {
  const out = new Uint8Array(mask.length);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      let on = 0;
      for (let dy = -1; dy <= 1 && !on; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (mask[(y + dy) * width + (x + dx)]) {
            on = 1;
            break;
          }
        }
      }
      out[y * width + x] = on;
    }
  }
  return out;
}

function erode3(mask: Uint8Array, width: number, height: number): Uint8Array {
  const out = new Uint8Array(mask.length);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      let on = 1;
      for (let dy = -1; dy <= 1 && on; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!mask[(y + dy) * width + (x + dx)]) {
            on = 0;
            break;
          }
        }
      }
      out[y * width + x] = on;
    }
  }
  return out;
}

type BlobInfo = {
  id: number;
  area: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  pixels: number[];
  /** Blob boundary pixels (exact, from the label map). */
  boundary: Point2[];
};

function largestBlobs(
  mask: Uint8Array,
  width: number,
  height: number,
  keep: number,
): BlobInfo[] {
  const labels = new Int32Array(mask.length);
  const blobs: BlobInfo[] = [];
  let nextId = 1;
  const stack: number[] = [];

  for (let i = 0; i < mask.length; i++) {
    if (!mask[i] || labels[i]) continue;
    const id = nextId++;
    let area = 0;
    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;
    const pixels: number[] = [];
    stack.length = 0;
    stack.push(i);
    labels[i] = id;

    while (stack.length) {
      const idx = stack.pop()!;
      const x = idx % width;
      const y = (idx / width) | 0;
      area += 1;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
      if (pixels.length < 8000) pixels.push(idx);
      else if ((area & 7) === 0) pixels[(area / 8) % pixels.length]! = idx;

      const neighbors = [idx - 1, idx + 1, idx - width, idx + width];
      for (const n of neighbors) {
        if (n < 0 || n >= mask.length) continue;
        if (!mask[n] || labels[n]) continue;
        const nx = n % width;
        if (Math.abs(nx - x) + Math.abs(((n / width) | 0) - y) !== 1) continue;
        labels[n] = id;
        stack.push(n);
      }
    }

    blobs.push({ id, area, minX, minY, maxX, maxY, pixels, boundary: [] });
  }

  const kept = blobs.sort((a, b) => b.area - a.area).slice(0, keep);
  for (const blob of kept) {
    blob.boundary = blobBoundaryFromLabels(labels, blob, width, height);
  }
  return kept;
}

function blobBoundaryFromLabels(
  labels: Int32Array,
  blob: Pick<BlobInfo, "id" | "minX" | "minY" | "maxX" | "maxY">,
  width: number,
  height: number,
): Point2[] {
  const out: Point2[] = [];
  const { id } = blob;
  for (let y = blob.minY; y <= blob.maxY; y++) {
    for (let x = blob.minX; x <= blob.maxX; x++) {
      const idx = y * width + x;
      if (labels[idx] !== id) continue;
      if (
        x === 0 ||
        y === 0 ||
        x === width - 1 ||
        y === height - 1 ||
        labels[idx - 1] !== id ||
        labels[idx + 1] !== id ||
        labels[idx - width] !== id ||
        labels[idx + width] !== id
      ) {
        out.push({ x, y });
      }
    }
  }
  return out;
}

/** Extreme-point corners from a blob (document-scanner style). */
export function extremePointQuad(
  pixels: readonly number[],
  width: number,
): [Point2, Point2, Point2, Point2] | null {
  if (pixels.length < 16) return null;
  let tl = pixels[0]!;
  let tr = pixels[0]!;
  let br = pixels[0]!;
  let bl = pixels[0]!;
  let tlScore = Infinity;
  let trScore = -Infinity;
  let brScore = -Infinity;
  let blScore = Infinity;

  for (const idx of pixels) {
    const x = idx % width;
    const y = (idx / width) | 0;
    const s1 = x + y;
    const s2 = x - y;
    if (s1 < tlScore) {
      tlScore = s1;
      tl = idx;
    }
    if (s2 > trScore) {
      trScore = s2;
      tr = idx;
    }
    if (s1 > brScore) {
      brScore = s1;
      br = idx;
    }
    if (s2 < blScore) {
      blScore = s2;
      bl = idx;
    }
  }

  const pt = (idx: number): Point2 => ({
    x: idx % width,
    y: (idx / width) | 0,
  });
  const quad: [Point2, Point2, Point2, Point2] = [
    pt(tl),
    pt(tr),
    pt(br),
    pt(bl),
  ];
  const keys = new Set(quad.map((p) => `${p.x},${p.y}`));
  if (keys.size < 4) return null;
  return quad;
}

function quadArea(points: readonly [Point2, Point2, Point2, Point2]): number {
  let sum = 0;
  for (let i = 0; i < 4; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % 4]!;
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

function cross(o: Point2, a: Point2, b: Point2): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

/** Andrew monotone chain — counter-clockwise hull without collinear points. */
export function convexHull(points: readonly Point2[]): Point2[] {
  const pts = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  if (pts.length < 3) return pts;
  const lower: Point2[] = [];
  for (const p of pts) {
    while (
      lower.length >= 2 &&
      cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0
    ) {
      lower.pop();
    }
    lower.push(p);
  }
  const upper: Point2[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i]!;
    while (
      upper.length >= 2 &&
      cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0
    ) {
      upper.pop();
    }
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

/**
 * Reduce a convex polygon to its 4 dominant vertices (Visvalingam: drop the
 * vertex whose triangle with its neighbours is smallest). On a rasterised
 * rectangle at any rotation this converges to the true corners.
 */
export function hullToQuad(
  hull: readonly Point2[],
): [Point2, Point2, Point2, Point2] | null {
  if (hull.length < 4) return null;
  const poly = [...hull];
  while (poly.length > 4) {
    let worst = 0;
    let worstArea = Infinity;
    for (let i = 0; i < poly.length; i++) {
      const prev = poly[(i - 1 + poly.length) % poly.length]!;
      const next = poly[(i + 1) % poly.length]!;
      const area = Math.abs(cross(prev, poly[i]!, next)) / 2;
      if (area < worstArea) {
        worstArea = area;
        worst = i;
      }
    }
    poly.splice(worst, 1);
  }
  return orderQuadCorners(poly as [Point2, Point2, Point2, Point2]);
}

type Line = { nx: number; ny: number; c: number }; // nx·x + ny·y = c

function lineThrough(a: Point2, b: Point2): Line {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  return { nx, ny, c: nx * a.x + ny * a.y };
}

/** Total-least-squares line (PCA) through ≥ 2 points. */
function fitLine(points: readonly Point2[]): Line | null {
  const n = points.length;
  if (n < 2) return null;
  let mx = 0;
  let my = 0;
  for (const p of points) {
    mx += p.x;
    my += p.y;
  }
  mx /= n;
  my /= n;
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (const p of points) {
    const dx = p.x - mx;
    const dy = p.y - my;
    sxx += dx * dx;
    sxy += dx * dy;
    syy += dy * dy;
  }
  // Direction = eigenvector of the larger eigenvalue; normal is orthogonal.
  const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  const dx = Math.cos(theta);
  const dy = Math.sin(theta);
  const nx = -dy;
  const ny = dx;
  return { nx, ny, c: nx * mx + ny * my };
}

function intersectLines(a: Line, b: Line): Point2 | null {
  const det = a.nx * b.ny - a.ny * b.nx;
  if (Math.abs(det) < 1e-9) return null;
  return {
    x: (a.c * b.ny - b.c * a.ny) / det,
    y: (a.nx * b.c - b.nx * a.c) / det,
  };
}

/**
 * Snap a hull quad to the straight runs of the blob boundary: fit each side
 * on the boundary points lying along its middle 80 %, then intersect
 * neighbouring sides. A corner clipped by a small leak or a rounded card
 * corner no longer drags the vertex inward. Falls back per corner to the hull
 * vertex when a fit is weak or the intersection runs away.
 */
function refineQuadBySides(
  quad: readonly [Point2, Point2, Point2, Point2],
  boundary: readonly Point2[],
  bandPx = 2.5,
): {
  quad: [Point2, Point2, Point2, Point2];
  /** Share of boundary pixels lying on one of the 4 refined sides. */
  support: number;
} {
  // 1. Fit each side on the boundary points along its middle 80 %. The hull
  //    vertex may sit a few px off the true corner (erosion rounds corners),
  //    so the collection band is wider than the final tolerance.
  const lines: Line[] = [];
  for (let i = 0; i < 4; i++) {
    const a = quad[i]!;
    const b = quad[(i + 1) % 4]!;
    const base = lineThrough(a, b);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy || 1;
    const near: Point2[] = [];
    for (const p of boundary) {
      if (Math.abs(base.nx * p.x + base.ny * p.y - base.c) > bandPx * 2) {
        continue;
      }
      const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
      if (t >= 0.1 && t <= 0.9) near.push(p);
    }
    const fitted = near.length >= 10 ? fitLine(near) : null;
    lines.push(fitted ?? base);
  }

  // 2. Corners = intersections of neighbouring fitted sides (bounded drift).
  const out: Point2[] = [];
  for (let i = 0; i < 4; i++) {
    const prev = lines[(i + 3) % 4]!;
    const cur = lines[i]!;
    const hullCorner = quad[i]!;
    const hit = intersectLines(prev, cur);
    const sideLen = Math.hypot(
      quad[(i + 1) % 4]!.x - hullCorner.x,
      quad[(i + 1) % 4]!.y - hullCorner.y,
    );
    const drift = hit
      ? Math.hypot(hit.x - hullCorner.x, hit.y - hullCorner.y)
      : Infinity;
    out.push(hit && drift <= sideLen * 0.2 ? hit : hullCorner);
  }
  const refined = out as [Point2, Point2, Point2, Point2];

  // 3. Support: boundary pixels within `bandPx` of one of the refined sides.
  let supported = 0;
  if (boundary.length) {
    const sides = refined.map((a, i) => {
      const b = refined[(i + 1) % 4]!;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      return {
        a,
        dx,
        dy,
        len2: dx * dx + dy * dy || 1,
        line: lineThrough(a, b),
      };
    });
    for (const p of boundary) {
      for (const sd of sides) {
        if (
          Math.abs(sd.line.nx * p.x + sd.line.ny * p.y - sd.line.c) > bandPx
        ) {
          continue;
        }
        const t = ((p.x - sd.a.x) * sd.dx + (p.y - sd.a.y) * sd.dy) / sd.len2;
        if (t < -0.02 || t > 1.02) continue;
        supported += 1;
        break;
      }
    }
  }
  return {
    quad: refined,
    support: boundary.length ? supported / boundary.length : 0,
  };
}

/**
 * Order 4 corners TL→TR→BR→BL for a card that is mostly upright: clockwise in
 * image space, starting at the vertex closest to the top-left of the quad's
 * own bounding box. Works for any tilt < 45°; beyond that "top" is ambiguous.
 */
export function orderQuadCorners(
  points: readonly [Point2, Point2, Point2, Point2],
): [Point2, Point2, Point2, Point2] {
  const cx = (points[0].x + points[1].x + points[2].x + points[3].x) / 4;
  const cy = (points[0].y + points[1].y + points[2].y + points[3].y) / 4;
  const sorted = [...points].sort(
    (a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx),
  );
  let start = 0;
  let best = Infinity;
  for (let i = 0; i < 4; i++) {
    const s = sorted[i]!.x + sorted[i]!.y;
    if (s < best) {
      best = s;
      start = i;
    }
  }
  return [
    sorted[start]!,
    sorted[(start + 1) % 4]!,
    sorted[(start + 2) % 4]!,
    sorted[(start + 3) % 4]!,
  ];
}

/**
 * Edge mask with its holes filled: everything that cannot be reached from the
 * frame border without crossing an edge, plus the edges themselves. A card
 * fully in frame is a closed loop → border + interior (art edges included)
 * form one solid blob. Neighbouring cards cut by the frame, the table and
 * hands leak to the border: only their thin edge lines survive, and those
 * fail the fill-ratio test. Rotation-agnostic.
 */
function enclosedMask(
  edge: Uint8Array,
  width: number,
  height: number,
): Uint8Array {
  const reach = new Uint8Array(edge.length);
  const stack: number[] = [];
  const seed = (i: number) => {
    if (edge[i] || reach[i]) return;
    reach[i] = 1;
    stack.push(i);
  };
  for (let x = 0; x < width; x++) {
    seed(x);
    seed((height - 1) * width + x);
  }
  for (let y = 0; y < height; y++) {
    seed(y * width);
    seed(y * width + width - 1);
  }
  while (stack.length) {
    const i = stack.pop()!;
    const x = i % width;
    if (x > 0) seed(i - 1);
    if (x < width - 1) seed(i + 1);
    if (i >= width) seed(i - width);
    if (i + width < edge.length) seed(i + width);
  }
  const out = new Uint8Array(edge.length);
  for (let i = 0; i < edge.length; i++) {
    out[i] = reach[i] ? 0 : 1;
  }
  return out;
}

function sideLen(a: Point2, b: Point2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function aspectOk(points: readonly [Point2, Point2, Point2, Point2]): boolean {
  const [tl, tr, br, bl] = points;
  const w = (sideLen(tl, tr) + sideLen(bl, br)) / 2;
  const h = (sideLen(tl, bl) + sideLen(tr, br)) / 2;
  if (w < 12 || h < 12) return false;
  const ratio = w / h;
  return (ratio >= 0.45 && ratio <= 0.95) || (ratio >= 1.05 && ratio <= 2.2);
}

function scaleQuad(
  points: readonly [Point2, Point2, Point2, Point2],
  scaleX: number,
  scaleY: number,
): [Point2, Point2, Point2, Point2] {
  return points.map((p) => ({
    x: p.x * scaleX,
    y: p.y * scaleY,
  })) as [Point2, Point2, Point2, Point2];
}

export function insetQuad(
  points: readonly [Point2, Point2, Point2, Point2],
  amount = 0.06,
): [Point2, Point2, Point2, Point2] {
  const t = Math.max(0, Math.min(0.25, amount));
  const cx = (points[0].x + points[1].x + points[2].x + points[3].x) / 4;
  const cy = (points[0].y + points[1].y + points[2].y + points[3].y) / 4;
  return points.map((p) => ({
    x: p.x + (cx - p.x) * t,
    y: p.y + (cy - p.y) * t,
  })) as [Point2, Point2, Point2, Point2];
}

export function isNearAxisAligned(
  points: readonly [Point2, Point2, Point2, Point2],
  maxSkewPx = 28,
): boolean {
  const [tl, tr, br, bl] = points;
  return (
    Math.abs(tl.y - tr.y) <= maxSkewPx &&
    Math.abs(bl.y - br.y) <= maxSkewPx &&
    Math.abs(tl.x - bl.x) <= maxSkewPx &&
    Math.abs(tr.x - br.x) <= maxSkewPx
  );
}

/**
 * Detect best card-like quad from a grayscale buffer already at detect resolution.
 * `fullW`/`fullH` scale corners back to the original frame.
 */
export function detectCardQuadFromGray(
  gray: Uint8Array | Buffer,
  dw: number,
  dh: number,
  fullW: number,
  fullH: number,
): ClassicalCardQuad | null {
  if (dw < 32 || dh < 32 || fullW < 48 || fullH < 48) return null;
  if (gray.length < dw * dh) return null;

  const mag = sobelMagnitude(gray, dw, dh);
  // Bright tables (white desk) → weaker border contrast; use a lower edge
  // percentile so the black card frame still closes into one blob.
  let lumaSum = 0;
  const lumaStep = Math.max(1, Math.floor(gray.length / 2000));
  let lumaN = 0;
  for (let i = 0; i < gray.length; i += lumaStep) {
    lumaSum += gray[i]!;
    lumaN += 1;
  }
  const meanLuma = lumaN ? lumaSum / lumaN : 128;
  const edgePct = meanLuma >= 150 ? 68 : meanLuma >= 110 ? 74 : 78;
  const thr = percentileThreshold(mag, edgePct);
  const edge = new Uint8Array(dw * dh);
  for (let i = 0; i < mag.length; i++) {
    edge[i] = mag[i]! >= thr ? 1 : 0;
  }
  const closed = dilate3(dilate3(edge, dw, dh), dw, dh);
  const ctx: DetectContext = { dw, dh, fullW, fullH, frameArea: dw * dh };

  // Pass 1 — hole-filled edge blobs. A card fully in frame is a closed edge
  // loop whatever its tilt → one solid blob; cards cut by the frame, the table
  // and hands leak to the border and only leave thin edge lines. Eroding the
  // filled mask (morphological opening) deletes those lines — including the
  // ones that would glue a touching neighbour or table texture to the card —
  // and the solid card survives, shrunk by the erosion radius, which the
  // corners get back. Corners come from the convex hull, so a card at 30°
  // still yields its true 4 corners (extreme points only work upright).
  let solid = enclosedMask(closed, dw, dh);
  for (let i = 0; i < ENCLOSED_ERODE_PX; i++) solid = erode3(solid, dw, dh);
  const enclosed = bestCandidate(
    largestBlobs(solid, dw, dh, 4),
    ctx,
    "enclosed",
  );
  if (enclosed) return enclosed;

  // Pass 2 — scanline fill. Tolerates a border broken by glare and cards that
  // touch the frame edge (no closed loop), at the cost of merging neighbours.
  const filled = new Uint8Array(dw * dh);
  for (let y = 0; y < dh; y++) {
    let first = -1;
    let last = -1;
    for (let x = 0; x < dw; x++) {
      if (closed[y * dw + x]) {
        if (first < 0) first = x;
        last = x;
      }
    }
    if (first >= 0 && last - first >= dw * 0.08) {
      for (let x = first; x <= last; x++) filled[y * dw + x] = 1;
    }
  }
  return bestCandidate(largestBlobs(filled, dw, dh, 4), ctx, "filled");
}

type DetectContext = {
  dw: number;
  dh: number;
  fullW: number;
  fullH: number;
  frameArea: number;
};

/** Enclosed blobs must be convex and rectangular; filled blobs are looser. */
const ENCLOSED_MIN_FILL = 0.8;
/** …and their boundary must mostly sit on the 4 fitted sides. */
const ENCLOSED_MIN_SUPPORT = 0.8;
/**
 * Opening radius (detect-space px). Dilated Sobel lines are ≤ ~8 px wide at
 * 320 px, so 4 erosions wipe them; a card ≥ 12 % of the frame keeps > 80 %
 * of its pixels.
 */
const ENCLOSED_ERODE_PX = 4;

/**
 * A candidate whose bounding box spans more than this share of the frame in
 * both directions is the background (table edge, mat, poster), never the
 * aimed card — it is what turned a busy table into a "card" crop.
 */
export const MAX_SUBJECT_FRAME_SPAN = 0.9;

/** Push each corner away from the centroid by `px` along its diagonal. */
function growQuad(
  points: readonly [Point2, Point2, Point2, Point2],
  px: number,
): [Point2, Point2, Point2, Point2] {
  const cx = (points[0].x + points[1].x + points[2].x + points[3].x) / 4;
  const cy = (points[0].y + points[1].y + points[2].y + points[3].y) / 4;
  return points.map((p) => {
    const dx = p.x - cx;
    const dy = p.y - cy;
    const len = Math.hypot(dx, dy) || 1;
    // A corner moves √2·px when both adjacent sides move px outward.
    const k = (px * Math.SQRT2) / len;
    return { x: p.x + dx * k, y: p.y + dy * k };
  }) as [Point2, Point2, Point2, Point2];
}

function bestCandidate(
  blobs: readonly BlobInfo[],
  ctx: DetectContext,
  mode: "enclosed" | "filled",
): ClassicalCardQuad | null {
  const { dw, dh, fullW, fullH, frameArea } = ctx;
  let best: ClassicalCardQuad | null = null;

  for (const blob of blobs) {
    const coverage = blob.area / frameArea;
    if (coverage < 0.06 || coverage > 0.92) continue;

    const bw = blob.maxX - blob.minX + 1;
    const bh = blob.maxY - blob.minY + 1;
    if (bw < dw * 0.12 || bh < dh * 0.12) continue;
    // Spanning (almost) the whole frame both ways is the table / mat / poster
    // behind the card, not the card: the subject leaves frame around it in at
    // least one direction (a close-up card still shows table left and right).
    if (bw > dw * MAX_SUBJECT_FRAME_SPAN && bh > dh * MAX_SUBJECT_FRAME_SPAN) {
      continue;
    }

    let local =
      mode === "enclosed"
        ? hullToQuad(convexHull(blob.boundary))
        : extremePointQuad(blob.pixels, dw);
    if (!local || !aspectOk(local)) continue;

    if (mode === "enclosed") {
      // Fill ratio against the eroded blob's own hull, then snap the sides to
      // the straight boundary runs and undo the erosion.
      if (blob.area / Math.max(1, quadArea(local)) < ENCLOSED_MIN_FILL) {
        continue;
      }
      const refined = refineQuadBySides(local, blob.boundary);
      // A card outline is four straight runs; a blob carved out of a busy
      // table by chance is not — leave it to the learned detector.
      if (refined.support < ENCLOSED_MIN_SUPPORT) continue;
      local = growQuad(refined.quad, ENCLOSED_ERODE_PX);
    }
    const area = quadArea(local);
    if (area / frameArea < 0.05) continue;

    const coverageScore = 1 - Math.abs(coverage - 0.4);
    // Centre prior: the card the user aims at sits mid-frame; a same-size
    // neighbour at the edge should not win.
    const cx = (local[0].x + local[1].x + local[2].x + local[3].x) / 4;
    const cy = (local[0].y + local[1].y + local[2].y + local[3].y) / 4;
    const centreDist =
      Math.hypot(cx - dw / 2, cy - dh / 2) / (0.5 * Math.hypot(dw, dh));
    const centrePrior = 1 - 0.4 * Math.min(1, centreDist);
    const score = area * (0.5 + coverageScore) * centrePrior;

    const scaleX = fullW / dw;
    const scaleY = fullH / dh;
    const scaled = scaleQuad(local, scaleX, scaleY);
    // Enclosed corners already sit inside the dilated border; the filled
    // path keeps its historical 3 % safety inset.
    const corners = mode === "enclosed" ? scaled : insetQuad(scaled, 0.03);

    const candidate: ClassicalCardQuad = {
      corners,
      aabb: aabbFromBlob(
        blob,
        ctx,
        mode === "enclosed" ? ENCLOSED_ERODE_PX : 0,
      ),
      coverage,
      score,
      precision: mode === "enclosed" ? "high" : "low",
    };
    if (!best || candidate.score > best.score) best = candidate;
  }

  return best;
}

function aabbFromBlob(
  blob: BlobInfo,
  ctx: DetectContext,
  growPx = 0,
): ClassicalCardQuad["aabb"] {
  const { dw, dh, fullW, fullH } = ctx;
  const scaleX = fullW / dw;
  const scaleY = fullH / dh;
  const aabbPad = 0.02;
  const aabbW = (blob.maxX - blob.minX + 1 + 2 * growPx) * scaleX;
  const aabbH = (blob.maxY - blob.minY + 1 + 2 * growPx) * scaleY;
  const aabbLeft = (blob.minX - growPx) * scaleX - aabbW * aabbPad;
  const aabbTop = (blob.minY - growPx) * scaleY - aabbH * aabbPad;
  const aabb = {
    left: Math.max(0, Math.floor(aabbLeft)),
    top: Math.max(0, Math.floor(aabbTop)),
    width: Math.max(16, Math.min(fullW, Math.ceil(aabbW * (1 + 2 * aabbPad)))),
    height: Math.max(16, Math.min(fullH, Math.ceil(aabbH * (1 + 2 * aabbPad)))),
  };
  if (aabb.left + aabb.width > fullW) aabb.width = fullW - aabb.left;
  if (aabb.top + aabb.height > fullH) aabb.height = fullH - aabb.top;
  return aabb;
}

/** RGBA → grayscale luminance (BT.601). */
export function rgbaToGray(
  rgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
): Uint8Array {
  const out = new Uint8Array(width * height);
  for (let i = 0, p = 0; i < out.length; i++, p += 4) {
    out[i] = (rgba[p]! * 77 + rgba[p + 1]! * 150 + rgba[p + 2]! * 29) >> 8;
  }
  return out;
}
