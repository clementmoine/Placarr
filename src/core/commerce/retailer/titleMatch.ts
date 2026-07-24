import { normalizeDisplayTitle } from "@/core/enrich/titles/displayScore";
import {
  extractBaseTitleVariant,
  franchiseSequelNumbersConflict,
  hasUnrequestedSeriesSuffixToken,
  metadataTitleSimilarity,
  hasUnrequestedVariantMarker,
} from "@/core/enrich/titleMatching";
import {
  normalizeVolumeNumber,
  volumeNumberFromPriceListing,
} from "@/core/enrich/titles/volumeNumber";
import {
  hardwareProductTitlesAlign,
} from "@/core/enrich/titles/residualIdentity";
import {
  listingAddsUnrequestedControllerAccessory,
  listingAddsUnrequestedConsoleSystem,
  listingLooksLikeMerchAccessory,
} from "@/core/identify/listingMerch";
import {
  titleTokenPresentInSet,
  titleTokensEquivalent,
} from "@/core/enrich/titles/tokenEquivalents";

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

/** Platform / console tokens that ARE product identity on hardware shelves. */
const HARDWARE_PLATFORM_IDENTITY_TOKENS = new Set([
  "ps4",
  "ps5",
  "xbox",
  "switch",
  "nintendo",
  "playstation",
  "series",
  "pc",
]);

export type PriceListingIdentityOptions = {
  shelfType?: string | null;
};

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

/** Prefix length allowing hyphen compounds ("spider"+"man" ↔ "spiderman"). */
function identityTokenPrefixLength(a: string[], b: string[]): number {
  let i = 0;
  let j = 0;
  let matched = 0;
  while (i < a.length && j < b.length) {
    if (titleTokensEquivalent(a[i]!, b[j]!)) {
      i += 1;
      j += 1;
      matched += 1;
      continue;
    }
    if (
      i + 1 < a.length &&
      titleTokensEquivalent(`${a[i]}${a[i + 1]}`, b[j]!)
    ) {
      i += 2;
      j += 1;
      matched += 1;
      continue;
    }
    if (
      j + 1 < b.length &&
      titleTokensEquivalent(a[i]!, `${b[j]}${b[j + 1]}`)
    ) {
      i += 1;
      j += 2;
      matched += 1;
      continue;
    }
    break;
  }
  return matched;
}

export function retailerIdentityTokenCount(requestedName: string): number {
  const requestedBase = extractBaseTitleVariant(requestedName) ?? requestedName;
  return distinctiveProductTokens(requestedBase).length;
}

function distinctiveProductTokens(
  value: string,
  shelfType?: string | null,
): string[] {
  return distinctiveTokens(value).filter((token) => {
    if (!GENERIC_RETAILER_TOKENS.has(token)) return true;
    // Hardware: console/platform tokens are the product, not disposable chrome.
    return (
      shelfType === "hardware" && HARDWARE_PLATFORM_IDENTITY_TOKENS.has(token)
    );
  });
}

const MARKETPLACE_LEADING_PRICE_TOKENS = new Set([
  "livre",
  "magazine",
  "revue",
  "comic",
  "bd",
  "album",
]);

function stripLeadingMarketplacePriceTokens(tokens: string[]): string[] {
  const out = [...tokens];
  while (out.length > 0 && MARKETPLACE_LEADING_PRICE_TOKENS.has(out[0]!)) {
    out.shift();
  }
  return out;
}

function volumeDistinctiveTokenMatchesIssue(
  token: string,
  issue: string | null,
): boolean {
  if (!issue) return false;
  return normalizeVolumeNumber(token) === issue;
}

/**
 * True when the catalog title is only a franchise/base prefix of the request
 * and drops distinctive product tokens (e.g. BGG "Black Stories" for
 * "Black Stories - Musique d'enfer").
 */
export function catalogTitleOmitsRequestedProductIdentity(
  requestedName: string,
  catalogTitle: string,
  options?: PriceListingIdentityOptions,
): boolean {
  if (franchiseSequelNumbersConflict([requestedName], catalogTitle)) {
    return false;
  }

  const requestedBase = extractBaseTitleVariant(requestedName) ?? requestedName;
  const requestedTokens = distinctiveProductTokens(
    requestedBase,
    options?.shelfType,
  );
  const catalogTokens = distinctiveProductTokens(
    catalogTitle,
    options?.shelfType,
  );
  if (requestedTokens.length === 0 || catalogTokens.length === 0) {
    return false;
  }
  if (catalogTokens.length >= requestedTokens.length) return false;

  const catalogTokenSet = new Set(catalogTokens);
  const allCatalogTokensInRequest = catalogTokens.every((token) =>
    titleTokenPresentInSet(
      token,
      new Set(distinctiveProductTokens(requestedBase, options?.shelfType)),
    ),
  );
  if (!allCatalogTokensInRequest) return false;

  // Padded magazine issues ("036") are ≥3 chars so they enter distinctive
  // tokens; unpadded marketplace copy ("36") is dropped by length. Treat a
  // shared issue number as present rather than an omitted identity token.
  const catalogIssue = volumeNumberFromPriceListing(
    requestedName,
    catalogTitle,
  );
  const missingFromCatalog = requestedTokens.filter(
    (token) =>
      !titleTokenPresentInSet(token, catalogTokenSet) &&
      !volumeDistinctiveTokenMatchesIssue(token, catalogIssue),
  );
  if (missingFromCatalog.length === 0) return false;

  // Catalog kept the distinctive product tail ("007 Nightfire" for
  // "James Bond 007 Nightfire") — franchise lead tokens alone are not required.
  const productTail = [...requestedTokens]
    .reverse()
    .find((token) => token.length >= 4 && !/^\d+$/.test(token));
  if (
    productTail &&
    titleTokenPresentInSet(productTail, catalogTokenSet) &&
    !missingFromCatalog.includes(productTail)
  ) {
    return false;
  }

  return true;
}

