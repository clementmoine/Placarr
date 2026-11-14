/**
 * Suruga-ya used yen → curated ledger for Naruto Data Carddass (DN/NM/NX…).
 */
import { parsePrintKey } from "@/core/identify/printKey";
import type { PriceOfferInput } from "@/core/enrich/evidence";
import type { BarcodePriceRefreshContext } from "@/types/providerModule";

import {
  harvestSurugaYenPrices,
  refreshSurugaYenPriceOffersFromLedger,
  surugaPriceLedgerPathForProvider,
  surugaYaProductUrl,
  type SurugaPriceLedger,
  type SurugaYenListing,
} from "@/providers/naruto/shared/surugaYenPrices";

import { NARUTO_DATA_CARDDASS_PACK_ID, NARUTO_DATA_CARDDASS_PRINT_GAME } from "../pack";
import {
  loadSurugaDataCarddassCuratedListings,
  type SurugaDataCarddassListing,
} from "../parse/catalogues";
import { parseDataCarddassPrinted } from "../printKey";

export function surugaDataCarddassPriceLedgerPath(): string {
  return surugaPriceLedgerPathForProvider("narutodatacarddass");
}

/** `DN-032T` → `dn-032t`. */
export function surugaDataCarddassPrintedToDiskId(
  printed: string,
): string | null {
  const parsed = parseDataCarddassPrinted(printed);
  if (!parsed) return null;
  return `${parsed.set}-${parsed.number}`;
}

/** `datacarddass:dn-032t` → `dn-032t`. */
export function surugaDataCarddassDiskIdFromPrintKey(
  printKey: string | null | undefined,
): string | null {
  const parsed = parsePrintKey(printKey);
  if (!parsed || parsed.game !== NARUTO_DATA_CARDDASS_PRINT_GAME) return null;
  const set = parsed.set.trim().toLowerCase();
  const number = parsed.number.trim().toLowerCase();
  if (!set || !number) return null;
  return `${set}-${number}`;
}

export type HarvestSurugaDataCarddassPricesOpts = {
  limit?: number;
  delayMs?: number;
  force?: boolean;
  detailHtmlById?: ReadonlyMap<string, string>;
  listings?: readonly SurugaDataCarddassListing[];
  ledgerPath?: string;
};

export async function harvestSurugaDataCarddassPrices(
  opts: HarvestSurugaDataCarddassPricesOpts = {},
): Promise<{ ledger: SurugaPriceLedger; outPath: string; fetched: number }> {
  const listings: SurugaYenListing[] =
    opts.listings ?? loadSurugaDataCarddassCuratedListings();
  return harvestSurugaYenPrices({
    packId: NARUTO_DATA_CARDDASS_PACK_ID,
    ledgerPath: opts.ledgerPath ?? surugaDataCarddassPriceLedgerPath(),
    listings,
    printedToDiskId: surugaDataCarddassPrintedToDiskId,
    productUrl: surugaYaProductUrl,
    limit: opts.limit,
    delayMs: opts.delayMs,
    force: opts.force,
    detailHtmlById: opts.detailHtmlById,
  });
}

export async function refreshSurugaDataCarddassYenPriceOffers(
  ctx: BarcodePriceRefreshContext,
  opts: { ledgerPath?: string } = {},
): Promise<PriceOfferInput[]> {
  return refreshSurugaYenPriceOffersFromLedger(ctx, {
    ledgerPath: opts.ledgerPath ?? surugaDataCarddassPriceLedgerPath(),
    diskIdFromPrintKey: (key) => surugaDataCarddassDiskIdFromPrintKey(key),
  });
}
