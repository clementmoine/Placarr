export type CoverExposureMetrics = {
  meanLuminance: number;
  darkPixelRatio: number;
};

/**
 * Penalises muddy, underexposed scans where most pixels sit in deep shadow.
 * Agnostic of provider — only pixel statistics.
 */
export function exposureScoreAdjustment(
  metrics: Pick<CoverExposureMetrics, "meanLuminance" | "darkPixelRatio">,
): number {
  const { meanLuminance, darkPixelRatio } = metrics;

  if (meanLuminance < 95 && darkPixelRatio >= 0.4) return -360;
  if (meanLuminance < 110 && darkPixelRatio >= 0.32) return -240;
  if (meanLuminance < 125 && darkPixelRatio >= 0.48) return -160;

  return 0;
}

export function isUnderexposedCoverScan(
  metrics:
    | Pick<CoverExposureMetrics, "meanLuminance" | "darkPixelRatio">
    | null
    | undefined,
): boolean {
  if (
    metrics?.meanLuminance == null ||
    metrics.darkPixelRatio == null
  ) {
    return false;
  }

  return exposureScoreAdjustment(metrics) <= -240;
}
