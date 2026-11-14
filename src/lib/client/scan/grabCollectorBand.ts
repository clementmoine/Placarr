/**
 * Cut the collector footer of the live-detected card straight from the
 * `<video>` at native camera resolution.
 *
 * The identify thumbnail is capped at 640 px (CLIP/DINO input); a Lorcana
 * `7/204 • FR • 2` footer is ~8 px tall there and no OCR reads it. The
 * camera frame has 3–4× more pixels — this is what PP-OCR must see.
 */
import {
  collectorBandRectInRegion,
  type CollectorBandRect,
} from "@/lib/client/scan/collectorOcr";
import type { PreCroppedBand } from "@/lib/client/scan/paddleCollectorOcr.client";

export type VideoRegionLike = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type CollectorBandGrab = PreCroppedBand & { blob: Blob };

/** Band rect for a card AABB inside the frame (pure; null when unusable). */
export function collectorBandForVideo(
  region: VideoRegionLike | null | undefined,
  frame: { width: number; height: number },
): CollectorBandRect | null {
  if (!region) return null;
  return collectorBandRectInRegion(region, frame);
}

/**
 * JPEG of the native-res band. Returns null when there is no card AABB —
 * the bottom of an arbitrary frame is table, not a footer.
 */
export async function grabCollectorBandBlob(
  video: HTMLVideoElement,
  region: VideoRegionLike | null | undefined,
): Promise<CollectorBandGrab | null> {
  const width = video.videoWidth;
  const height = video.videoHeight;
  if (!width || !height) return null;
  const band = collectorBandForVideo(region, { width, height });
  if (!band) return null;

  const canvas = document.createElement("canvas");
  canvas.width = band.sw;
  canvas.height = band.sh;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(
    video,
    band.sx,
    band.sy,
    band.sw,
    band.sh,
    0,
    0,
    band.sw,
    band.sh,
  );
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), "image/jpeg", 0.92),
  );
  if (!blob) return null;
  return { blob, band, sourceWidth: width, sourceHeight: height };
}
