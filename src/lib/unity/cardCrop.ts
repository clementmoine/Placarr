/**
 * Crop square card-slot textures to Live mesh UV rect (mirrors ``card_crop.py``).
 */

export type UvRect = {
  u0: number;
  u1: number;
  v0: number;
  v1: number;
};

export type CroppedRgba = {
  rgba: Buffer;
  width: number;
  height: number;
};

/** Square packed texture → card rect. Non-square images pass through. */
export function cropCardRgba(
  rgba: Buffer,
  width: number,
  height: number,
  rect: UvRect | null | undefined,
): CroppedRgba {
  if (!rect || width !== height) {
    return { rgba, width, height };
  }
  const left = Math.round(rect.u0 * width);
  const right = Math.round(rect.u1 * width);
  const top = Math.round((1.0 - rect.v1) * height);
  const bottom = Math.round((1.0 - rect.v0) * height);
  const w = right - left;
  const h = bottom - top;
  if (w <= 0 || h <= 0) return { rgba, width, height };
  if (w === width && h === height) return { rgba, width, height };

  const out = Buffer.allocUnsafe(w * h * 4);
  const srcStride = width * 4;
  const dstStride = w * 4;
  for (let y = 0; y < h; y++) {
    const srcOff = (top + y) * srcStride + left * 4;
    rgba.copy(out, y * dstStride, srcOff, srcOff + dstStride);
  }
  return { rgba: out, width: w, height: h };
}

export function loadUvRectFromJson(raw: unknown): UvRect | null {
  if (!raw || typeof raw !== "object") return null;
  const rect = (raw as { uvRect?: unknown }).uvRect;
  if (!rect || typeof rect !== "object") return null;
  const r = rect as Record<string, unknown>;
  try {
    return {
      u0: Number(r.u0),
      u1: Number(r.u1),
      v0: Number(r.v0),
      v1: Number(r.v1),
    };
  } catch {
    return null;
  }
}
