import fs from "node:fs";

import sharp from "sharp";

export {
  type ImageDimensions,
  coverUrlExpectsHighResolution,
  isCoverResolutionAcceptable,
  shortestImageEdge,
} from "@/core/enrich/media/coverResolution";

import type { ImageDimensions } from "@/core/enrich/media/coverResolution";
import { suggestCropBox } from "@/core/enrich/media/imageTrim";

/**
 * Dimensions used for cover ranking: the trimmed content box when neutral
 * margins pad the canvas (e.g. a 500×500 marketplace square whose art is
 * actually 347×500). File width/height alone would treat that as a perfect
 * square sleeve on a LaserDisc shelf.
 */
export async function measureDisplayImageDimensions(
  buffer: Buffer,
): Promise<ImageDimensions | null> {
  try {
    const metadata = await sharp(buffer).rotate().metadata();
    if (!metadata.width || !metadata.height) return null;

    const box = await suggestCropBox(buffer);
    if (box?.width && box?.height) {
      return { width: box.width, height: box.height };
    }
    return { width: metadata.width, height: metadata.height };
  } catch {
    return null;
  }
}

export async function readBufferImageMetrics(
  buffer: Buffer,
): Promise<ImageDimensions | null> {
  return measureDisplayImageDimensions(buffer);
}

export async function readFileImageMetrics(
  filePath: string,
): Promise<ImageDimensions | null> {
  if (!fs.existsSync(filePath)) return null;
  try {
    const buffer = fs.readFileSync(filePath);
    return measureDisplayImageDimensions(buffer);
  } catch {
    return null;
  }
}
