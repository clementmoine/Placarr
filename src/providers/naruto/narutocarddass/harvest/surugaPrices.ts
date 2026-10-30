/**
 * Suruga-ya used yen → curated ledger for Naruto Carddass (tabletop NI/TE/TA…).
 */
import { parsePrintKey } from "@/core/identify/printKey";
import type { PriceOfferInput } from "@/core/enrich/evidence";
import type { BarcodePriceRefreshContext } from "@/types/providerModule";

import {
  harvestSurugaYenPrices,
  refreshSurugaYenPriceOffersFromLedger,
  surugaPriceLedgerPathForProvider,
  SURUGA_PRICE_ENRICH_LIMIT,
  SURUGA_YEN_PRICE_SOURCE,
  type SurugaPriceLedger,
  type SurugaYenListing,
  readSurugaPriceLedger,
  writeSurugaPriceLedger,
  surugaYenByDiskId,
} from "@/providers/naruto/shared/surugaYenPrices";

import {
  loadSurugaCarddassCuratedListings,
  parseSurugaProductDetailHtml,
  surugaCarddassProductUrl,
  surugaPrintedToDiskId,
  type SurugaCarddassListing,
} from "../parse/marketplace";

export {
  SURUGA_PRICE_ENRICH_LIMIT,
  SURUGA_YEN_PRICE_SOURCE,
  readSurugaPriceLedger,
  writeSurugaPriceLedger,
  surugaYenByDiskId,
};
export type { SurugaPriceLedger, SurugaPriceRow } from "@/providers/naruto/shared/surugaYenPrices";

export function surugaPriceLedgerPath(): string {
  return surugaPriceLedgerPathForProvider("narutocarddass");
}

/** `naruto:s1-ni0001` → `ni0001` (Suruga ledger key). */
export function surugaDiskIdFromPrintKey(
  printKey: string | null | undefined,
): string | null {
  const parsed = parsePrintKey(printKey);
  if (!parsed || parsed.game !== "naruto") return null;
  // Shippuden shares printGame `naruto` but diskIds are shi/mju/… — reject those.
  const number = parsed.number.trim().toLowerCase();
  if (!number) return null;
  if (/^(shi|mju|msa|gaku|prshi|prmsa|prgaku)/.test(parsed.set)) {
    return null;
  }
  // Carddass collectors are game-unique (`ni0085`); bare digits are not Suruga keys.
  if (!/^[a-z]{2,6}\d/i.test(number)) return null;
  return number;
}

export type HarvestSurugaPricesOpts = {
  limit?: number;
  delayMs?: number;
  force?: boolean;
  detailHtmlById?: ReadonlyMap<string, string>;
  listings?: readonly SurugaCarddassListing[];
  ledgerPath?: string;
};

export async function harvestSurugaCarddassPrices(
  opts: HarvestSurugaPricesOpts = {},
): Promise<{ ledger: SurugaPriceLedger; outPath: string; fetched: number }> {
  const listings: SurugaYenListing[] =
    opts.listings ?? loadSurugaCarddassCuratedListings();
  return harvestSurugaYenPrices({
    packId: "naruto/carddass",
    ledgerPath: opts.ledgerPath ?? surugaPriceLedgerPath(),
    listings,
    printedToDiskId: surugaPrintedToDiskId,
    productUrl: surugaCarddassProductUrl,
    parseDetail: (html, productId) => {
      const detail = parseSurugaProductDetailHtml(html, productId);
      if (!detail) return null;
      return {
        printed: detail.printed,
        priceYen: detail.priceYen ?? null,
      };
    },
    limit: opts.limit,
    delayMs: opts.delayMs,
    force: opts.force,
    detailHtmlById: opts.detailHtmlById,
  });
}

/** JA used market ask — JPY; FX fills EUR `~` when dig/Coleka empty. */
export async function refreshSurugaYenPriceOffers(
  ctx: BarcodePriceRefreshContext,
  opts: { ledgerPath?: string } = {},
): Promise<PriceOfferInput[]> {
  return refreshSurugaYenPriceOffersFromLedger(ctx, {
    ledgerPath: opts.ledgerPath ?? surugaPriceLedgerPath(),
    diskIdFromPrintKey: (key) => surugaDiskIdFromPrintKey(key),
  });
}
