/**
 * Product-line / variant identity tokens for title matching.
 */
import { createTrailingVideoGamePlatformSuffixMatcher } from "@/core/identify/platforms/platforms";
import {
  IDENTITY_EDITION_PACKAGING_TOKENS,
  IDENTITY_LEADING_ARTICLES,
  IDENTITY_LISTING_PACKAGING_NOISE,
  IDENTITY_PLATFORM_NOISE_TOKENS,
  IDENTITY_VOLUME_STOP_WORDS,
  isIdentityNeutralListingToken,
} from "@/core/enrich/titles/identityNoise";
import { titleTokensEquivalent } from "@/core/enrich/titles/tokenEquivalents";
import { VOLUME_NUMBER_SUFFIX_PATTERN } from "@/core/enrich/titles/volumeNumber";
import { extractBaseTitleVariant } from "@/core/enrich/titles/gameEditionVariant";

const PRODUCT_LINE_LEADING_ARTICLES = IDENTITY_LEADING_ARTICLES;

/** Edition taxonomy — shared with residual (`identityNoise` / listingTerms). */
const PRODUCT_LINE_EDITION_TOKENS = IDENTITY_EDITION_PACKAGING_TOKENS;

/**
 * Platform tokens from the shared platform registry (keys + single-token /
 * compacted aliases). No parallel xboxone/ps5 list here.
 */
const PLATFORM_PRODUCT_LINE_NOISE_TOKENS = IDENTITY_PLATFORM_NOISE_TOKENS;

const TRAILING_PLATFORM_SUFFIX_MATCHER =
  createTrailingVideoGamePlatformSuffixMatcher("i");

export function stripTrailingPlatformSuffix(title: string): string {
  return title.replace(TRAILING_PLATFORM_SUFFIX_MATCHER, "").trim();
}

/** Region / listing-art packaging (not franchise product lines). */
const PRODUCT_LINE_PACKAGING_NOISE = IDENTITY_LISTING_PACKAGING_NOISE;

export function isProductLineContextNoiseToken(token: string): boolean {
  const lower = token.toLowerCase();
  if (isNeutralListingToken(lower)) return true;
  if (PRODUCT_LINE_LEADING_ARTICLES.has(lower)) return true;
  if (PRODUCT_LINE_EDITION_TOKENS.has(lower)) return true;
  if (PLATFORM_PRODUCT_LINE_NOISE_TOKENS.has(lower)) return true;
  if (PRODUCT_LINE_PACKAGING_NOISE.has(lower)) return true;
  return false;
}

/** Drop Day One / GOTY / Deluxe packaging before comparing product-line suffixes. */
export function stripProductLinePackaging(title: string): string {
  const withoutPackaging = title
    .replace(/\b(?:day\s+one|first\s+day)(?:\s+edition)?\b/gi, " ")
    .replace(/\b(?:game\s+of\s+the\s+year|goty)(?:\s+edition)?\b/gi, " ");
  return extractBaseTitleVariant(withoutPackaging) || withoutPackaging;
}

function productLineIdentityTokens(title: string): string[] {
  return variantIdentityTokens(stripProductLinePackaging(title)).filter(
    (token) => !isProductLineContextNoiseToken(token),
  );
}

/**
 * True when the request names a specific product line after a shared franchise
 * root (Repentance, Night Springs, RePOP…) that the catalog row does not share
 * (Afterbirth+, base game, The Lake House…).
 *
 * Structural: ordered token prefix ≥ 2, then unshared request suffix — no
 * per-product vocabulary.
 */
export function gameProductIdentityMismatch(
  requestedNames: string[],
  catalogTitle: string,
): boolean {
  const catalog = productLineIdentityTokens(catalogTitle);
  if (catalog.length === 0) return false;

  return requestedNames.some((name) => {
    const requested = productLineIdentityTokens(name);
    if (requested.length === 0) return false;

    let prefix = 0;
    while (
      prefix < requested.length &&
      prefix < catalog.length &&
      titleTokensEquivalent(requested[prefix], catalog[prefix])
    ) {
      prefix += 1;
    }
    // Cross-language / unrelated titles share no root — defer to similarity.
    if (prefix === 0) return false;
    // Require a multi-token franchise root so "Pokemon Yellow" vs "Pokemon"
    // is not treated as an expansion mismatch (single-token series names).
    if (prefix < 2) return false;

    const requestSuffix = requested.slice(prefix);
    if (requestSuffix.length === 0) return false;

    const catalogSuffix = catalog.slice(prefix);
    // Only sibling product lines conflict (Repentance vs Afterbirth+). A shorter
    // catalog title with no suffix is incomplete marketing text / base SKU — not
    // a conflicting expansion (and must not wipe retailer galleries).
    if (catalogSuffix.length === 0) return false;

    // Short DLC/expansion tags only. Longer unshared suffixes are often
    // cross-language subtitles ("Revenant Kingdom" vs "L'avénement…"), not
    // sibling product lines.
    if (requestSuffix.length > 2 || catalogSuffix.length > 2) return false;

    return !requestSuffix.some((token) =>
      catalogSuffix.some((other) => titleTokensEquivalent(token, other)),
    );
  });
}

/** Requested title ends with a known edition qualifier (Limited, Deluxe, etc.). */
const VARIANT_ALIGNMENT_STOP_WORDS = IDENTITY_VOLUME_STOP_WORDS;

/** Listing tokens that do not change which product is meant (not platforms). */
function isNeutralListingToken(token: string): boolean {
  return isIdentityNeutralListingToken(token);
}

export function normalizeMetadataCandidateTitle(title: string): string {
  return stripTrailingPlatformSuffix(title)
    .replace(/\bdlc\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const VARIANT_VOLUME_MARKER_RES = [
  `\\bn[°º]?\\s*0*\\d+`,
  `\\btome\\s*0*\\d+`,
  `\\bvol\\.?\\s*0*\\d+`,
  `\\bno\\.?\\s*0*\\d+`,
].map(
  (marker) =>
    new RegExp(`${marker}(?:\\s?${VOLUME_NUMBER_SUFFIX_PATTERN})?\\b`, "gi"),
);

export function variantIdentityTokens(title: string): string[] {
  let withoutVolume = title;
  for (const marker of VARIANT_VOLUME_MARKER_RES) {
    withoutVolume = withoutVolume.replace(marker, " ");
  }
  return withoutVolume
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(
      (token) =>
        token.length >= 1 &&
        !VARIANT_ALIGNMENT_STOP_WORDS.has(token) &&
        !/^\d+$/.test(token),
    );
}
