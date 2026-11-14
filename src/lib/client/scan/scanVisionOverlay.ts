/**
 * Normalized overlay geometry for live scan vision (what the algos look at).
 * Coords are 0..1 relative to the video *element* box unless noted.
 */

export type ScanVisionTone =
  | "guide"
  | "ocr"
  | "live"
  | "barcode"
  | "hit"
  | "roi"
  | "quad";

export type ScanVisionRect = {
  id: string;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  tone: ScanVisionTone;
};

/** OCR (or other) text anchored on the object at its detected box. */
export type ScanVisionText = {
  id: string;
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
};

/** Matches ScanOverlay card guide: 78% width, 63/88 aspect (CSS). */
export const CARD_GUIDE_WIDTH_FRAC = 0.78;
export const CARD_FACE_RATIO = 63 / 88;

/** Bottom collector band as fractions of the card box (matches collectorBandRect). */
export const OCR_BAND_INSET_X = 0.04;
export const OCR_BAND_HEIGHT = 0.12;

/** Server live AABB fallback — cover ~0.9 of max card-aspect (CSS approx). */
export const CARD_LIVE_WIDTH_FRAC = 0.9;

export function ocrBandWithinCard(): {
  left: string;
  right: string;
  height: string;
  bottom: string;
} {
  return {
    left: `${OCR_BAND_INSET_X * 100}%`,
    right: `${OCR_BAND_INSET_X * 100}%`,
    height: `${OCR_BAND_HEIGHT * 100}%`,
    bottom: "0%",
  };
}

/** Bottom collector band inside a normalized card rect. */
export function ocrBandNorm(card: {
  x: number;
  y: number;
  w: number;
  h: number;
}): { x: number; y: number; w: number; h: number } {
  const insetX = card.w * OCR_BAND_INSET_X;
  const sh = Math.max(card.h * OCR_BAND_HEIGHT, 0.02);
  return {
    x: card.x + insetX,
    y: card.y + card.h - sh,
    w: Math.max(0.01, card.w - insetX * 2),
    h: sh,
  };
}

type VideoBox = {
  videoWidth: number;
  videoHeight: number;
  clientWidth: number;
  clientHeight: number;
};

function objectCoverTransform(video: VideoBox): {
  scale: number;
  offsetX: number;
  offsetY: number;
  ew: number;
  eh: number;
} | null {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  const ew = video.clientWidth;
  const eh = video.clientHeight;
  if (!vw || !vh || !ew || !eh) return null;
  const scale = Math.max(ew / vw, eh / vh);
  return {
    scale,
    offsetX: (ew - vw * scale) / 2,
    offsetY: (eh - vh * scale) / 2,
    ew,
    eh,
  };
}

/** Map a video-pixel point → element-normalized 0..1 under object-cover. */
export function mapVideoPointToObjectCover(
  video: VideoBox,
  point: { x: number; y: number },
): { x: number; y: number } | null {
  const t = objectCoverTransform(video);
  if (!t) return null;
  return {
    x: (point.x * t.scale + t.offsetX) / t.ew,
    y: (point.y * t.scale + t.offsetY) / t.eh,
  };
}

/**
 * Map a rect in video pixel space → normalized 0..1 of the element box
 * under CSS object-cover (centered crop).
 */
export function mapVideoRectToObjectCover(
  video: VideoBox,
  rect: { x: number; y: number; width: number; height: number },
): { x: number; y: number; w: number; h: number } | null {
  const t = objectCoverTransform(video);
  if (!t) return null;
  return {
    x: (rect.x * t.scale + t.offsetX) / t.ew,
    y: (rect.y * t.scale + t.offsetY) / t.eh,
    w: (rect.width * t.scale) / t.ew,
    h: (rect.height * t.scale) / t.eh,
  };
}

/** Map TL→TR→BR→BL corners in video pixels → element-normalized. */
export function mapVideoCornersToObjectCover(
  video: VideoBox,
  corners: Array<{ x: number; y: number }>,
): Array<{ x: number; y: number }> | null {
  if (corners.length !== 4) return null;
  const out: Array<{ x: number; y: number }> = [];
  for (const c of corners) {
    const p = mapVideoPointToObjectCover(video, c);
    if (!p) return null;
    out.push(p);
  }
  return out;
}

/**
 * Map ROI-local corners (pixels in the center card sample) → element-normalized
 * points, assuming the ROI matches the 78% card guide in video space and
 * object-cover on the element.
 */
export function mapRoiCornersToObjectCover(
  video: {
    videoWidth: number;
    videoHeight: number;
    clientWidth: number;
    clientHeight: number;
  },
  corners: Array<{ x: number; y: number }>,
  roiSize: number,
): Array<{ x: number; y: number }> | null {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh || roiSize <= 0 || corners.length !== 4) return null;
  const guideW = vw * CARD_GUIDE_WIDTH_FRAC;
  const guideH = guideW / CARD_FACE_RATIO;
  const left = (vw - guideW) / 2;
  const top = (vh - guideH) / 2;
  const mapped: Array<{ x: number; y: number }> = [];
  for (const c of corners) {
    const vx = left + (c.x / roiSize) * guideW;
    const vy = top + (c.y / roiSize) * guideH;
    const r = mapVideoRectToObjectCover(video, {
      x: vx,
      y: vy,
      width: 0,
      height: 0,
    });
    if (!r) return null;
    mapped.push({ x: r.x, y: r.y });
  }
  return mapped;
}

export const VISION_TONE_STROKE: Record<ScanVisionTone, string> = {
  guide: "rgba(255,255,255,0.85)",
  ocr: "rgba(251,191,36,0.95)",
  live: "rgba(56,189,248,0.8)",
  barcode: "rgba(167,139,250,0.95)",
  hit: "rgba(52,211,153,0.95)",
  roi: "rgba(163,230,53,0.85)",
  quad: "rgba(251,191,36,0.95)",
};

export const VISION_TONE_FILL: Record<ScanVisionTone, string> = {
  guide: "rgba(255,255,255,0.08)",
  ocr: "rgba(251,191,36,0.12)",
  live: "rgba(56,189,248,0.08)",
  barcode: "rgba(167,139,250,0.15)",
  hit: "rgba(52,211,153,0.12)",
  roi: "rgba(163,230,53,0.1)",
  quad: "rgba(251,191,36,0.12)",
};
