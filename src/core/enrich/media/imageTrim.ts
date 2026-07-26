import sharp from "sharp";

const LIGHT_BACKGROUND_LUMINANCE = 242;
const LIGHT_BACKGROUND_MAX_DELTA = 28;
const DARK_BACKGROUND_LUMINANCE = 18;
const DARK_BACKGROUND_MAX_DELTA = 28;
const MIN_CROP_PIXELS = 4;
const MIN_RETAINED_RATIO = 0.45;
const MAX_TRIM_PIXELS = 16_000_000;

function isNeutralBackgroundPixel(
  red: number,
  green: number,
  blue: number,
  alpha: number,
  luminanceThreshold: number,
  maxDelta: number,
  mode: "light" | "dark",
) {
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const luminance = (red + green + blue) / 3;

  if (mode === "light") {
    return luminance >= luminanceThreshold && max - min <= maxDelta;
  }

  return luminance <= luminanceThreshold && max - min <= maxDelta;
}

function isTrimMarginPixel(
  red: number,
  green: number,
  blue: number,
  alpha: number,
) {
  if (alpha < 12) return true;

  return (
    isNeutralBackgroundPixel(
      red,
      green,
      blue,
      alpha,
      LIGHT_BACKGROUND_LUMINANCE,
      LIGHT_BACKGROUND_MAX_DELTA,
      "light",
    ) ||
    isNeutralBackgroundPixel(
      red,
      green,
      blue,
      alpha,
      DARK_BACKGROUND_LUMINANCE,
      DARK_BACKGROUND_MAX_DELTA,
      "dark",
    )
  );
}

function shouldSkipFormat(format?: string) {
  return format === "gif" || format === "svg";
}

export type CropBox = {
  left: number;
  top: number;
  width: number;
  height: number;
  /** Source dimensions, so a stored box can be validated against the file. */
  imageWidth: number;
  imageHeight: number;
};

/**
 * The rectangle that would remain once neutral margins are trimmed, or `null`
 * when there is nothing worth trimming.
 *
 * Returns geometry rather than pixels on purpose: a *suggestion* the user can
 * accept, adjust or ignore. Applying it automatically was the old behaviour and
 * it cost more than it gave — the crop replaced the stored URL, so provenance
 * was lost and there was no way back to the original framing.
 */
export async function suggestCropBox(
  buffer: Buffer,
  options: { minMarginPixels?: number } = {},
): Promise<CropBox | null> {
  const minMarginPixels = options.minMarginPixels ?? MIN_CROP_PIXELS;

  try {
    const image = sharp(buffer).rotate();
    const metadata = await image.metadata();
    if (
      !metadata.width ||
      !metadata.height ||
      shouldSkipFormat(metadata.format) ||
      (metadata.pages ?? 1) > 1 ||
      metadata.width * metadata.height > MAX_TRIM_PIXELS
    ) {
      return null;
    }

    const { data, info } = await image
      .clone()
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    let minX = info.width;
    let minY = info.height;
    let maxX = -1;
    let maxY = -1;

    for (let y = 0; y < info.height; y += 1) {
      for (let x = 0; x < info.width; x += 1) {
        const offset = (y * info.width + x) * info.channels;
        const red = data[offset] ?? 0;
        const green = data[offset + 1] ?? 0;
        const blue = data[offset + 2] ?? 0;
        const alpha = data[offset + 3] ?? 255;

        if (isTrimMarginPixel(red, green, blue, alpha)) continue;

        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }

    if (maxX < minX || maxY < minY) return null;

    const cropWidth = maxX - minX + 1;
    const cropHeight = maxY - minY + 1;
    if (cropWidth === info.width && cropHeight === info.height) {
      return null;
    }

    const removedX = info.width - cropWidth;
    const removedY = info.height - cropHeight;
    if (removedX < minMarginPixels && removedY < minMarginPixels) {
      return null;
    }

    if (
      cropWidth / info.width < MIN_RETAINED_RATIO ||
      cropHeight / info.height < MIN_RETAINED_RATIO
    ) {
      return null;
    }

    return {
      left: minX,
      top: minY,
      width: cropWidth,
      height: cropHeight,
      imageWidth: info.width,
      imageHeight: info.height,
    };
  } catch {
    return null;
  }
}

/**
 * Trim neutral margins, or return the buffer untouched when there is nothing to
 * trim. Only callers that explicitly opt in should use this — see the callers of
 * `trim: true`.
 */
export async function trimLightImageMargins(
  buffer: Buffer,
  options: { minMarginPixels?: number } = {},
): Promise<Buffer> {
  const box = await suggestCropBox(buffer, options);
  if (!box) return buffer;
  try {
    return await applyCropBox(buffer, box);
  } catch {
    return buffer;
  }
}

/** Apply a box to an image. Kept separate so nothing crops without being told. */
export async function applyCropBox(
  buffer: Buffer,
  box: CropBox,
): Promise<Buffer> {
  return sharp(buffer)
    .rotate()
    .extract({
      left: box.left,
      top: box.top,
      width: box.width,
      height: box.height,
    })
    .toBuffer();
}
