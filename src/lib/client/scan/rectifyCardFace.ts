/**
 * Rectified card face from the live quad — what identify and OCR should see.
 *
 * An axis-aligned crop of a tilted card hands the embed a lozenge of table
 * plus neighbours and hands OCR a slanted footer: both miss. Warping the 4
 * detected corners to an upright rectangle (pure-JS homography, same code as
 * the server crop) makes the art band and the collector band land where the
 * catalogue expects them, whatever the tilt.
 */
import {
  collectorBandRect,
  type CollectorBandRect,
} from "@/lib/client/scan/collectorOcr";
import type { CollectorBandGrab } from "@/lib/client/scan/grabCollectorBand";
import {
  quadNaturalSize,
  uprightPortraitQuad,
  warpQuadToRect,
  type WarpPoint,
  type WarpQuad,
} from "@/lib/shared/vision/perspectiveWarp";

/** Long edge of the identify face (DINOv2 sees 224; headroom for dHash). */
export const RECTIFIED_FACE_MAX_EDGE = 640;
/** Native-resolution band width cap — PP-OCR target is 1600 px. */
export const RECTIFIED_BAND_MAX_WIDTH = 1600;
/** Source padding around the quad AABB so bilinear taps never hit the edge. */
const SOURCE_PAD_FRAC = 0.03;

export type RectifiedFace = {
  blob: Blob;
  width: number;
  height: number;
  /** Upright TL→TR→BR→BL corners actually warped, in video pixels. */
  quad: WarpQuad;
};

function sideLen(a: WarpPoint, b: WarpPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function quadArea(q: WarpQuad): number {
  let sum = 0;
  for (let i = 0; i < 4; i++) {
    const a = q[i]!;
    const b = q[(i + 1) % 4]!;
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

/**
 * Only rectify quads that look like one card: portrait-ish side ratio once
 * upright, convex, a sane share of the frame, not a sliver. Anything else
 * falls back to the AABB / full-frame path (server dewarp still runs there).
 */
export function quadSafeForIdentifyCrop(
  corners: WarpQuad | null | undefined,
  videoW: number,
  videoH: number,
): WarpQuad | null {
  if (!corners || corners.length !== 4 || !videoW || !videoH) return null;
  if (!corners.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))) {
    return null;
  }
  const q = uprightPortraitQuad(corners);
  const [tl, tr, br, bl] = q;
  const top = sideLen(tl, tr);
  const bottom = sideLen(bl, br);
  const left = sideLen(tl, bl);
  const right = sideLen(tr, br);
  if (Math.min(top, bottom, left, right) < 48) return null;
  // Opposite sides within 35 % of each other — rules out triangles/wedges.
  if (Math.min(top, bottom) / Math.max(top, bottom) < 0.65) return null;
  if (Math.min(left, right) / Math.max(left, right) < 0.65) return null;
  const ratio = (top + bottom) / (left + right);
  if (ratio < 0.55 || ratio > 0.9) return null;
  const frac = quadArea(q) / (videoW * videoH);
  if (frac < 0.06 || frac > 0.85) return null;
  // Convex: all cross products share a sign.
  let pos = 0;
  let neg = 0;
  for (let i = 0; i < 4; i++) {
    const a = q[i]!;
    const b = q[(i + 1) % 4]!;
    const c = q[(i + 2) % 4]!;
    const cr = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (cr > 0) pos += 1;
    else if (cr < 0) neg += 1;
  }
  if (pos && neg) return null;
  return q;
}

type SourcePatch = {
  data: Uint8ClampedArray;
  width: number;
  height: number;
  /** Quad translated into patch coordinates. */
  quad: WarpQuad;
};

/** Native-resolution patch around the quad (AABB + pad) from the video. */
function readSourcePatch(
  video: HTMLVideoElement,
  quad: WarpQuad,
): SourcePatch | null {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) return null;
  const xs = quad.map((p) => p.x);
  const ys = quad.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const padX = (maxX - minX) * SOURCE_PAD_FRAC;
  const padY = (maxY - minY) * SOURCE_PAD_FRAC;
  const sx = Math.max(0, Math.floor(minX - padX));
  const sy = Math.max(0, Math.floor(minY - padY));
  const ex = Math.min(vw, Math.ceil(maxX + padX));
  const ey = Math.min(vh, Math.ceil(maxY + padY));
  const sw = ex - sx;
  const sh = ey - sy;
  if (sw < 32 || sh < 32) return null;

  const canvas = document.createElement("canvas");
  canvas.width = sw;
  canvas.height = sh;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, sw, sh);
  const image = ctx.getImageData(0, 0, sw, sh);
  return {
    data: image.data,
    width: sw,
    height: sh,
    quad: quad.map((p) => ({
      x: p.x - sx,
      y: p.y - sy,
    })) as unknown as WarpQuad,
  };
}

