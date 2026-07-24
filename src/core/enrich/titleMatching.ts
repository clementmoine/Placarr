/**
 * Title matching facade — implementation lives in titles/* leaves.
 * Public import path `@/core/enrich/titleMatching` stays stable.
 */

export {
  collectCanonicalFallbackNames,
  orderFallbackNamesForLocale,
  buildGameMetadataFallbackNames,
  buildRequestedTitleFallbackVariants,
  buildMetadataAlignmentNames,
  buildGameMetadataSearchQueries,
  buildHardwareMetadataSearchQueries,
  namesFromMetadataSource,
} from "@/core/enrich/titles/metadataSearchQueries";

export {
  catalogEditionIdentityMismatch,
  editionIdentityBasesMismatch,
} from "@/core/enrich/titles/editionIdentity";

export {
  gameProductIdentityMismatch,
  stripTrailingPlatformSuffix,
  variantIdentityTokens,
  stripProductLinePackaging,
  normalizeMetadataCandidateTitle,
} from "@/core/enrich/titles/variantIdentity";

export { catalogAttachmentTitleConflicts } from "@/core/enrich/titles/attachmentTitleConflicts";

export {
  catalogLabelSimilarity,
  metadataTitleSimilarity,
  compactedFranchiseNearMiss,
} from "@/core/enrich/titles/titleSimilarity";

export {
  franchiseLeadTokens,
  franchiseLeadTokensConflict,
  franchiseLeadsShareRoot,
} from "@/core/enrich/titles/franchiseLead";

export {
  isMetadataTitleAligned,
  isGenericTitleFragment,
  shouldRecheckMetadataMatch,
  findBetterMetadataMatch,
  metadataTitleMatchScore,
  descriptionMatchesRequestedTitle,
  hasUnrequestedVariantMarker,
  hasUnrequestedPreVolumeProductLine,
  hasUnrequestedSeriesSuffixToken,
  BARCODE_CONFIRMED_TITLE_FLOOR,
  METADATA_TITLE_ALIGN_FLOOR,
} from "@/core/enrich/titles/metadataTitleAlign";

export {
  catalogMatchTokenSet,
  distinctiveTitleTokens,
  distinctiveTokenCoverage,
} from "@/core/enrich/titles/catalogTitleTokens";
export { allNumbers } from "@/core/enrich/titles/titleNumbers";
export { attachmentTitleMediaTypeConflicts } from "@/core/enrich/titles/attachmentMediaTypeConflicts";
export {
  albumSpecificDistinctiveTokens,
  sameVolumeAlbumSubtitleConflicts,
} from "@/core/enrich/titles/albumSubtitleConflicts";
export {
  extractBaseTitleVariant,
  isGameEditionVariant,
} from "@/core/enrich/titles/gameEditionVariant";
export {
  franchiseSequelNumbersAreAligned,
  franchiseSequelNumbersConflict,
  franchiseSequelTokens,
} from "@/core/enrich/titles/franchiseSequel";
export { supplementGameEditionMetadata } from "@/core/enrich/titles/gameEditionSupplement";
