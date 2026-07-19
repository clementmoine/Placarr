import fs from "node:fs";

import sharp from "sharp";

export {
  type ImageDimensions,
  coverUrlExpectsHighResolution,
  isCoverResolutionAcceptable,
  shortestImageEdge,
} from "@/core/enrich/media/coverResolution";

import type { ImageDimensions } from "@/core/enrich/media/coverResolution";

export async function readBufferImageMetrics(
  buffer: Buffer,
): Promise<ImageDimensions | null> {
  try {
    const metadata = await sharp(buffer).metadata();
    if (!metadata.width || !metadata.height) return null;
    return { width: metadata.width, height: metadata.height };
  } catch {
    return null;
  }
}

export async function readFileImageMetrics(
  filePath: string,
): Promise<ImageDimensions | null> {
  if (!fs.existsSync(filePath)) return null;
  try {
    const metadata = await sharp(filePath).metadata();
    if (!metadata.width || !metadata.height) return null;
    return { width: metadata.width, height: metadata.height };
  } catch {
    return null;
  }
}
