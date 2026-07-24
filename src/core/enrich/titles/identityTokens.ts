import { normalizeForTokens } from "@/core/enrich/titles/normalize";
import {
  IDENTITY_EDITION_PACKAGING_TOKENS,
  IDENTITY_FUNCTION_WORDS,
  IDENTITY_PLATFORM_NOISE_TOKENS,
  IDENTITY_VOLUME_STOP_WORDS,
  isHardwareCatalogChromeToken,
  isIdentityListingPackagingNoise,
  isIdentityNeutralListingToken,
  isIdentityPlatformNoiseToken,
} from "@/core/enrich/titles/identityNoise";
import { VOLUME_NUMBER_SUFFIX_PATTERN } from "@/core/enrich/titles/volumeNumber";
import { createTrailingVideoGamePlatformSuffixMatcher } from "@/core/identify/platforms/platforms";

/** Closed taxonomy from shared identity volume stops (parution). */
const VOLUME_MARKER_TOKENS = IDENTITY_VOLUME_STOP_WORDS;

/**
 * Closed function-word taxonomy (articles / light prepositions).
 * Not product vocabulary — keeps "le nuage" from counting "le" as identity.
 */
const FUNCTION_WORDS = IDENTITY_FUNCTION_WORDS;

const PLATFORM_NOISE_TOKENS = IDENTITY_PLATFORM_NOISE_TOKENS;

const EDITION_PACKAGING_TOKENS = IDENTITY_EDITION_PACKAGING_TOKENS;

/** Marketplace trailing platforms ("… sur NEOGEO AES+") are not identity. */
const TRAILING_PLATFORM_SUFFIX_MATCHER =
  createTrailingVideoGamePlatformSuffixMatcher("i");

const VOLUME_MARKER_RES = [
  `\\bn[°º]?\\s*0*\\d+`,
  `\\btome\\s*0*\\d+`,
  `\\bvol\\.?\\s*0*\\d+`,
  `\\bno\\.?\\s*0*\\d+`,
].map(
  (marker) =>
    new RegExp(`${marker}(?:\\s?${VOLUME_NUMBER_SUFFIX_PATTERN})?\\b`, "gi"),
);

function isPackagingNoiseToken(
  token: string,
  shelfType?: string | null,
): boolean {
  const lower = token.toLowerCase();
  if (VOLUME_MARKER_TOKENS.has(lower)) return true;
  // Platform connectors ("sur PS4") — not articles that affect series order.
  if (lower === "sur" || lower === "on" || lower === "for") return true;
  // On hardware shelves the platform *is* the product (Switch OLED, PS5…).
  if (shelfType !== "hardware" && PLATFORM_NOISE_TOKENS.has(lower)) {
    return true;
  }
  if (shelfType === "hardware" && isHardwareCatalogChromeToken(token)) {
    return true;
  }
  if (EDITION_PACKAGING_TOKENS.has(lower)) return true;
  if (isIdentityNeutralListingToken(token)) {
    // Neutral listing includes platform tokens — keep them on hardware.
    if (shelfType === "hardware" && isIdentityPlatformNoiseToken(token)) {
      return false;
    }
    return true;
  }
  if (isIdentityListingPackagingNoise(token)) return true;
  return false;
}

/** Drop articles / T01 shorthands when judging unexplained identity. Keep digits. */
export function significantTokens(tokens: string[]): string[] {
  return tokens.filter(
    (token) =>
      !FUNCTION_WORDS.has(token.toLowerCase()) &&
      !/^t\d+[a-z]*$/i.test(token),
  );
}

/**
 * Identity tokens: keep short letters ("z") and function words for order.
 * Strip volume markers / edition packaging / platform-registry noise only.
 * Pass `shelfType: "hardware"` so console/platform tokens stay as identity.
 */
export function identityTokens(
  title: string,
  shelfType?: string | null,
): string[] {
  let withoutVolume = title;
  // Game/media shelves: drop trailing marketplace platform SKUs before
  // tokenizing so "AES+" in "… sur NEOGEO AES+" is not unexplained identity.
  if (shelfType !== "hardware") {
    withoutVolume = withoutVolume.replace(TRAILING_PLATFORM_SUFFIX_MATCHER, " ");
  }
  for (const marker of VOLUME_MARKER_RES) {
    withoutVolume = withoutVolume.replace(marker, " ");
  }
  withoutVolume = withoutVolume
    .replace(/\b(?:game\s+of\s+the\s+year|goty)(?:\s+edition)?\b/gi, " ")
    .replace(/\b(?:day\s+one|first\s+day)(?:\s+edition)?\b/gi, " ");

  return normalizeForTokens(withoutVolume)
    .replace(/[’‘']/g, "")
    .replace(/&/g, " and ")
    .split(/[^a-z0-9]+/)
    .filter(
      (token) =>
        token.length >= 1 && !isPackagingNoiseToken(token, shelfType),
    );
}
