/**
 * Perspective crop — 4 independent corners → upright rectangle.
 *
 * sharp has no perspective; we solve a homography in JS and resample.
 * @see docs/backlog.md § Recadrage libre à quatre coins
 */
import sharp from "sharp";

import {
  quadNaturalSize,
  warpQuadToRect,
} from "@/lib/shared/vision/perspectiveWarp";

import { normalizeRotation } from "./imageTrim";

export type Point2 = { x: number; y: number };

/** TL → TR → BR → BL in source (post-rotation) pixels. */
export type CropQuad = {
  kind: "quad";
  points: [Point2, Point2, Point2, Point2];
  imageWidth: number;
  imageHeight: number;
  rotate?: number;
  outWidth?: number;
  outHeight?: number;
};

const MAX_WARP_PIXELS = 16_000_000;

export {
  applyHomography,
  computeHomographyDestToSource,
} from "@/lib/shared/vision/perspectiveWarp";

export function defaultQuadOutputSize(
  points: readonly [Point2, Point2, Point2, Point2],
): { width: number; height: number } {
  return quadNaturalSize(points);
}

export function isCropQuad(value: unknown): value is CropQuad {
  if (!value || typeof value !== "object") return false;
  const row = value as CropQuad;
  if (row.kind !== "quad") return false;
  if (!Array.isArray(row.points) || row.points.length !== 4) return false;
  return row.points.every(
    (p) =>
      p &&
      typeof p.x === "number" &&
      typeof p.y === "number" &&
      Number.isFinite(p.x) &&
      Number.isFinite(p.y),
  );
}

export async function applyCropQuad(
  buffer: Buffer,
  quad: CropQuad,
): Promise<Buffer> {
  const rotation = normalizeRotation(quad.rotate);
  const oriented = await sharp(buffer).rotate().toBuffer();
  const framed =
    rotation === 0
      ? oriented
      : await sharp(oriented).rotate(rotation).toBuffer();

  const { data, info } = await sharp(framed)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const size = defaultQuadOutputSize(quad.points);
  const outWidth = Math.max(1, Math.round(quad.outWidth ?? size.width));
  const outHeight = Math.max(1, Math.round(quad.outHeight ?? size.height));
  if (outWidth * outHeight > MAX_WARP_PIXELS) {
    throw new Error("imageHomography: output too large");
  }

  const warped = warpQuadToRect(
    { data, width: info.width, height: info.height, channels: info.channels },
    quad.points,
    { outWidth, outHeight },
  );

  return sharp(Buffer.from(warped.data.buffer), {
    raw: { width: outWidth, height: outHeight, channels: info.channels as 4 },
  })
    .png()
    .toBuffer();
}
