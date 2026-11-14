/**
 * Torch / zoom / continuous autofocus helpers for a live MediaStream track.
 */

export type CameraCapabilitiesSummary = {
  torch: boolean;
  zoom: boolean;
  zoomMin: number;
  zoomMax: number;
  zoomStep: number;
  focusMode: boolean;
};

type TrackCapabilities = {
  torch?: boolean;
  zoom?: { min: number; max: number; step: number };
  focusMode?: string[];
};

type TrackConstraintsPatch = {
  advanced?: Array<Record<string, unknown>>;
  torch?: boolean;
  zoom?: number;
  focusMode?: string;
};

function asCaps(track: MediaStreamTrack): TrackCapabilities {
  const caps =
    typeof track.getCapabilities === "function"
      ? (track.getCapabilities() as TrackCapabilities)
      : {};
  return caps ?? {};
}

export function summarizeCameraCapabilities(
  track: MediaStreamTrack | null,
): CameraCapabilitiesSummary {
  if (!track) {
    return {
      torch: false,
      zoom: false,
      zoomMin: 1,
      zoomMax: 1,
      zoomStep: 0.1,
      focusMode: false,
    };
  }
  const caps = asCaps(track);
  const zoom = caps.zoom;
  return {
    torch: Boolean(caps.torch),
    zoom: Boolean(zoom && zoom.max > zoom.min),
    zoomMin: zoom?.min ?? 1,
    zoomMax: zoom?.max ?? 1,
    zoomStep: zoom?.step ?? 0.1,
    focusMode: Array.isArray(caps.focusMode)
      ? caps.focusMode.includes("continuous")
      : false,
  };
}

export async function applyTorch(
  track: MediaStreamTrack,
  on: boolean,
): Promise<boolean> {
  try {
    const patch: TrackConstraintsPatch = {
      advanced: [{ torch: on }],
    };
    await track.applyConstraints(patch as MediaTrackConstraints);
    return true;
  } catch {
    try {
      await track.applyConstraints({ torch: on } as MediaTrackConstraints);
      return true;
    } catch {
      return false;
    }
  }
}

export async function applyZoom(
  track: MediaStreamTrack,
  zoom: number,
): Promise<boolean> {
  const caps = summarizeCameraCapabilities(track);
  if (!caps.zoom) return false;
  const clamped = Math.min(caps.zoomMax, Math.max(caps.zoomMin, zoom));
  try {
    await track.applyConstraints({
      advanced: [{ zoom: clamped }],
    } as unknown as MediaTrackConstraints);
    return true;
  } catch {
    try {
      await track.applyConstraints({
        advanced: [{ zoom: clamped }],
      } as unknown as MediaTrackConstraints);
      return true;
    } catch {
      return false;
    }
  }
}

/** Prefer continuous AF once the stream is live (html5-qrcode pattern). */
export async function applyContinuousFocus(
  track: MediaStreamTrack,
): Promise<boolean> {
  const caps = summarizeCameraCapabilities(track);
  if (!caps.focusMode) return false;
  try {
    await track.applyConstraints({
      advanced: [{ focusMode: "continuous" }],
    } as unknown as MediaTrackConstraints);
    return true;
  } catch {
    return false;
  }
}

export function getVideoTrack(
  stream: MediaStream | null,
): MediaStreamTrack | null {
  return stream?.getVideoTracks()?.[0] ?? null;
}
