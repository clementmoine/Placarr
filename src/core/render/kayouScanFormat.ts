/** narutocards.ca Kayou portrait scan size (single face or lenticular strip). */
export const KAYOU_PORTRAIT_STRIP_W = 320;
export const KAYOU_PORTRAIT_STRIP_H = 450;
const STRIP_ASPECT = KAYOU_PORTRAIT_STRIP_W / KAYOU_PORTRAIT_STRIP_H;

/** Portrait 320×450 (or CDN scale with the same aspect). */
export function kayouScanIsPortraitStrip(width: number, height: number): boolean {
  if (!(width > 0 && height > 0) || width >= height) return false;
  return Math.abs(width / height - STRIP_ASPECT) < 0.04;
}

/** True for full-size 320×450 strips (and CDN scale). Smaller same-aspect scans still probe via seams. */
export function kayouScanIsAttestedLenticularStrip(
  width: number,
  height: number,
): boolean {
  if (!kayouScanIsPortraitStrip(width, height)) return false;
  return width >= 300 && height >= 420;
}
