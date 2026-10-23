/**
 * Perspective crop — 4 independent corners → upright rectangle.
 *
 * sharp has no perspective; we solve a homography in JS and resample.
 * @see docs/backlog.md § Recadrage libre à quatre coins
 */
import sharp from "sharp";

import { normalizeRotation } from "./imageTrim";

export type Point2 = { x: number; y: number };

/** TL → TR → BR → BL in source (post-rotation) pixels. */
export type CropQuad = {
  kind: "quad";
  points: [Point2, Point2, Point2, Point2];
  imageWidth: number;
  imageHeight: number;
  rotate?: number;
  outWidth?: number;
  outHeight?: number;
};

const MAX_WARP_PIXELS = 16_000_000;

function dist(a: Point2, b: Point2): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

export function defaultQuadOutputSize(
  points: readonly [Point2, Point2, Point2, Point2],
): { width: number; height: number } {
  const [tl, tr, br, bl] = points;
  const width = Math.max(1, Math.round((dist(tl, tr) + dist(bl, br)) / 2));
  const height = Math.max(1, Math.round((dist(tl, bl) + dist(tr, br)) / 2));
  return { width, height };
}

export function isCropQuad(value: unknown): value is CropQuad {
  if (!value || typeof value !== "object") return false;
  const row = value as CropQuad;
  if (row.kind !== "quad") return false;
  if (!Array.isArray(row.points) || row.points.length !== 4) return false;
  return row.points.every(
    (p) =>
      p &&
      typeof p.x === "number" &&
      typeof p.y === "number" &&
      Number.isFinite(p.x) &&
      Number.isFinite(p.y),
  );
}

/**
 * Homography H (3×3, row-major) mapping dest → source:
 *   [sx, sy, 1]^T ~ H · [dx, dy, 1]^T
 */
export function computeHomographyDestToSource(
  src: readonly [Point2, Point2, Point2, Point2],
  dest: readonly [Point2, Point2, Point2, Point2],
): Float64Array {
  // 8×8 system Ah = b for h00..h21 (h22 = 1).
  const A: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const s = src[i]!;
    const d = dest[i]!;
    const { x: dx, y: dy } = d;
    const { x: sx, y: sy } = s;
    A.push([dx, dy, 1, 0, 0, 0, -sx * dx, -sx * dy]);
    b.push(sx);
    A.push([0, 0, 0, dx, dy, 1, -sy * dx, -sy * dy]);
    b.push(sy);
  }
  const h = solveLinear8(A, b);
  return new Float64Array([
    h[0]!,
    h[1]!,
    h[2]!,
    h[3]!,
    h[4]!,
    h[5]!,
    h[6]!,
    h[7]!,
    1,
  ]);
}

/** Gaussian elimination with partial pivoting — 8 unknowns. */
function solveLinear8(A: number[][], b: number[]): number[] {
  const n = 8;
  const M = A.map((row, i) => [...row, b[i]!]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(M[r]![col]!) > Math.abs(M[pivot]![col]!)) pivot = r;
    }
    if (Math.abs(M[pivot]![col]!) < 1e-12) {
      throw new Error("imageHomography: degenerate quad");
    }
    if (pivot !== col) {
      const tmp = M[col]!;
      M[col] = M[pivot]!;
      M[pivot] = tmp;
    }
    const diag = M[col]![col]!;
    for (let c = col; c <= n; c++) M[col]![c]! /= diag;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const factor = M[r]![col]!;
      for (let c = col; c <= n; c++) M[r]![c]! -= factor * M[col]![c]!;
    }
  }
  return M.map((row) => row[n]!);
}

export function applyHomography(
  H: Float64Array,
  dx: number,
  dy: number,
): Point2 {
  const w = H[6]! * dx + H[7]! * dy + H[8]!;
  const inv = Math.abs(w) < 1e-12 ? 0 : 1 / w;
  return {
    x: (H[0]! * dx + H[1]! * dy + H[2]!) * inv,
    y: (H[3]! * dx + H[4]! * dy + H[5]!) * inv,
  };
}

function sampleBilinear(
  data: Buffer,
  width: number,
  height: number,
  channels: number,
  x: number,
  y: number,
  out: Uint8Array,
  offset: number,
): void {
  if (x < 0 || y < 0 || x >= width - 1 || y >= height - 1) {
    for (let c = 0; c < channels; c++) out[offset + c] = 0;
    if (channels === 4) out[offset + 3] = 0;
    return;
  }
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = x0 + 1;
  const y1 = y0 + 1;
  const fx = x - x0;
  const fy = y - y0;
  for (let c = 0; c < channels; c++) {
    const i00 = (y0 * width + x0) * channels + c;
    const i10 = (y0 * width + x1) * channels + c;
    const i01 = (y1 * width + x0) * channels + c;
    const i11 = (y1 * width + x1) * channels + c;
    const v =
      (data[i00] ?? 0) * (1 - fx) * (1 - fy) +
      (data[i10] ?? 0) * fx * (1 - fy) +
      (data[i01] ?? 0) * (1 - fx) * fy +
      (data[i11] ?? 0) * fx * fy;
    out[offset + c] = Math.max(0, Math.min(255, Math.round(v)));
  }
}

export async function applyCropQuad(
  buffer: Buffer,
  quad: CropQuad,
): Promise<Buffer> {
  const rotation = normalizeRotation(quad.rotate);
  const oriented = await sharp(buffer).rotate().toBuffer();
  const framed =
    rotation === 0
      ? oriented
      : await sharp(oriented).rotate(rotation).toBuffer();

  const { data, info } = await sharp(framed)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const size = defaultQuadOutputSize(quad.points);
  const outWidth = Math.max(1, Math.round(quad.outWidth ?? size.width));
  const outHeight = Math.max(1, Math.round(quad.outHeight ?? size.height));
  if (outWidth * outHeight > MAX_WARP_PIXELS) {
    throw new Error("imageHomography: output too large");
  }

  const dest: [Point2, Point2, Point2, Point2] = [
    { x: 0, y: 0 },
    { x: outWidth - 1, y: 0 },
    { x: outWidth - 1, y: outHeight - 1 },
    { x: 0, y: outHeight - 1 },
  ];
  const H = computeHomographyDestToSource(quad.points, dest);
  const channels = info.channels;
  const out = new Uint8Array(outWidth * outHeight * channels);

  for (let y = 0; y < outHeight; y++) {
    for (let x = 0; x < outWidth; x++) {
      const src = applyHomography(H, x, y);
      sampleBilinear(
        data,
        info.width,
        info.height,
        channels,
        src.x,
        src.y,
        out,
        (y * outWidth + x) * channels,
      );
    }
  }

  return sharp(Buffer.from(out), {
    raw: { width: outWidth, height: outHeight, channels: channels as 4 },
  })
    .png()
    .toBuffer();
}
