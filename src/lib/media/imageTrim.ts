import sharp from "sharp";
import fs from "fs";
import path from "path";

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
    return (
      luminance >= luminanceThreshold && max - min <= maxDelta
    );
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

export async function trimLightImageMargins(
  buffer: Buffer,
  options: { minMarginPixels?: number } = {},
): Promise<Buffer> {
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
      return buffer;
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

    if (maxX < minX || maxY < minY) return buffer;

    const cropWidth = maxX - minX + 1;
    const cropHeight = maxY - minY + 1;
    if (cropWidth === info.width && cropHeight === info.height) {
      return buffer;
    }

    const removedX = info.width - cropWidth;
    const removedY = info.height - cropHeight;
    if (removedX < minMarginPixels && removedY < minMarginPixels) {
      return buffer;
    }

    if (
      cropWidth / info.width < MIN_RETAINED_RATIO ||
      cropHeight / info.height < MIN_RETAINED_RATIO
    ) {
      return buffer;
    }

    return image
      .extract({ left: minX, top: minY, width: cropWidth, height: cropHeight })
      .toBuffer();
  } catch {
    return buffer;
  }
}

export async function cropImageIfNeeded(
  urlOrPath: string,
  options: { minMarginPixels?: number } = {},
): Promise<string> {
  if (!urlOrPath || !urlOrPath.startsWith("/uploads/")) {
    return urlOrPath;
  }

  try {
    const cleanUrl = urlOrPath.replace(/_crop(\.[^.]+)$/, "$1");
    const uploadsDir = path.join(process.cwd(), "public", "uploads");
    const fileName = path.basename(cleanUrl);
    const originalFilePath = path.join(uploadsDir, fileName);

    if (!fs.existsSync(originalFilePath)) {
      return urlOrPath;
    }

    const originalBuffer = fs.readFileSync(originalFilePath);
    const trimmedBuffer = await trimLightImageMargins(originalBuffer, options);

    if (trimmedBuffer !== originalBuffer) {
      const ext = path.extname(fileName);
      const baseName = path.basename(fileName, ext);
      const croppedFileName = `${baseName}_crop${ext}`;
      const croppedFilePath = path.join(uploadsDir, croppedFileName);

      fs.writeFileSync(croppedFilePath, trimmedBuffer);
      return `/uploads/${croppedFileName}`;
    } else {
      return cleanUrl;
    }
  } catch (error) {
    console.error("[cropImageIfNeeded] Error cropping image:", error);
    return urlOrPath;
  }
}
