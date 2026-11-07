import sharp from "sharp";

const UNAVAILABLE_TILE_MIN_DARK_RATIO = 0.55;
/** Google "no cover" tiles are flat; real dark art stays above this. */
const UNAVAILABLE_TILE_MAX_ENTROPY = 4.5;

function luminanceEntropy(
  data: Buffer,
  width: number,
  height: number,
  channels: number,
): number {
  const histogram = new Array<number>(256).fill(0);
  let counted = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * channels;
      const alpha = data[offset + 3] ?? 255;
      if (alpha < 12) continue;
      const red = data[offset] ?? 0;
      const green = data[offset + 1] ?? 0;
      const blue = data[offset + 2] ?? 0;
      const luminance = Math.round(0.299 * red + 0.587 * green + 0.114 * blue);
      histogram[luminance] += 1;
      counted += 1;
    }
  }

  if (counted === 0) return 0;

  let entropy = 0;
  for (const count of histogram) {
    if (count <= 0) continue;
    const probability = count / counted;
    entropy -= probability * Math.log2(probability);
  }
  return entropy;
}

/**
 * Catalog "no cover" tiles — Google Books dark field (~257×389) and light
 * marketplace fillers ("Visuel non disponible", ~260×390). Pixel stats only —
 * no OCR, no provider id literals.
 */
export async function isUnavailableCoverPlaceholderBuffer(
  buffer: Buffer,
): Promise<boolean> {
  if (!buffer.length || buffer.length > 24_000) return false;

  const meta = await sharp(buffer)
    .metadata()
    .catch(() => null);
  if (!meta) return false;

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
  let brightPixels = 0;
  let luminanceSum = 0;
  let counted = 0;
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
      luminanceSum += luminance;
      counted += 1;
      if (luminance < 45) darkPixels += 1;
      if (luminance > 200) brightPixels += 1;
    }
  }

  const entropy = luminanceEntropy(data, width, height, channels);
  const darkRatio = darkPixels / total;
  if (
    darkRatio >= UNAVAILABLE_TILE_MIN_DARK_RATIO &&
    entropy < UNAVAILABLE_TILE_MAX_ENTROPY
  ) {
    return true;
  }

  // Light-gray FR marketplace tiles ("Visuel non disponible"): nearly blank
  // bright field, tiny file, book-cover aspect.
  const meanLuminance = counted > 0 ? luminanceSum / counted : 0;
  const brightRatio = brightPixels / total;
  return (
    meanLuminance >= 200 &&
    brightRatio >= 0.85 &&
    darkRatio < 0.05 &&
    entropy < 5.0
  );
}
