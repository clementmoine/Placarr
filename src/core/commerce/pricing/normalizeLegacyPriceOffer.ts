/**
 * Stable commerce entrypoint — implementation is provider-owned; wired via catalog.
 */
export {
  ebayItemUrlFromPicClickUrl,
  isLegacyPicClickPriceSource,
  needsLegacyPriceOfferNormalization,
  normalizeLegacyPriceOffer,
  type NormalizablePriceOffer,
} from "@/core/catalog/legacyPriceOffer";