function toJpeg(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  columns?: { start: number; width: number },
): Promise<Blob | null> {
  const canvas = document.createElement("canvas");
  canvas.width = columns?.width ?? width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.resolve(null);
  const image = new ImageData(new Uint8ClampedArray(data), width, height);
  ctx.putImageData(image, -(columns?.start ?? 0), 0);
  return new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), "image/jpeg", 0.92),
  );
}

/** Output size for the identify face: natural aspect, long edge ≤ 640. */
export function rectifiedFaceSize(quad: WarpQuad): {
  width: number;
  height: number;
} {
  const natural = quadNaturalSize(quad);
  const scale = Math.min(
    1,
    RECTIFIED_FACE_MAX_EDGE / Math.max(natural.width, natural.height),
  );
  return {
    width: Math.max(1, Math.round(natural.width * scale)),
    height: Math.max(1, Math.round(natural.height * scale)),
  };
}

/** Rectified footer geometry in face pixels (native width, capped). */
export function rectifiedBandGeometry(quad: WarpQuad): {
  faceWidth: number;
  faceHeight: number;
  band: CollectorBandRect;
} {
  const natural = quadNaturalSize(quad);
  const scale = Math.min(1, RECTIFIED_BAND_MAX_WIDTH / natural.width);
  const faceWidth = Math.max(1, Math.round(natural.width * scale));
  const faceHeight = Math.max(1, Math.round(natural.height * scale));
  return {
    faceWidth,
    faceHeight,
    band: collectorBandRect(faceWidth, faceHeight),
  };
}

export type RectifiedSample = {
  face: RectifiedFace;
  /** Native-resolution footer, in rectified-face pixel space. */
  band: CollectorBandGrab;
};

/**
 * One native-resolution read of the video, two warps: the identify face
 * (long edge ≤ 640) and the collector band (only the footer rows, at native
 * width). Null when the quad is not a plausible single card.
 */
export async function grabRectifiedSample(
  video: HTMLVideoElement,
  corners: WarpQuad,
): Promise<RectifiedSample | null> {
  const quad = quadSafeForIdentifyCrop(
    corners,
    video.videoWidth,
    video.videoHeight,
  );
  if (!quad) return null;
  const patch = readSourcePatch(video, quad);
  if (!patch) return null;
  const src = { ...patch, channels: 4 };

  const size = rectifiedFaceSize(quad);
  const faceWarp = warpQuadToRect(src, patch.quad, {
    outWidth: size.width,
    outHeight: size.height,
  });
  const { faceWidth, faceHeight, band } = rectifiedBandGeometry(quad);
  const bandWarp = warpQuadToRect(src, patch.quad, {
    outWidth: faceWidth,
    outHeight: faceHeight,
    rows: { start: band.sy, end: band.sy + band.sh },
  });

  const [faceBlob, bandBlob] = await Promise.all([
    toJpeg(faceWarp.data, faceWarp.width, faceWarp.height),
    toJpeg(bandWarp.data, bandWarp.width, bandWarp.height, {
      start: band.sx,
      width: band.sw,
    }),
  ]);
  if (!faceBlob || !bandBlob) return null;
  return {
    face: {
      blob: faceBlob,
      width: faceWarp.width,
      height: faceWarp.height,
      quad,
    },
    band: {
      blob: bandBlob,
      band: { ...band, sh: bandWarp.height },
      sourceWidth: faceWidth,
      sourceHeight: faceHeight,
    },
  };
}
