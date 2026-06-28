import { isBoardGameBundleTitle } from "@/lib/metadata/boardGame";
import { normalizeDisplayTitle } from "@/lib/title/displayScore";
import { isRetailerCatalogTitleAccepted } from "@/lib/retailer/metadataAcceptance";

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
  catalogTitle: string;
  catalogAliases?: string[];
  barcodeConfirmed?: boolean;
  trustConfirmedProductBarcode?: boolean;
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
    catalogTitle: input.catalogTitle,
    catalogAliases: input.catalogAliases,
    barcodeConfirmed: input.barcodeConfirmed,
    trustConfirmedProductBarcode: input.trustConfirmedProductBarcode,
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
    ...name
      .split(/\s*\+\s*/)
      .flatMap((part) => distinctiveQueryTokens(part)),
  ]);

  const queryTokens = distinctiveQueryTokens(query);
  if (queryTokens.length === 0) return true;
  return queryTokens.every((token) => allowed.has(token));
}
