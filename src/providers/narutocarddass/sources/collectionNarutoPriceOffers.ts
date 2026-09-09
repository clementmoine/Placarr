/**
 * Côtes Collection Naruto (YT 7r7) → offres prix `estimated` pour checklist /
 * étagères / fiche. Corpus sans marché live fiable : ces Estimations sont la
 * référence Placarr pour les tirages Carddass FR concernés.
 */
import { pricedOffers } from "@/core/catalog/priceOffers";
import { parsePrintKey } from "@/core/identify/printKey";
import type { PriceOfferInput } from "@/core/enrich/evidence";
import type { BarcodePriceRefreshContext } from "@/types/providerModule";

import { ensureNarutoCcgIndex } from "../indexStore";
import { lookupNarutoPrintDetail } from "../searchPrints";
import {
  narutoIndicativeQuoteForPrint,
  type NarutoIndicativeQuote,
} from "./collectionNarutoIndicativeQuotes";

export const NARUTO_INDICATIVE_PRICE_SOURCE = "Collection Naruto";

function printKeyFromCtx(ctx: BarcodePriceRefreshContext): string | null {
  const direct = ctx.printKey?.trim();
  if (direct) return direct;
  return ctx.externalIds?.printKey?.trim() || null;
}

export function narutoIndicativeQuoteForPrintKey(
  printKey: string,
): NarutoIndicativeQuote | null {
  if (parsePrintKey(printKey)?.game !== "naruto") return null;
  if (!ensureNarutoCcgIndex()) return null;
  const row = lookupNarutoPrintDetail(printKey);
  if (!row) return null;
  return narutoIndicativeQuoteForPrint({
    setCode: row.setCode,
    number: row.number,
    rarity: row.rarity,
  });
}

/** Offres `estimated` branchées sur le dig 7r7 (pas de HTTP). */
export async function refreshNarutoIndicativePriceOffers(
  ctx: BarcodePriceRefreshContext,
): Promise<PriceOfferInput[]> {
  if (ctx.shelfType !== "tcg") return [];
  const printKey = printKeyFromCtx(ctx);
  if (!printKey) return [];
  const quote = narutoIndicativeQuoteForPrintKey(printKey);
  if (!quote) return [];

  const productName =
    ctx.primaryTitle?.trim() ||
    ctx.primaryName?.trim() ||
    ctx.titles?.[0]?.trim() ||
    "Estimation";

  return pricedOffers(NARUTO_INDICATIVE_PRICE_SOURCE, [
    {
      condition: "estimated",
      priceCents: quote.cents,
      rawValue: quote,
      extra: {
        currency: "EUR",
        productName,
        sourceUrl: quote.sourceUrl,
        metadataScoped: true,
      },
    },
  ]);
}
