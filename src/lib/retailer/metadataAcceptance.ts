import { bundleTitlePartsMatchCatalogTitle } from "@/lib/metadata/boardGame";
import { detectVideoGamePlatformKey } from "@/lib/games/platforms";
import { detectShelfGamePlatformKey } from "@/lib/metadata/platform";
import {
  catalogEditionIdentityMismatch,
  franchiseSequelNumbersConflict,
  gameProductIdentityMismatch,
  isGenericTitleFragment,
  isMetadataTitleAligned,
  metadataTitleSimilarity,
} from "@/lib/metadata/titleMatching";
import {
  isNameOnlyRetailerTitleMatch,
  retailerCatalogSharesRequestedIdentity,
  retailerIdentityTokenCount,
} from "@/lib/retailer/titleMatch";

/** Rejects PS4 catalog hits on a PS5 shelf (etc.) when both platforms are explicit. */
export function retailerCatalogPlatformMismatch(
  shelfName: string | null | undefined,
  catalogTitle: string,
): boolean {
  const shelfPlatform = detectShelfGamePlatformKey(shelfName);
  if (!shelfPlatform) return false;

  const catalogPlatform = detectVideoGamePlatformKey(catalogTitle);
  if (!catalogPlatform) return false;

  return shelfPlatform !== catalogPlatform;
}

function isBarcodeConfirmedCatalogTitleAccepted(
  requestedName: string,
  catalogTitle: string,
  shelfName?: string | null,
  trustConfirmedProductBarcode = false,
): boolean {
  if (retailerCatalogPlatformMismatch(shelfName, catalogTitle)) {
    return false;
  }
  if (catalogEditionIdentityMismatch(requestedName, catalogTitle)) {
    return false;
  }
  if (gameProductIdentityMismatch([requestedName], catalogTitle)) {
    return false;
  }
  if (franchiseSequelNumbersConflict([requestedName], catalogTitle)) {
    return false;
  }
  if (trustConfirmedProductBarcode) {
    return true;
  }
  if (isMetadataTitleAligned({ title: catalogTitle }, [requestedName], 0.42)) {
    return true;
  }
  if (retailerCatalogSharesRequestedIdentity(requestedName, catalogTitle)) {
    return true;
  }
  return metadataTitleSimilarity(requestedName, catalogTitle) >= 0.42;
}

export function isRetailerCatalogTitleAccepted(input: {
  requestedName: string;
  searchQuery?: string | null;
  shelfName?: string | null;
  catalogTitle: string;
  catalogAliases?: string[];
  barcodeConfirmed?: boolean;
  /** When true, a confirmed barcode accepts unless platform/sequel/edition checks fail. */
  trustConfirmedProductBarcode?: boolean;
  /** When true, only barcode confirmation or bundle-scenario overlap can accept. */
  requireBundleScenarioMatch?: boolean;
}): boolean {
  const requestedName = input.requestedName.trim();
  const catalogTitle = input.catalogTitle.trim();
  if (!requestedName || !catalogTitle) return false;

  if (retailerCatalogPlatformMismatch(input.shelfName, catalogTitle)) {
    return false;
  }

  if (input.barcodeConfirmed) {
    return isBarcodeConfirmedCatalogTitleAccepted(
      requestedName,
      catalogTitle,
      input.shelfName,
      input.trustConfirmedProductBarcode,
    );
  }

  const bundleMatch = bundleTitlePartsMatchCatalogTitle(
    requestedName,
    catalogTitle,
    input.catalogAliases ?? [],
  );

  if (input.requireBundleScenarioMatch) {
    return bundleMatch;
  }

  if (isNameOnlyRetailerTitleMatch(requestedName, catalogTitle)) return true;

  const searchQuery = input.searchQuery?.trim();
  if (
    searchQuery &&
    searchQuery.toLowerCase() !== requestedName.toLowerCase() &&
    isNameOnlyRetailerTitleMatch(searchQuery, catalogTitle)
  ) {
    if (isGenericTitleFragment(searchQuery, [requestedName])) {
      return false;
    }
    return retailerCatalogSharesRequestedIdentity(requestedName, catalogTitle);
  }

  return bundleMatch;
}
