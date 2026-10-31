/**
 * Debug HUD metrics for the unified scanner (localStorage flag).
 */

import type {
  ScanVisionRect,
  ScanVisionText,
} from "@/lib/client/scan/scanVisionOverlay";

export const SCAN_DEBUG_FLAG = "placarr.scan.debug";
export const SCAN_DOCALIGNER_FLAG = "placarr.scan.docaligner";

export type ScanDebugSnapshot = {
  phase: "looking" | "understanding" | "delivering";
  fps: number;
  gateHint: string;
  blurVariance: number;
  meanLuminance: number;
  glareFraction: number;
  margin: number;
  runWeight: number;
  aimToLockMs: number | null;
  method: string;
  confidence: string;
  quadSource: "none" | "aabb" | "classical" | "onnx";
  /** What identify actually saw: perspective-rectified quad or an AABB crop. */
  faceCrop: "none" | "rectified" | "aabb";
  /** Rolling mean identify round-trip (ms) — pacing info, never a mode. */
  meanIdentifyMs: number;
  idleBackoff: boolean;
  /** Last client OCR snippet (joined). */
  ocrPreview: string;
  /** Dynamic vision rects (barcode / OCR band) in element-normalized 0..1. */
  overlays: ScanVisionRect[];
  /** Recognized words drawn at their detected locations (element 0..1). */
  texts: ScanVisionText[];
  /** Nearest CLIP / dHash distances from last identify (even on miss). */
  bestEmbedDistance: number | null;
  bestDhashDistance: number | null;
  bestEmbedKey: string;
};

const EMPTY: ScanDebugSnapshot = {
  phase: "looking",
  fps: 0,
  gateHint: "ok",
  blurVariance: 0,
  meanLuminance: 0,
  glareFraction: 0,
  margin: 0,
  runWeight: 0,
  aimToLockMs: null,
  method: "",
  confidence: "",
  quadSource: "none",
  faceCrop: "none",
  meanIdentifyMs: 0,
  idleBackoff: false,
  ocrPreview: "",
  overlays: [],
  texts: [],
  bestEmbedDistance: null,
  bestDhashDistance: null,
  bestEmbedKey: "",
};

let snapshot: ScanDebugSnapshot = { ...EMPTY };
const listeners = new Set<() => void>();

export function isScanDebugEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(SCAN_DEBUG_FLAG) === "1";
  } catch {
    return false;
  }
}

export function setScanDebugEnabled(on: boolean): void {
  if (typeof window === "undefined") return;
  try {
    if (on) window.localStorage.setItem(SCAN_DEBUG_FLAG, "1");
    else window.localStorage.removeItem(SCAN_DEBUG_FLAG);
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}

/**
 * DocAligner ONNX corners — on by default when the model is hosted.
 * Opt out with `localStorage.placarr.scan.docaligner=0`.
 * Legacy opt-in `=1` still means on.
 */
export function isDocAlignerEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = window.localStorage.getItem(SCAN_DOCALIGNER_FLAG);
    if (raw === "0" || raw === "false" || raw === "off") return false;
    return true;
  } catch {
    return true;
  }
}

export function getScanDebugSnapshot(): ScanDebugSnapshot {
  return snapshot;
}

export function patchScanDebug(partial: Partial<ScanDebugSnapshot>): void {
  snapshot = { ...snapshot, ...partial };
  listeners.forEach((l) => l());
}

export function resetScanDebug(): void {
  snapshot = { ...EMPTY };
  listeners.forEach((l) => l());
}

export function subscribeScanDebug(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
