import { normalizeDisplayTitle } from "@/lib/title/displayScore";
import {
  extractBaseTitleVariant,
  franchiseSequelNumbersConflict,
  hasUnrequestedSeriesSuffixToken,
  metadataTitleSimilarity,
  hasUnrequestedVariantMarker,
} from "@/lib/metadata/titleMatching";
import { titleTokenPresentInSet } from "@/lib/title/tokenEquivalents";

/** Same floor as metadataFetch title alignment for name-only provider hits. */
export const NAME_ONLY_RETAILER_TITLE_MIN_SIMILARITY = 0.58;

const GENERIC_RETAILER_TOKENS = new Set([
  "deluxe",
  "edition",
  "collector",
  "limited",
  "ultimate",
  "definitive",
  "complete",
  "premium",
  "gold",
  "platinum",
  "anniversary",
  "remastered",
  "remaster",
  "ps4",
  "ps5",
  "xbox",
  "switch",
  "nintendo",
  "playstation",
  "series",
  "sur",
  "for",
  "pc",
]);

const TITLE_STOP_WORDS = new Set([
  "le",
  "la",
  "les",
  "l",
  "du",
  "de",
  "des",
  "d",
  "un",
  "une",
  "au",
  "aux",
  "the",
  "and",
  "or",
  "a",
]);

function distinctiveTokens(value: string): string[] {
  return normalizeDisplayTitle(value).filter(
    (token) => token.length >= 3 && !TITLE_STOP_WORDS.has(token),
  );
}

export function retailerIdentityTokenCount(requestedName: string): number {
  const requestedBase = extractBaseTitleVariant(requestedName) ?? requestedName;
  return distinctiveTokens(requestedBase).filter(
    (token) => !GENERIC_RETAILER_TOKENS.has(token),
  ).length;
}

function distinctiveProductTokens(value: string): string[] {
  return distinctiveTokens(value).filter(
    (token) => !GENERIC_RETAILER_TOKENS.has(token),
  );
}

/**
 * True when the catalog title is only a franchise/base prefix of the request
 * and drops distinctive product tokens (e.g. BGG "Black Stories" for
 * "Black Stories - Musique d'enfer").
 */
export function catalogTitleOmitsRequestedProductIdentity(
  requestedName: string,
  catalogTitle: string,
): boolean {
  if (franchiseSequelNumbersConflict([requestedName], catalogTitle)) {
    return false;
  }

  const requestedBase = extractBaseTitleVariant(requestedName) ?? requestedName;
  const requestedTokens = distinctiveProductTokens(requestedBase);
  const catalogTokens = distinctiveProductTokens(catalogTitle);
  if (requestedTokens.length === 0 || catalogTokens.length === 0) {
    return false;
  }
  if (catalogTokens.length >= requestedTokens.length) return false;

  const catalogTokenSet = new Set(catalogTokens);
  const allCatalogTokensInRequest = catalogTokens.every((token) =>
    titleTokenPresentInSet(
      token,
      new Set(distinctiveProductTokens(requestedBase)),
    ),
  );
  if (!allCatalogTokensInRequest) return false;

  const missingFromCatalog = requestedTokens.filter(
    (token) => !titleTokenPresentInSet(token, catalogTokenSet),
  );
  return missingFromCatalog.length > 0;
}

export function retailerCatalogSharesRequestedIdentity(
  requestedName: string,
  catalogTitle: string,
): boolean {
  if (catalogTitleOmitsRequestedProductIdentity(requestedName, catalogTitle)) {
    return false;
  }
  if (franchiseSequelNumbersConflict([requestedName], catalogTitle)) {
    return false;
  }
  const requestedBase = extractBaseTitleVariant(requestedName) ?? requestedName;
  const identityTokens = distinctiveProductTokens(requestedBase);
  if (identityTokens.length === 0) return false;

  const catalogTokenSet = new Set(distinctiveTokens(catalogTitle));
  return identityTokens.some((token) =>
    titleTokenPresentInSet(token, catalogTokenSet),
  );
}

export function isNameOnlyRetailerTitleMatch(
  query: string,
  title: string,
): boolean {
  const trimmedQuery = query.trim();
  const trimmedTitle = title.trim();
  if (!trimmedQuery || !trimmedTitle) return false;
  if (hasUnrequestedVariantMarker(trimmedQuery, trimmedTitle)) return false;
  if (hasUnrequestedSeriesSuffixToken(trimmedQuery, trimmedTitle)) {
    return false;
  }
  if (franchiseSequelNumbersConflict([trimmedQuery], trimmedTitle)) {
    return false;
  }
  if (
    metadataTitleSimilarity(trimmedQuery, trimmedTitle) <
    NAME_ONLY_RETAILER_TITLE_MIN_SIMILARITY
  ) {
    return false;
  }

  const queryTokens = distinctiveTokens(trimmedQuery);
  if (queryTokens.length < 2) return true;

  const titleTokenSet = new Set(distinctiveTokens(trimmedTitle));
  return queryTokens.every((token) =>
    titleTokenPresentInSet(token, titleTokenSet),
  );
}
