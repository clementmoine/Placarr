/**
 * Pinch + wheel → camera zoom without on-screen slider (Lens-style).
 * When the track has no native zoom (common on iOS Safari), callers apply
 * the same factor as CSS `transform: scale(...)` on the video (digital zoom).
 */

/** Digital zoom range when MediaStreamTrack zoom is unavailable. */
export const DIGITAL_ZOOM_MIN = 1;
export const DIGITAL_ZOOM_MAX = 4;
export const DIGITAL_ZOOM_STEP = 0.1;

export function touchDistance(
  a: { clientX: number; clientY: number },
  b: { clientX: number; clientY: number },
): number {
  const dx = a.clientX - b.clientX;
  const dy = a.clientY - b.clientY;
  return Math.hypot(dx, dy);
}

export function nextZoomFromWheel(
  current: number,
  deltaY: number,
  opts: { min: number; max: number; step: number },
): number {
  const dir = deltaY < 0 ? 1 : -1;
  const step = Math.max(opts.step || 0.1, 0.05) * 2;
  return Math.min(opts.max, Math.max(opts.min, current + dir * step));
}

export function nextZoomFromPinch(
  startZoom: number,
  startDistance: number,
  currentDistance: number,
  opts: { min: number; max: number },
): number {
  if (startDistance <= 0) return startZoom;
  const ratio = currentDistance / startDistance;
  return Math.min(opts.max, Math.max(opts.min, startZoom * ratio));
}

/** Prefer hardware zoom range; otherwise digital CSS zoom caps. */
export function resolveZoomRange(caps: {
  zoom: boolean;
  zoomMin: number;
  zoomMax: number;
  zoomStep: number;
}): { min: number; max: number; step: number; mode: "native" | "digital" } {
  if (caps.zoom && caps.zoomMax > caps.zoomMin) {
    return {
      min: caps.zoomMin,
      max: caps.zoomMax,
      step: caps.zoomStep || DIGITAL_ZOOM_STEP,
      mode: "native",
    };
  }
  return {
    min: DIGITAL_ZOOM_MIN,
    max: DIGITAL_ZOOM_MAX,
    step: DIGITAL_ZOOM_STEP,
    mode: "digital",
  };
}
