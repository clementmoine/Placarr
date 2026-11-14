/**
 * Placarr printKey grouping → market promo set code (Lorcast / DotGG).
 *
 * - `pN` → `PN` (league / set promos)
 * - letter sets encoded as grouping (`pd1`, `d23`, `cc1`, `dis`) → uppercased
 *   (`PD1`, `D23`, `CC1`, `DIS`) — same codes on both market APIs
 *
 * Without this, `lorcana:11-1-pd1` would look up main-set `011|1` and take the
 * wrong Cardmarket price.
 */
export function lorcanaPromoSetFromGrouping(
  grouping: string | null | undefined,
): string | null {
  const trimmed = grouping?.trim();
  if (!trimmed) return null;
  return trimmed.toUpperCase();
}
