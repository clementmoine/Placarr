/**
 * Pack → synced Coleka deals price ledger under `data/<pack>/`.
 * Used by Catalogue browse as fallback when no *cards.fr pricer hits.
 *
 * Paths only — no `@/providers/<franchise>` imports (shared stays sibling-blind).
 */
import {
  packColekaMcdoPricesPath,
  packColekaPricesPath,
} from "@/lib/packPaths";

import {
  colekaPriceCentsByPrintKey,
  readColekaPriceLedger,
} from "./dealsHarvest";

export type ColekaCataloguePriceQuote = {
  priceCents: number;
};

/** Absolute ledger paths per catalogue pack id (synced under `data/`). */
export function colekaPriceLedgerPathsForPack(packId: string): string[] {
  switch (packId) {
    case "bleach/scb":
      return [packColekaPricesPath("bleach/scb")];
    case "naruto/carddass":
    case "naruto/en-ccg":
      return [packColekaPricesPath("naruto/carddass")];
    case "naruto/ultra-challenge":
      return [packColekaPricesPath("naruto/ultra-challenge")];
    case "naruto/ninja-ranks":
      return [packColekaPricesPath("naruto/ninja-ranks")];
    case "dragonball/lamincards":
      return [packColekaPricesPath("dragonball/lamincards")];
    case "pokemon":
      return [packColekaMcdoPricesPath()];
    default:
      if (packId.startsWith("leclerc/")) {
        // One family-wide deals dump for all E.Leclerc ops lines.
        return [packColekaPricesPath("leclerc")];
      }
      return [];
  }
}

export function catalogueColekaPriceQuoteByPrintKey(
  packId: string,
): Map<string, ColekaCataloguePriceQuote> {
  const out = new Map<string, ColekaCataloguePriceQuote>();
  for (const file of colekaPriceLedgerPathsForPack(packId)) {
    const cents = colekaPriceCentsByPrintKey(readColekaPriceLedger(file));
    for (const [pk, priceCents] of cents) {
      if (!out.has(pk)) out.set(pk, { priceCents });
    }
  }
  return out;
}
