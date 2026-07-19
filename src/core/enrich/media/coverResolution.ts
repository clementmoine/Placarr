export type ImageDimensions = {
  width: number;
  height: number;
};

/**
 * Persisted/observed metrics expose dimensions as optional (a probe may not have
 * measured them yet), so the read-path helpers accept a partial shape.
 */
type PartialImageDimensions = {
  width?: number | null;
  height?: number | null;
};

export function shortestImageEdge(
  metrics: PartialImageDimensions | null | undefined,
): number {
  if (metrics?.width == null || metrics.height == null) return 0;
  return Math.min(metrics.width, metrics.height);
}

/**
 * Any measured (or unknown) cover is acceptable — catalog thumbs like BDovore
 * (~180px) must not be rejected by a hard pixel floor.
 */
export function isCoverResolutionAcceptable(
  _metrics?: PartialImageDimensions | null,
): boolean {
  return true;
}

/** CDN paths like Booknode `/full/*.jpg` should not be satisfied by tiny fallbacks. */
export function coverUrlExpectsHighResolution(url: string): boolean {
  if (!url.startsWith("http")) return false;
  return /\/full\/[^/?#]+\.jpe?g(?:[?#]|$)/i.test(url);
}
