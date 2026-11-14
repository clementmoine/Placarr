/**
 * Suruga-ya used yen → curated ledger for Naruto 疾風伝 (忍伝 / 術伝 / 作伝…).
 */
import { parsePrintKey } from "@/core/identify/printKey";
import type { PriceOfferInput } from "@/core/enrich/evidence";
import type { BarcodePriceRefreshContext } from "@/types/providerModule";

import {
  harvestSurugaYenPrices,
  refreshSurugaYenPriceOffersFromLedger,
  surugaPriceLedgerPathForProvider,
  type SurugaPriceLedger,
  type SurugaYenListing,
} from "@/providers/naruto/shared/surugaYenPrices";

import { NARUTO_SHIPPUDEN_PACK_ID } from "../indexStore";
import {
  loadSurugaShippudenCuratedListings,
  surugaShippudenProductUrl,
  type SurugaShippudenListing,
} from "../parse/suruga";
import { diskIdFromPrintedReference } from "../search";

export function surugaShippudenPriceLedgerPath(): string {
  return surugaPriceLedgerPathForProvider("narutoshippuden");
}

/** `naruto:shi-0001` → `shi0001`. */
export function surugaShippudenDiskIdFromPrintKey(
  printKey: string | null | undefined,
): string | null {
  const parsed = parsePrintKey(printKey);
  if (!parsed || parsed.game !== "naruto") return null;
  const set = parsed.set.trim().toLowerCase();
  const number = parsed.number.trim().toLowerCase();
  if (!/^(shi|mju|msa|gaku|prshi|prmsa|prgaku)$/.test(set)) return null;
  if (!number) return null;
  // Print keys are `naruto:shi-0001` → disk `shi0001`.
  return `${set}${number}`;
}

export type HarvestSurugaShippudenPricesOpts = {
  limit?: number;
  delayMs?: number;
  force?: boolean;
  detailHtmlById?: ReadonlyMap<string, string>;
  listings?: readonly SurugaShippudenListing[];
  ledgerPath?: string;
};

export async function harvestSurugaShippudenPrices(
  opts: HarvestSurugaShippudenPricesOpts = {},
): Promise<{ ledger: SurugaPriceLedger; outPath: string; fetched: number }> {
  const listings: SurugaYenListing[] =
    opts.listings ?? loadSurugaShippudenCuratedListings();
  return harvestSurugaYenPrices({
    packId: NARUTO_SHIPPUDEN_PACK_ID,
    ledgerPath: opts.ledgerPath ?? surugaShippudenPriceLedgerPath(),
    listings,
    printedToDiskId: diskIdFromPrintedReference,
    productUrl: surugaShippudenProductUrl,
    limit: opts.limit,
    delayMs: opts.delayMs,
    force: opts.force,
    detailHtmlById: opts.detailHtmlById,
  });
}

export async function refreshSurugaShippudenYenPriceOffers(
  ctx: BarcodePriceRefreshContext,
  opts: { ledgerPath?: string } = {},
): Promise<PriceOfferInput[]> {
  return refreshSurugaYenPriceOffersFromLedger(ctx, {
    ledgerPath: opts.ledgerPath ?? surugaShippudenPriceLedgerPath(),
    diskIdFromPrintKey: (key) => surugaShippudenDiskIdFromPrintKey(key),
  });
}
