/** Covers below this shortest edge look pixelated on the item detail view (~240px wide @2x). */
export const MIN_COVER_SHORTEST_EDGE = 280;

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

export function isCoverResolutionAcceptable(
  metrics: PartialImageDimensions | null | undefined,
): boolean {
  const shortest = shortestImageEdge(metrics);
  return shortest === 0 || shortest >= MIN_COVER_SHORTEST_EDGE;
}
