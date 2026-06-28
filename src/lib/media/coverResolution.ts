/** Covers below this shortest edge look pixelated on the item detail view (~240px wide @2x). */
export const MIN_COVER_SHORTEST_EDGE = 280;

export type ImageDimensions = {
  width: number;
  height: number;
};

export function shortestImageEdge(
  metrics: ImageDimensions | null | undefined,
): number {
  if (!metrics) return 0;
  return Math.min(metrics.width, metrics.height);
}

export function isCoverResolutionAcceptable(
  metrics: ImageDimensions | null | undefined,
): boolean {
  const shortest = shortestImageEdge(metrics);
  return shortest === 0 || shortest >= MIN_COVER_SHORTEST_EDGE;
}
