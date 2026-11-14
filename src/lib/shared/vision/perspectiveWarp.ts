/**
 * Perspective rectification — 4 corners → upright rectangle, pure TS.
 *
 * Shared by the server crop (`core/enrich/media/imageHomography`) and the
 * client scanner, which rectifies the live card face from the detected quad
 * before embedding / OCR. Neither canvas 2D nor sharp warps perspective.
 */

export type WarpPoint = { x: number; y: number };
export type WarpQuad = readonly [WarpPoint, WarpPoint, WarpPoint, WarpPoint];

/** Interleaved pixel buffer (RGBA from canvas, RGB/RGBA from sharp raw). */
export type PixelSource = {
  data: Uint8Array | Uint8ClampedArray | Buffer;
  width: number;
  height: number;
  channels: number;
};

function dist(a: WarpPoint, b: WarpPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Homography H (3×3, row-major) mapping dest → source:
 *   [sx, sy, 1]^T ~ H · [dx, dy, 1]^T
 */
export function computeHomographyDestToSource(
  src: WarpQuad,
  dest: WarpQuad,
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
      throw new Error("perspectiveWarp: degenerate quad");
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
): WarpPoint {
  const w = H[6]! * dx + H[7]! * dy + H[8]!;
  const inv = Math.abs(w) < 1e-12 ? 0 : 1 / w;
  return {
    x: (H[0]! * dx + H[1]! * dy + H[2]!) * inv,
    y: (H[3]! * dx + H[4]! * dy + H[5]!) * inv,
  };
}

export function sampleBilinear(
  data: Uint8Array | Uint8ClampedArray | Buffer,
  width: number,
  height: number,
  channels: number,
  x: number,
  y: number,
  out: Uint8Array | Uint8ClampedArray,
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

/** Mean of the two opposite side lengths — the quad's natural output size. */
export function quadNaturalSize(quad: WarpQuad): {
  width: number;
  height: number;
} {
  const [tl, tr, br, bl] = quad;
  return {
    width: Math.max(1, Math.round((dist(tl, tr) + dist(bl, br)) / 2)),
    height: Math.max(1, Math.round((dist(tl, bl) + dist(tr, br)) / 2)),
  };
}

/**
 * Re-order TL→TR→BR→BL corners so the short sides are top/bottom (portrait
 * card). A card lying sideways (tilt > 45°) comes back rotated by a quarter
 * turn; 180° stays ambiguous and is left as is.
 */
export function uprightPortraitQuad(quad: WarpQuad): WarpQuad {
  const [tl, tr, br, bl] = quad;
  const top = (dist(tl, tr) + dist(bl, br)) / 2;
  const side = (dist(tl, bl) + dist(tr, br)) / 2;
  if (top <= side) return quad;
  return [tr, br, bl, tl];
}

export type WarpOptions = {
  /** Output width in pixels. */
  outWidth: number;
  /** Output height in pixels. */
  outHeight: number;
  /** Only render these output rows (inclusive start, exclusive end). */
  rows?: { start: number; end: number };
};

/**
 * Warp the quad of `src` into an `outWidth × outHeight` upright image. With
 * `rows`, only that horizontal band is rendered (e.g. a collector footer at
 * native resolution) and the returned height is the band height.
 */
export function warpQuadToRect(
  src: PixelSource,
  quad: WarpQuad,
  opts: WarpOptions,
): { data: Uint8ClampedArray; width: number; height: number } {
  const outWidth = Math.max(1, Math.round(opts.outWidth));
  const outHeight = Math.max(1, Math.round(opts.outHeight));
  const rowStart = Math.max(0, Math.floor(opts.rows?.start ?? 0));
  const rowEnd = Math.min(outHeight, Math.ceil(opts.rows?.end ?? outHeight));
  const bandHeight = Math.max(1, rowEnd - rowStart);

  const dest: WarpQuad = [
    { x: 0, y: 0 },
    { x: outWidth - 1, y: 0 },
    { x: outWidth - 1, y: outHeight - 1 },
    { x: 0, y: outHeight - 1 },
  ];
  const H = computeHomographyDestToSource(quad, dest);
  const { channels, width, height, data } = src;
  const out = new Uint8ClampedArray(outWidth * bandHeight * channels);

  for (let y = rowStart; y < rowEnd; y++) {
    const rowOffset = (y - rowStart) * outWidth * channels;
    for (let x = 0; x < outWidth; x++) {
      const s = applyHomography(H, x, y);
      sampleBilinear(
        data,
        width,
        height,
        channels,
        s.x,
        s.y,
        out,
        rowOffset + x * channels,
      );
    }
  }
  return { data: out, width: outWidth, height: bandHeight };
}
