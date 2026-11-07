/**
 * Trim scan gutters on Kayou portrait faces (single-face 320×450 HR/MR/BP).
 */
import {
  detectLenticularPanelCropsFromRgba,
  type LenticularPanelCrop,
} from "./kayouLenticularArt";

/** Slight zoom so thin scan borders sit outside the clip. */
export const KAYOU_SCAN_COVER_BLEED = 1.02;

export function detectKayouScanContentCrop(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  lumThreshold = 235,
): LenticularPanelCrop {
  const [crop] = detectLenticularPanelCropsFromRgba(
    rgba,
    width,
    height,
    { cols: 1, rows: 1 },
    lumThreshold,
  );
  return crop ?? { left: 0, top: 0, right: 0, bottom: 0 };
}

export function kayouScanContentAspectRatio(
  naturalWidth: number,
  naturalHeight: number,
  crop: LenticularPanelCrop,
): string {
  const w = Math.max(1, naturalWidth - crop.left - crop.right);
  const h = Math.max(1, naturalHeight - crop.top - crop.bottom);
  return `${Math.round(w)} / ${Math.round(h)}`;
}
