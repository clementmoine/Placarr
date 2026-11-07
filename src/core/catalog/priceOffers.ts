import type { PriceOfferInput } from "@/core/enrich/evidence";

/**
 * Legacy PicClick→eBay price row rewrite, plus PriceCharting sourceUrl→title
 * enrichment for unnamed catalog rows. Implementations live in provider
 * modules; catalog is the only core surface allowed to import them.
 */
import {
  ebayItemUrlFromPicClickUrl,
  isLegacyPicClickPriceSource,
  needsLegacyPriceOfferNormalization,
  normalizeLegacyPriceOffer as normalizeEbayLegacyPriceOffer,
  type NormalizablePriceOffer,
} from "@/providers/commerce/ebay/normalizeLegacyPriceOffer";
import { enrichPriceChartingOfferProductName } from "@/providers/commerce/pricecharting/fetch";

export function pricedOffer(
  source: string,
  condition: string,
  priceCents: unknown,
  rawValue: unknown,
  extra: Partial<PriceOfferInput> = {},
): PriceOfferInput | null {
  if (typeof priceCents !== "number" || priceCents <= 0) return null;
  return { source, condition, priceCents, rawValue, ...extra };
}

export function pricedOffers(
  source: string,
  rows: Array<{
    condition: string;
    priceCents: unknown;
    rawValue: unknown;
    extra?: Partial<PriceOfferInput>;
  }>,
): PriceOfferInput[] {
  return rows.flatMap((row) => {
    const offer = pricedOffer(
      source,
      row.condition,
      row.priceCents,
      row.rawValue,
      row.extra,
    );
    return offer ? [offer] : [];
  });
}

export {
  ebayItemUrlFromPicClickUrl,
  isLegacyPicClickPriceSource,
  needsLegacyPriceOfferNormalization,
  type NormalizablePriceOffer,
};

export function normalizeLegacyPriceOffer<T extends NormalizablePriceOffer>(
  offer: T,
): T {
  return enrichPriceChartingOfferProductName(
    normalizeEbayLegacyPriceOffer(offer),
  );
}
