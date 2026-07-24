/**
 * Contiguous IDs between two anchors in the currently visible order
 * (inclusive). Used for Shift+click multi-select on collection grids.
 */
export function itemIdsInVisibleRange(
  orderedIds: readonly string[],
  fromId: string,
  toId: string,
): string[] {
  if (fromId === toId) return [toId];

  const fromIndex = orderedIds.indexOf(fromId);
  const toIndex = orderedIds.indexOf(toId);
  if (toIndex < 0) return [];
  if (fromIndex < 0) return [toId];

  const start = Math.min(fromIndex, toIndex);
  const end = Math.max(fromIndex, toIndex);
  return orderedIds.slice(start, end + 1);
}