export function retailerCatalogSharesRequestedIdentity(
  requestedName: string,
  catalogTitle: string,
  options?: PriceListingIdentityOptions,
): boolean {
  if (
    catalogTitleOmitsRequestedProductIdentity(
      requestedName,
      catalogTitle,
      options,
    )
  ) {
    return false;
  }
  if (franchiseSequelNumbersConflict([requestedName], catalogTitle)) {
    return false;
  }

  const requestedBase = extractBaseTitleVariant(requestedName) ?? requestedName;
  const identityTokens = distinctiveProductTokens(
    requestedBase,
    options?.shelfType,
  );
  if (identityTokens.length === 0) return false;

  const catalogTokenSet = new Set(
    distinctiveProductTokens(catalogTitle, options?.shelfType),
  );
  const leadMatch = identityTokens.some((token) =>
    titleTokenPresentInSet(token, catalogTokenSet),
  );
  if (!leadMatch) return false;

  return priceListingSharesItemIdentity(requestedName, catalogTitle, options);
}

export function priceListingSharesItemIdentity(
  itemName: string,
  listingName: string,
  options?: PriceListingIdentityOptions,
): boolean {
  if (
    listingLooksLikeMerchAccessory(listingName, {
      shelfType: options?.shelfType,
    }) &&
    !listingLooksLikeMerchAccessory(itemName, { shelfType: options?.shelfType })
  ) {
    return false;
  }
  if (
    listingAddsUnrequestedControllerAccessory(itemName, listingName, {
      shelfType: options?.shelfType,
    })
  ) {
    return false;
  }
  if (
    listingAddsUnrequestedConsoleSystem(itemName, listingName, {
      shelfType: options?.shelfType,
    })
  ) {
    return false;
  }
  if (
    catalogTitleOmitsRequestedProductIdentity(itemName, listingName, options)
  ) {
    return false;
  }

  // Hardware: one residual gate shared with metadata links + gallery titles.
  // Residual `uncertain` must NOT fall through to soft brand-token matching —
  // that accepts "Nintendo DS" ↔ Nintendogs / DSi / 3DS via a lone "nintendo".
  if (options?.shelfType === "hardware") {
    return hardwareProductTitlesAlign(itemName, listingName);
  }

  const itemTokens = distinctiveProductTokens(itemName, options?.shelfType);
  const listingTokens = stripLeadingMarketplacePriceTokens(
    distinctiveProductTokens(listingName, options?.shelfType),
  );
  // Never treat empty token bags as universal match on hardware — console
  // names used to collapse to [] after stripping platforms and accept anything.
  if (itemTokens.length === 0 || listingTokens.length === 0) {
    return options?.shelfType !== "hardware";
  }
  if (options?.shelfType === "hardware") {
    if (itemTokens.length === 1 || listingTokens.length === 1) {
      const shorter = itemTokens.length === 1 ? itemTokens : listingTokens;
      const longerSet = new Set(
        itemTokens.length === 1 ? listingTokens : itemTokens,
      );
      return shorter.every((token) => titleTokenPresentInSet(token, longerSet));
    }
  } else if (itemTokens.length === 1 || listingTokens.length === 1) {
    return true;
  }

  let prefixLen = identityTokenPrefixLength(itemTokens, listingTokens);
  if (prefixLen >= 1) {
    if (options?.shelfType === "hardware") {
      const missingPlatform = itemTokens.filter(
        (token) =>
          HARDWARE_PLATFORM_IDENTITY_TOKENS.has(token) &&
          !titleTokenPresentInSet(token, new Set(listingTokens)),
      );
      if (missingPlatform.length > 0) return false;
    }
    return true;
  }

  const itemTokenSet = new Set(itemTokens);
  const listingTokenSet = new Set(listingTokens);
  const listingIssue = volumeNumberFromPriceListing(itemName, listingName);
  const onlyItem = itemTokens.filter(
    (token) =>
      !titleTokenPresentInSet(token, listingTokenSet) &&
      !volumeDistinctiveTokenMatchesIssue(token, listingIssue),
  );
  const onlyListing = listingTokens.filter(
    (token) => !titleTokenPresentInSet(token, itemTokenSet),
  );

  if (
    options?.shelfType === "hardware" &&
    onlyItem.some((token) => HARDWARE_PLATFORM_IDENTITY_TOKENS.has(token))
  ) {
    return false;
  }

  return !(onlyItem.length > 0 && onlyListing.length > 0);
}

export function isNameOnlyRetailerTitleMatch(
  query: string,
  title: string,
  options?: PriceListingIdentityOptions,
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
  // Hardware: residual identity is the hard gate (games spinoffs, Mini/Classic
  // remakes, generation upgrades). Soft similarity alone accepts Switch Sports.
  if (options?.shelfType === "hardware") {
    if (
      !priceListingSharesItemIdentity(trimmedQuery, trimmedTitle, options)
    ) {
      return false;
    }
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
