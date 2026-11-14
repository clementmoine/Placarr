/** Rec. 709 luma, 0–255 when the channels are. */
export function luminanceRgb(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Mean Rec. 709 luma over an RGBA buffer. Alpha is ignored. */
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
