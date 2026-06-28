import sharp from "sharp";

const LIGHT_BACKGROUND_LUMINANCE = 242;
const LIGHT_BACKGROUND_MAX_DELTA = 28;
const DARK_BACKGROUND_LUMINANCE = 18;
const DARK_BACKGROUND_MAX_DELTA = 28;
const MARGIN_BAND_RATIO = 0.08;
const MIN_NEUTRAL_MARGIN_RATIO = 0.08;
const MIN_LISTING_TEXTURE_STD = 16;
const MIN_LISTING_PHOTO_EDGE = 120;

function isNeutralBackgroundPixel(
  red: number,
  green: number,
  blue: number,
  alpha: number,
): boolean {
  if (alpha < 12) return true;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const luminance = (red + green + blue) / 3;
  return (
    (luminance >= LIGHT_BACKGROUND_LUMINANCE &&
      max - min <= LIGHT_BACKGROUND_MAX_DELTA) ||
    (luminance <= DARK_BACKGROUND_LUMINANCE &&
      max - min <= DARK_BACKGROUND_MAX_DELTA)
  );
}

export type MarginBackgroundSignals = {
  neutralRatio: number;
  luminanceStd: number;
};

export function measureMarginBackgroundSignals(
  data: Buffer,
  width: number,
  height: number,
  channels: number,
): MarginBackgroundSignals {
  const band = Math.max(4, Math.floor(Math.min(width, height) * MARGIN_BAND_RATIO));
  let neutralCount = 0;
  let total = 0;
  let luminanceSum = 0;
  const luminances: number[] = [];

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const onMargin =
        x < band || x >= width - band || y < band || y >= height - band;
      if (!onMargin) continue;

      const offset = (y * width + x) * channels;
      const red = data[offset] ?? 0;
      const green = data[offset + 1] ?? 0;
      const blue = data[offset + 2] ?? 0;
      const alpha = data[offset + 3] ?? 255;
      total += 1;

      if (isNeutralBackgroundPixel(red, green, blue, alpha)) {
        neutralCount += 1;
      }

      const luminance = (red + green + blue) / 3;
      luminanceSum += luminance;
      luminances.push(luminance);
    }
  }

  if (total <= 0 || luminances.length <= 0) {
    return { neutralRatio: 0, luminanceStd: 0 };
  }

  const mean = luminanceSum / luminances.length;
  const variance =
    luminances.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
    luminances.length;

  return {
    neutralRatio: neutralCount / total,
    luminanceStd: Math.sqrt(variance),
  };
}

/** Smartphone / eBay seller photo on a textured surface (wood, fabric, etc.). */
export function marginSignalsIndicateListingPhoto(
  margin: MarginBackgroundSignals,
): boolean {
  return (
    margin.neutralRatio < MIN_NEUTRAL_MARGIN_RATIO &&
    margin.luminanceStd >= MIN_LISTING_TEXTURE_STD
  );
}

export async function detectListingPhotoFromBuffer(
  buffer: Buffer,
): Promise<boolean> {
  try {
    const image = sharp(buffer).rotate();
    const metadata = await image.metadata();
    if (
      !metadata.width ||
      !metadata.height ||
      metadata.format === "gif" ||
      metadata.format === "svg"
    ) {
      return false;
    }

    if (metadata.width > metadata.height * 1.02) {
      return false;
    }

    const shortest = Math.min(metadata.width, metadata.height);
    if (shortest < MIN_LISTING_PHOTO_EDGE) {
      return false;
    }

    const { data, info } = await image
      .clone()
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    return marginSignalsIndicateListingPhoto(
      measureMarginBackgroundSignals(
        data,
        info.width,
        info.height,
        info.channels,
      ),
    );
  } catch {
    return false;
  }
}
