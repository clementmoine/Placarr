/**
 * Pack → curated Coleka deals price ledger path(s).
 * Used by Catalogue browse as fallback when no *cards.fr pricer hits.
 *
 * Paths only — no `@/providers/<franchise>` imports (shared stays sibling-blind).
 */
import path from "node:path";

import {
  colekaPriceCentsByPrintKey,
  readColekaPriceLedger,
} from "./dealsHarvest";

export type ColekaCataloguePriceQuote = {
  priceCents: number;
};

function curatedSources(...parts: string[]): string {
  return path.join(process.cwd(), "src/providers", ...parts, "curated/sources");
}

/** Absolute ledger paths per catalogue pack id. */
export function colekaPriceLedgerPathsForPack(packId: string): string[] {
  switch (packId) {
    case "bleach/scb":
      return [path.join(curatedSources("bleach/bleachscb"), "coleka-prices.json")];
    case "naruto/carddass":
    case "naruto/en-ccg":
      return [
        path.join(
          curatedSources("naruto/narutocarddass"),
          "coleka-prices.json",
        ),
      ];
    case "naruto/ultra-challenge":
      return [
        path.join(curatedSources("naruto/narutoultra"), "coleka-prices.json"),
      ];
    case "naruto/ninja-ranks":
      return [
        path.join(curatedSources("naruto/narutoranks"), "coleka-prices.json"),
      ];
    case "dragonball/lamincards":
      return [
        path.join(
          curatedSources("dragonball/dbslamincards"),
          "coleka-prices.json",
        ),
      ];
    case "pokemon":
      return [
        path.join(
          curatedSources("pokemon/tcgdex"),
          "coleka-mcdo-prices.json",
        ),
      ];
    default:
      if (packId.startsWith("leclerc/")) {
        return [path.join(curatedSources("leclerc"), "coleka-prices.json")];
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
