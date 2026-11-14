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
  lightLuminanceThreshold = LIGHT_BACKGROUND_LUMINANCE,
) {
  if (alpha < 12) return true;

  return (
    isNeutralBackgroundPixel(
      red,
      green,
      blue,
      alpha,
      lightLuminanceThreshold,
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
  /**
   * Quarter-turn applied to the source *before* the rectangle, in degrees
   * (0 / 90 / 180 / 270). The box is therefore expressed in post-rotation
   * coordinates — the space the collector drew it in.
   *
   * Recorded rather than inferred so the derivative can be reproduced from the
   * original, and so anything that has to follow the artwork — the foil masks
   * above all — can be given the same treatment instead of guessing.
   */
  rotate?: number;
};

/** The only rotations the editor offers: lossless, and enough for a scan. */
export const QUARTER_TURNS = [0, 90, 180, 270] as const;

/** Coerce anything to one of {@link QUARTER_TURNS}; unknown input means none. */
export function normalizeRotation(value: unknown): number {
  const degrees = typeof value === "number" ? Math.round(value) : 0;
  if (!Number.isFinite(degrees)) return 0;
  const wrapped = ((degrees % 360) + 360) % 360;
  return (QUARTER_TURNS as readonly number[]).includes(wrapped) ? wrapped : 0;
}

export type ImageTrimOptions = {
  minMarginPixels?: number;
  /** Default {@link LIGHT_BACKGROUND_LUMINANCE}. Lower for off-white scan beds (Imadoki). */
  lightLuminanceThreshold?: number;
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
  options: ImageTrimOptions = {},
): Promise<CropBox | null> {
  const minMarginPixels = options.minMarginPixels ?? MIN_CROP_PIXELS;
  const lightLuminanceThreshold =
    options.lightLuminanceThreshold ?? LIGHT_BACKGROUND_LUMINANCE;

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

        if (isTrimMarginPixel(red, green, blue, alpha, lightLuminanceThreshold))
          continue;

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
  options: ImageTrimOptions = {},
): Promise<Buffer> {
  const box = await suggestCropBox(buffer, options);
  if (!box) return buffer;
  try {
    return await applyCropBox(buffer, box);
  } catch {
    return buffer;
  }
}

/**
 * Apply a rotation then a box. Kept separate so nothing crops without being told.
 *
 * Two passes on purpose. `rotate()` with no argument honours EXIF orientation
 * and `rotate(angle)` turns by an angle, but sharp keeps only the last call —
 * asking for both on one pipeline silently drops the EXIF correction. Encoding
 * the oriented bitmap first makes the order explicit, and it is the order the
 * box was drawn in: turn the picture upright, *then* frame it.
 */
export async function applyCropBox(
  buffer: Buffer,
  box: CropBox,
): Promise<Buffer> {
  const rotation = normalizeRotation(box.rotate);
  const oriented = await sharp(buffer).rotate().toBuffer();
  const framed =
    rotation === 0
      ? oriented
      : await sharp(oriented).rotate(rotation).toBuffer();

  return sharp(framed)
    .extract({
      left: box.left,
      top: box.top,
      width: box.width,
      height: box.height,
    })
    .toBuffer();
}

/** Source dimensions after EXIF orientation and `rotate`, in that order. */
export async function orientedDimensions(
  buffer: Buffer,
  rotate?: number,
): Promise<{ width: number; height: number }> {
  const meta = await sharp(buffer).rotate().metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  const odd = normalizeRotation(rotate) % 180 === 90;
  return odd ? { width: height, height: width } : { width, height };
}
