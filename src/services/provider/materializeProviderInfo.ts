import type { ProviderInfo } from "@/types/providerRegistry";

/** Apply stable defaults to a provider's self-declared `info` (no central overrides). */
export function materializeProviderInfo(info: ProviderInfo): ProviderInfo {
  return {
    ...info,
    defaultLanguage: info.defaultLanguage ?? "unknown",
    isRealBoxCover: info.isRealBoxCover ?? false,
    remoteImageFallback: info.remoteImageFallback ?? false,
    sourceAliases: info.sourceAliases ?? [],
    fullWrapCover: info.fullWrapCover ?? false,
    isSecondary: info.isSecondary ?? false,
    digitalStorefrontArt: info.digitalStorefrontArt ?? false,
    canonicalCover: info.canonicalCover ?? false,
    nameDatabase: info.nameDatabase ?? false,
    rateLimited: info.rateLimited ?? false,
    requiresTitleAlignment: info.requiresTitleAlignment ?? false,
    retailCatalogImageTitles: info.retailCatalogImageTitles ?? false,
    strictShelfPlatformCover: info.strictShelfPlatformCover ?? false,
    authoritative3dCoverRole: info.authoritative3dCoverRole ?? false,
    gridStyleCoverLabels: info.gridStyleCoverLabels ?? false,
    collectorCoverRegionFromAgeRating:
      info.collectorCoverRegionFromAgeRating ?? false,
  };
}
