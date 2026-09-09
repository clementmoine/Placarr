/**
 * Map Placarr Lorcana printKeys onto DotGG (lorcana.gg) setId + collector number.
 *
 * Main sets are zero-padded to 3 digits (`1` → `001`). Promo groupings
 * (`-p3`) become the DotGG set (`P3`) with the collector number alone —
 * same shape as Lorcast's promo path.
 */
import { parsePrintKey } from "@/core/identify/printKey";
import { lorcanaPromoSetFromGrouping } from "@/providers/shared/lorcanaPromoSet";

const LORCANA_GAME = "lorcana";

export type DotggLookup = {
  setId: string;
  number: string;
};

/** Index key for a DotGG card row. */
export function dotggIndexKey(setId: string, number: string): string {
  return `${setId.trim().toUpperCase()}|${number.trim().toLowerCase()}`;
}

/**
 * Pad a numeric main-set code to DotGG's 3-digit form. Alphanumeric specials
 * (Q1, C1, D23) pass through uppercased.
 */
export function padDotggMainSetId(set: string): string {
  const trimmed = set.trim();
  if (/^\d+$/.test(trimmed)) {
    return trimmed.padStart(3, "0");
  }
  return trimmed.toUpperCase();
}

/** Alias historique — même fonction que `lorcanaPromoSetFromGrouping`. */
export const dotggPromoSetFromGrouping = lorcanaPromoSetFromGrouping;

export function dotggLookupFromPrintKey(
  printKey: string | null | undefined,
): DotggLookup | null {
  const identity = parsePrintKey(printKey);
  if (!identity || identity.game !== LORCANA_GAME) return null;

  const promoSet = lorcanaPromoSetFromGrouping(identity.grouping);
  if (promoSet) {
    return { setId: promoSet, number: identity.number };
  }

  return {
    setId: padDotggMainSetId(identity.set),
    number: identity.number,
  };
}
