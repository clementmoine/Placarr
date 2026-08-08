import sharp from "sharp";

const UPLOAD_WEBP_QUALITY = 88;

/** WebP cannot address a side longer than this. A format limit, not a choice. */
export const WEBP_MAX_SIDE = 16383;

/**
 * What a *fetched* image is allowed to keep.
 *
 * Nothing this app renders asks for more: the largest surface is a fullscreen
 * cover, and `/uploads/` bypasses the Next optimizer, so whatever lands here is
 * what the browser downloads and decodes. Provider art that ignored this —
 * SteamGridDB clear logos at 31980×14135 — meant 5.6 MB on the wire and ~1.8 GB
 * of decoded pixels for a mark drawn a few hundred pixels wide.
 *
 * Deliberately not applied to what the collector uploads themselves: reducing
 * someone's own 6000px scan is their call, not ours.
 */
export const FETCHED_IMAGE_MAX_SIDE = 4096;

function animatedFromMeta(pages: number | undefined): boolean {
  return (pages ?? 1) > 1;
}

/** Encode any sharp-readable raster as lossless WebP (pixel-exact — foil dumps). */
export async function toLosslessWebp(buffer: Buffer): Promise<Buffer> {
  const meta = await sharp(buffer, {
    animated: true,
    limitInputPixels: false,
  }).metadata();
  return sharp(buffer, {
    animated: animatedFromMeta(meta.pages),
    limitInputPixels: false,
  })
    .rotate()
    .webp({ lossless: true, effort: 6 })
    .toBuffer();
}

/**
 * User uploads store — lossy WebP q88 (covers / photos). Negligible quality
 * delta vs source JPEG/PNG for this use; much smaller than lossless.
 *
 * `maxSide` bounds the longest side. Callers holding something they fetched
 * pass {@link FETCHED_IMAGE_MAX_SIDE}; callers holding what a collector handed
 * us pass {@link WEBP_MAX_SIDE}, which only steps in where the format would
 * otherwise refuse the image outright.
 */
export async function toUploadWebp(
  buffer: Buffer,
  options: { maxSide?: number } = {},
): Promise<Buffer> {
  const meta = await sharp(buffer, {
    animated: true,
    limitInputPixels: false,
  }).metadata();
  const pipeline = sharp(buffer, {
    animated: animatedFromMeta(meta.pages),
    limitInputPixels: false,
  }).rotate();

  // Measured after `rotate()`: EXIF orientation can swap the axes, and it is
  // the post-rotate side that has to fit.
  const maxSide = Math.min(options.maxSide ?? WEBP_MAX_SIDE, WEBP_MAX_SIDE);
  const rotated = await pipeline.metadata();
  if (Math.max(rotated.width ?? 0, rotated.height ?? 0) > maxSide) {
    pipeline.resize({
      width: maxSide,
      height: maxSide,
      fit: "inside",
      withoutEnlargement: true,
    });
  }

  return pipeline.webp({ quality: UPLOAD_WEBP_QUALITY, effort: 4 }).toBuffer();
}

export { UPLOAD_WEBP_QUALITY };
