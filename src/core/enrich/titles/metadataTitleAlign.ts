/**
 * Metadata title alignment gate (barcode/enrich accept vs reject).
 */
import { extractBaseTitleVariant } from "@/core/enrich/titles/gameEditionVariant";
import {
  franchiseSequelNumbersAreAligned,
  franchiseSequelNumbersConflict,
} from "@/core/enrich/titles/franchiseSequel";
import {
  authorNamesFromMetadata,
  residualIdentityMatch,
} from "@/core/enrich/titles/residualIdentity";
import {
  bundleTitlePartsMatchCatalogTitle,
  isBundleTitle,
} from "@/core/enrich/bundleTitle";
import { METADATA_TITLE_ALIGN_FLOOR } from "@/core/enrich/titles/identityThresholds";
import { namesFromMetadataSource } from "@/core/enrich/titles/metadataSearchQueries";
import { editionIdentityBasesMismatch } from "@/core/enrich/titles/editionIdentity";
import { compactedFranchiseNearMiss } from "@/core/enrich/titles/titleSimilarity";
import { franchiseLeadTokensConflict } from "@/core/enrich/titles/franchiseLead";
import {
  gameProductIdentityMismatch,
  stripTrailingPlatformSuffix,
} from "@/core/enrich/titles/variantIdentity";
import { sameVolumeAlbumSubtitleConflicts } from "@/core/enrich/titles/albumSubtitleConflicts";
import type { MetadataResult } from "@/types/metadataProvider";
import {
  editionNumbersAreAligned,
  numeralRangesMismatch,
} from "@/core/enrich/titles/volumeTitleAlign";
import { metadataTitleMatchScore } from "@/core/enrich/titles/metadataTitleScore";
import { isGenericTitleFragment } from "@/core/enrich/titles/genericTitleFragment";

export {
  hasUnrequestedVariantMarker,
  hasUnrequestedPreVolumeProductLine,
  hasUnrequestedSeriesSuffixToken,
} from "@/core/enrich/titles/seriesLineMarkers";
export { metadataTitleMatchScore } from "@/core/enrich/titles/metadataTitleScore";
export { descriptionMatchesRequestedTitle } from "@/core/enrich/titles/descriptionTitleMatch";
export { isGenericTitleFragment } from "@/core/enrich/titles/genericTitleFragment";
export {
  shouldRecheckMetadataMatch,
  findBetterMetadataMatch,
} from "@/core/enrich/titles/betterMetadataMatch";
export {
  BARCODE_CONFIRMED_TITLE_FLOOR,
  METADATA_TITLE_ALIGN_FLOOR,
} from "@/core/enrich/titles/identityThresholds";

