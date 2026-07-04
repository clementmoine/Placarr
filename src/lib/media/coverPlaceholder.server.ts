import sharp from "sharp";

/**
 * Google Books (and lookalikes) serve a portrait tile with a black field and
 * localized "image not available" artwork (~257×389, ≤ ~20 KB). Pixel stats
 * only — no OCR, no provider id literals.
 */
export async function isUnavailableCoverPlaceholderBuffer(
  buffer: Buffer,
): Promise<boolean> {
  if (!buffer.length || buffer.length > 24_000) return false;

  let meta: sharp.Metadata;
  try {
    meta = await sharp(buffer).metadata();
  } catch {
    return false;
  }

  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (width < 1 || height < 1) return false;

  // Google Books EN "image not available" (~128×170 PNG, ~1.3 KB).
  if (
    buffer.length <= 2_048 &&
    width >= 100 &&
    width <= 135 &&
    height >= 150 &&
    height <= 185
  ) {
    return true;
  }

  if (width < 200 || width > 320 || height < 350 || height > 450) {
    return false;
  }

  const aspect = width / height;
  if (aspect < 0.55 || aspect > 0.75) return false;

  const { data, info } = await sharp(buffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const channels = info.channels;
  let darkPixels = 0;
  const total = width * height;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * channels;
      const alpha = data[offset + 3] ?? 255;
      if (alpha < 12) continue;
      const red = data[offset] ?? 0;
      const green = data[offset + 1] ?? 0;
      const blue = data[offset + 2] ?? 0;
      const luminance = 0.299 * red + 0.587 * green + 0.114 * blue;
      if (luminance < 45) darkPixels += 1;
    }
  }

  return darkPixels / total >= 0.55;
}
