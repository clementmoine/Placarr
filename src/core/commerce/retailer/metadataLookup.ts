import { isBoardGameBundleTitle } from "@/core/enrich/boardGame";
import { normalizeDisplayTitle } from "@/core/enrich/titles/displayScore";
import { bundleTitlePartsMatchCatalogTitle } from "@/core/enrich/boardGame";
import { detectVideoGamePlatformKey } from "@/core/identify/platforms/platforms";
import { detectShelfGamePlatformKey } from "@/core/enrich/platform";
import { isBarcodePlaceholderItemName } from "@/core/collect/placeholderName";
import {
  catalogEditionIdentityMismatch,
  franchiseSequelNumbersConflict,
  gameProductIdentityMismatch,
  isGenericTitleFragment,
  isMetadataTitleAligned,
  metadataTitleSimilarity,
} from "@/core/enrich/titleMatching";
import {
  catalogTitleOmitsRequestedProductIdentity,
  isNameOnlyRetailerTitleMatch,
  retailerCatalogSharesRequestedIdentity,
} from "@/core/commerce/retailer/titleMatch";

/**
 * Retailer metadata lookup policy:
 * - Search queries are derived only from the item title, shelf name, and bundle
 *   structure (see buildBoardGameMetadataSearchQueries).
 * - A catalog hit is accepted only via barcode confirmation **and** title
 *   alignment, title similarity, or bundle-scenario overlap — never via fixed
 *   product hints baked into core code. A barcode hit that fails title checks
 *   is discarded and retailers are queried again by product name.
 */

/** Default number of retailer search hits to inspect per query. */
export const RETAILER_SEARCH_HIT_LIMIT_PER_QUERY = 8;

/**
 * Wider scan when the query is only the shelf label on a bundle item: catalog
 * titles rarely echo user bundle labels, so we rank provider hits by scenario
 * overlap instead of injecting product-line keywords.
 */
export const RETAILER_SHELF_ONLY_BUNDLE_HIT_LIMIT = 24;

export function isShelfOnlyBundleLookupQuery(input: {
  requestedName: string;
  searchQuery: string;
  shelfName?: string | null;
}): boolean {
  const shelf = input.shelfName?.trim();
  if (!shelf) return false;
  return (
    isBoardGameBundleTitle(input.requestedName) &&
    input.searchQuery.trim() === shelf
  );
}

export function retailerSearchHitLimit(input: {
  requestedName: string;
  searchQuery: string;
  shelfName?: string | null;
}): number {
  return isShelfOnlyBundleLookupQuery(input)
    ? RETAILER_SHELF_ONLY_BUNDLE_HIT_LIMIT
    : RETAILER_SEARCH_HIT_LIMIT_PER_QUERY;
}

export function acceptRetailerCatalogCandidate(input: {
  requestedName: string;
  searchQuery?: string | null;
  shelfName?: string | null;
  shelfType?: string | null;
  catalogTitle: string;
  catalogAliases?: string[];
  barcodeConfirmed?: boolean;
  trustConfirmedProductBarcode?: boolean;
  itemBarcode?: string | null;
}): boolean {
  const searchQuery = input.searchQuery?.trim() ?? "";
  const shelfOnly =
    !!searchQuery &&
    isShelfOnlyBundleLookupQuery({
      requestedName: input.requestedName,
      searchQuery,
      shelfName: input.shelfName,
    });

  return isRetailerCatalogTitleAccepted({
    requestedName: input.requestedName,
    searchQuery,
    shelfName: input.shelfName,
    shelfType: input.shelfType,
    catalogTitle: input.catalogTitle,
    catalogAliases: input.catalogAliases,
    barcodeConfirmed: input.barcodeConfirmed,
    trustConfirmedProductBarcode: input.trustConfirmedProductBarcode,
    itemBarcode: input.itemBarcode,
    requireBundleScenarioMatch: shelfOnly,
  });
}

const QUERY_STOP_WORDS = new Set([
  "le",
  "la",
  "les",
  "du",
  "de",
  "des",
  "un",
  "une",
  "the",
  "and",
  "or",
]);

function distinctiveQueryTokens(value: string): string[] {
  return normalizeDisplayTitle(value).filter(
    (token) => token.length >= 3 && !QUERY_STOP_WORDS.has(token),
  );
}

/** Test helper: every query token must come from the item title and/or shelf name. */
export function retailerSearchQueryUsesOnlyInputTokens(
  query: string,
  name: string,
  shelfName?: string | null,
): boolean {
  const allowed = new Set([
    ...distinctiveQueryTokens(name),
    ...distinctiveQueryTokens(shelfName ?? ""),
    ...name.split(/\s*\+\s*/).flatMap((part) => distinctiveQueryTokens(part)),
  ]);

  const queryTokens = distinctiveQueryTokens(query);
  if (queryTokens.length === 0) return true;
  return queryTokens.every((token) => allowed.has(token));
}

// ── coalesced from src/core/commerce/retailer/metadataAcceptance.ts ──
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
  itemBarcode?: string | null,
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
  if (catalogTitleOmitsRequestedProductIdentity(requestedName, catalogTitle)) {
    return false;
  }
  if (
    trustConfirmedProductBarcode ||
    isBarcodePlaceholderItemName(requestedName, itemBarcode)
  ) {
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
  shelfType?: string | null;
  catalogTitle: string;
  catalogAliases?: string[];
  barcodeConfirmed?: boolean;
  /** When true, a confirmed barcode accepts unless platform/sequel/edition checks fail. */
  trustConfirmedProductBarcode?: boolean;
  /** Item barcode — used to detect bulk-scan placeholder names (`Objet {ean}`). */
  itemBarcode?: string | null;
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
      input.itemBarcode,
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

  const nameOnlyOptions = input.shelfType
    ? { shelfType: input.shelfType }
    : undefined;

  if (isNameOnlyRetailerTitleMatch(requestedName, catalogTitle, nameOnlyOptions))
    return true;

  const searchQuery = input.searchQuery?.trim();
  if (
    searchQuery &&
    searchQuery.toLowerCase() !== requestedName.toLowerCase() &&
    isNameOnlyRetailerTitleMatch(searchQuery, catalogTitle, nameOnlyOptions)
  ) {
    if (isGenericTitleFragment(searchQuery, [requestedName])) {
      return false;
    }
    if (
      catalogTitleOmitsRequestedProductIdentity(requestedName, catalogTitle)
    ) {
      return false;
    }
    return retailerCatalogSharesRequestedIdentity(requestedName, catalogTitle);
  }

  return bundleMatch;
}
