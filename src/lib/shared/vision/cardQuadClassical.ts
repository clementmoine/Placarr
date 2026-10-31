/**
 * Classical card-quad detection (no OpenCV / sharp).
 * Downscaled gray → Sobel → blob → extreme-point corners.
 * Shared by server dewarp and client live vision overlay.
 */

export type Point2 = { x: number; y: number };

export type ClassicalCardQuad = {
  /** Corners in full-resolution source pixels (TL→TR→BR→BL). */
  corners: [Point2, Point2, Point2, Point2];
  aabb: { left: number; top: number; width: number; height: number };
  coverage: number;
  score: number;
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

type BlobInfo = {
  id: number;
  area: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  pixels: number[];
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

    blobs.push({ id, area, minX, minY, maxX, maxY, pixels });
  }

  return blobs.sort((a, b) => b.area - a.area).slice(0, keep);
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

  const blobs = largestBlobs(filled, dw, dh, 4);
  const frameArea = dw * dh;
  let best: ClassicalCardQuad | null = null;

  for (const blob of blobs) {
    const coverage = blob.area / frameArea;
    if (coverage < 0.06 || coverage > 0.92) continue;

    const bw = blob.maxX - blob.minX + 1;
    const bh = blob.maxY - blob.minY + 1;
    if (bw < dw * 0.12 || bh < dh * 0.12) continue;

    const local = extremePointQuad(blob.pixels, dw);
    if (!local || !aspectOk(local)) continue;

    const area = quadArea(local);
    if (area / frameArea < 0.05) continue;

    const coverageScore = 1 - Math.abs(coverage - 0.4);
    const score = area * (0.5 + coverageScore);
    const scaleX = fullW / dw;
    const scaleY = fullH / dh;
    const corners = insetQuad(scaleQuad(local, scaleX, scaleY), 0.03);

    const aabbPad = 0.02;
    const aabbW = (blob.maxX - blob.minX + 1) * scaleX;
    const aabbH = (blob.maxY - blob.minY + 1) * scaleY;
    const aabbLeft = blob.minX * scaleX - aabbW * aabbPad;
    const aabbTop = blob.minY * scaleY - aabbH * aabbPad;
    const aabb = {
      left: Math.max(0, Math.floor(aabbLeft)),
      top: Math.max(0, Math.floor(aabbTop)),
      width: Math.max(
        16,
        Math.min(fullW, Math.ceil(aabbW * (1 + 2 * aabbPad))),
      ),
      height: Math.max(
        16,
        Math.min(fullH, Math.ceil(aabbH * (1 + 2 * aabbPad))),
      ),
    };
    if (aabb.left + aabb.width > fullW) aabb.width = fullW - aabb.left;
    if (aabb.top + aabb.height > fullH) aabb.height = fullH - aabb.top;

    const candidate: ClassicalCardQuad = {
      corners,
      aabb,
      coverage,
      score,
    };
    if (!best || candidate.score > best.score) best = candidate;
  }

  return best;
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
