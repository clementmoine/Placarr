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
} from "@/providers/ebay/normalizeLegacyPriceOffer";
import { enrichPriceChartingOfferProductName } from "@/providers/pricecharting/offerProductName";

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