export function isMetadataTitleAligned(
  result: MetadataResult,
  comparisonNames: string[],
  minScore: number = METADATA_TITLE_ALIGN_FLOOR,
  options?: { shelfType?: string | null },
): boolean {
  if (!result.title) return true;
  if (
    comparisonNames.some(
      (name) =>
        isBundleTitle(name) &&
        bundleTitlePartsMatchCatalogTitle(
          name,
          result.title || "",
          result.aliases ?? [],
        ),
    )
  ) {
    return true;
  }
  const primaryComparisonName =
    comparisonNames.find((name) => name.trim())?.trim() || "";
  // Identity / series-line gates must consider every name the provider
  // declares (primary + aliases + regional titles). Rejecting on the English
  // primary alone drops valid FR shelf matches such as LaunchBox
  // "Tomb Raider: The Last Revelation" ↔ "La Révélation Finale".
  const catalogNames = namesFromMetadataSource(result);
  const catalogTitlesForIdentity =
    catalogNames.length > 0 ? catalogNames : [result.title || ""];

  // Fact-based residual: consume known title/volume blocks, judge leftovers
  // (author, merch, volume, series line, unexplained candidate identity…).
  const residual = residualIdentityMatch({
    requestTitles: comparisonNames,
    candidateTitles: catalogTitlesForIdentity,
    candidateAuthors: authorNamesFromMetadata(result.authors),
    shelfType: options?.shelfType,
  });
  if (residual.decision === "accept") return true;
  if (residual.decision === "reject") return false;
  // Hardware: same contract as catalogTitleAlignedWithItem — residual must
  // positively accept. Soft similarity alone pairs bare consoles with games
  // that merely share the brand token (Nintendo DS → Nintendogs).
  if (options?.shelfType === "hardware") return false;

  // Merch / volume / series-line variant markers: handled by residual above.
  // "007: Agent Under Fire" looks like a generic fragment of "James Bond 007…"
  // when judged alone, but LaunchBox also declares the full Bond alias — only
  // reject when *every* declared name is a fragment.
  if (
    catalogTitlesForIdentity.every((catalogTitle) =>
      isGenericTitleFragment(catalogTitle, comparisonNames),
    )
  ) {
    return false;
  }
  if (
    primaryComparisonName &&
    catalogTitlesForIdentity.every((catalogTitle) =>
      editionIdentityBasesMismatch(primaryComparisonName, catalogTitle),
    )
  ) {
    return false;
  }
  if (
    primaryComparisonName &&
    catalogTitlesForIdentity.every((catalogTitle) =>
      franchiseLeadTokensConflict(primaryComparisonName, catalogTitle),
    )
  ) {
    return false;
  }
  if (
    primaryComparisonName &&
    catalogTitlesForIdentity.every((catalogTitle) =>
      compactedFranchiseNearMiss(primaryComparisonName, catalogTitle),
    )
  ) {
    return false;
  }
  if (
    comparisonNames.some((name) =>
      catalogTitlesForIdentity.every((catalogTitle) =>
        gameProductIdentityMismatch([name], catalogTitle),
      ),
    )
  ) {
    return false;
  }
  if (
    sameVolumeAlbumSubtitleConflicts(
      comparisonNames,
      namesFromMetadataSource(result),
    )
  ) {
    return false;
  }

  if (
    comparisonNames.some((name) => {
      const base = extractBaseTitleVariant(name);
      if (!base) return false;
      const normalizedCandidate = stripTrailingPlatformSuffix(
        result.title || "",
      );
      return normalizedCandidate.toLowerCase() === base.toLowerCase();
    })
  ) {
    return true;
  }
  if (
    comparisonNames.some((name) => {
      const trimmed = name.trim();
      if (!trimmed) return false;
      const normalizedCandidate = stripTrailingPlatformSuffix(
        result.title || "",
      );
      return normalizedCandidate.toLowerCase() === trimmed.toLowerCase();
    })
  ) {
    return true;
  }
  if (
    !catalogTitlesForIdentity.some((catalogTitle) =>
      editionNumbersAreAligned(catalogTitle, comparisonNames),
    )
  ) {
    return false;
  }
  if (
    !catalogTitlesForIdentity.some((catalogTitle) =>
      franchiseSequelNumbersAreAligned(catalogTitle, comparisonNames),
    )
  ) {
    return false;
  }
  if (
    comparisonNames.some((name) =>
      catalogTitlesForIdentity.every((catalogTitle) =>
        numeralRangesMismatch(name, catalogTitle),
      ),
    )
  ) {
    return false;
  }
  if (
    catalogTitlesForIdentity.every((catalogTitle) =>
      franchiseSequelNumbersConflict(comparisonNames, catalogTitle),
    )
  ) {
    return false;
  }
  // When residual identity is bilaterally unexplained (edition franchise
  // leftovers on both sides), score only against the primary request title.
  // Short alignment fragments from buildMetadataAlignmentNames
  // ("Nintendo Switch OLED") must not rescue a Pokémon OLED hit for a Zelda
  // OLED request — while FR↔EN subtitle pairs (Ni no Kuni) still pass on the
  // shared franchise stem.
  const scoreNames = residual.reasons.includes("bilateral_unexplained")
    ? [primaryComparisonName].filter(Boolean)
    : comparisonNames;
  if (scoreNames.length === 0) return false;
  return metadataTitleMatchScore(result, scoreNames) >= minScore;
}
