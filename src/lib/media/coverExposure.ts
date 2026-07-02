export type CoverExposureMetrics = {
  meanLuminance: number;
  darkPixelRatio: number;
};

/**
 * Persisted/observed metrics expose exposure stats as optional (not every probe
 * measures pixels), so the read-path helpers accept a partial shape and treat a
 * missing measurement as "no penalty".
 */
type CoverExposureInput = {
  meanLuminance?: number | null;
  darkPixelRatio?: number | null;
};

/**
 * Penalises muddy, underexposed scans where most pixels sit in deep shadow.
 * Used only as a score signal to break ties between otherwise equivalent covers
 * (same region / provenance tier) — never as a hard reject.
 * Agnostic of provider — only pixel statistics.
 */
export function exposureScoreAdjustment(metrics: CoverExposureInput): number {
  const { meanLuminance, darkPixelRatio } = metrics;
  if (meanLuminance == null || darkPixelRatio == null) return 0;

  if (meanLuminance < 95 && darkPixelRatio >= 0.4) return -360;
  if (meanLuminance < 110 && darkPixelRatio >= 0.32) return -240;
  if (meanLuminance < 125 && darkPixelRatio >= 0.48) return -160;

  return 0;
}
