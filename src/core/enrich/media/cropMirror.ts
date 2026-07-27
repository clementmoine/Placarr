import type { CropBox } from "./imageTrim";

/**
 * The same framing, expressed as shares of the image rather than pixels, so it
 * can be replayed on a different rendering of the same picture.
 */
export type CropFractions = {
  left: number;
  top: number;
  width: number;
  height: number;
};

/** Where a stored rectangle sits within its own image, as fractions of it. */
export function cropFractionsOf(box: CropBox): CropFractions | null {
  if (!(box.imageWidth > 0) || !(box.imageHeight > 0)) return null;
  if (!(box.width > 0) || !(box.height > 0)) return null;
  return {
    left: box.left / box.imageWidth,
    top: box.top / box.imageHeight,
    width: box.width / box.imageWidth,
    height: box.height / box.imageHeight,
  };
}

/**
 * Replay a crop taken from one image onto another of the same subject.
 *
 * A foil mask covers the whole card, so cropping the artwork alone left the two
 * with different shapes and `object-contain` could no longer line them up — the
 * shimmer landed off the foil areas. Applying the same *relative* rectangle to
 * the mask restores a shared aspect ratio, and the existing letterboxing does
 * the rest.
 *
 * The result is clamped to stay inside the target: fractions are exact, pixels
 * are rounded, and one rounded pixel past the edge makes `sharp` throw.
 */
export function mirrorCropBox(
  fractions: CropFractions,
  targetWidth: number,
  targetHeight: number,
): CropBox | null {
  if (!(targetWidth > 0) || !(targetHeight > 0)) return null;

  const left = Math.min(
    Math.max(0, Math.round(fractions.left * targetWidth)),
    targetWidth - 1,
  );
  const top = Math.min(
    Math.max(0, Math.round(fractions.top * targetHeight)),
    targetHeight - 1,
  );
  const width = Math.min(
    Math.max(1, Math.round(fractions.width * targetWidth)),
    targetWidth - left,
  );
  const height = Math.min(
    Math.max(1, Math.round(fractions.height * targetHeight)),
    targetHeight - top,
  );

  return {
    left,
    top,
    width,
    height,
    imageWidth: targetWidth,
    imageHeight: targetHeight,
  };
}

/**
 * Short, stable tag for a framing.
 *
 * It goes in the derivative's filename so that re-cropping produces a different
 * file rather than overwriting one the browser has already cached, and so two
 * copies of the same card cropped differently never collide on one mask. Purely
 * alphabetic, so the crop-suffix grammar in `coverUrl` keeps holding.
 */
export function cropFractionsTag(fractions: CropFractions): string {
  const parts = [
    fractions.left,
    fractions.top,
    fractions.width,
    fractions.height,
  ];
  // Four decimals is finer than a single pixel on any image this app handles,
  // and keeps the tag short enough to read in a filename.
  let hash = 0;
  for (const part of parts) {
    hash = (hash * 31 + Math.round(part * 10000)) >>> 0;
  }
  // base-26 letters: digits would fall outside the `[a-z]+` marker grammar.
  let tag = "";
  let rest = hash;
  do {
    tag = String.fromCharCode(97 + (rest % 26)) + tag;
    rest = Math.floor(rest / 26);
  } while (rest > 0);
  return tag;
}
