/**
 * Placarr printKey grouping `pN` → set code promo `PN` (Lorcast / DotGG).
 *
 * Même forme des deux côtés : `lorcana:7-24b-p2` → set `P2`, numéro `24b`.
 * Une seule implémentation — les deux providers de prix Lorcana la partagent.
 */
export function lorcanaPromoSetFromGrouping(
  grouping: string | null | undefined,
): string | null {
  if (!grouping) return null;
  const match = /^p(\d+)$/i.exec(grouping.trim());
  return match ? `P${match[1]}` : null;
}
