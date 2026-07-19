/**
 * Shared identity-noise taxonomies for residual matching and title gates.
 * Prefer registry / listingTerms over parallel word lists.
 */
import { normalizeForTokens } from "@/core/enrich/titles/normalize";
import { VOLUME_KEYWORD_PATTERN } from "@/core/enrich/titles/volumeNumber";
import {
  GAME_EDITION_TERMS,
  LISTING_DISCARD_PACKAGING_NOUNS,
  LISTING_EDITION_PACKAGING_EXTRA_TERMS,
  LISTING_REGION_TERMS,
} from "@/core/identify/listingTerms";
import {
  VIDEO_GAME_PLATFORM_TERMS,
  VIDEO_GAME_PLATFORM_TOKEN_TERMS,
} from "@/core/identify/platforms/platforms";

/**
 * Closed function-word taxonomy (articles / light prepositions).
 * Not product vocabulary.
 */
export const IDENTITY_FUNCTION_WORDS: ReadonlySet<string> = new Set([
  "a",
  "an",
  "and",
  "au",
  "aux",
  "d",
  "de",
  "des",
  "du",
  "el",
  "en",
  "et",
  "for",
  "l",
  "la",
  "le",
  "les",
  "of",
  "on",
  "or",
  "ou",
  "pour",
  "sur",
  "the",
  "un",
  "une",
  "y",
]);

/**
 * Leading articles only — safe to strip in product-line token streams.
 * Do not include conjunctions ("and" / "et"): they sit inside franchise names
 * ("Ratchet and Clank") and must stay as identity.
 */
export const IDENTITY_LEADING_ARTICLES: ReadonlySet<string> = new Set([
  "a",
  "an",
  "au",
  "aux",
  "d",
  "de",
  "des",
  "du",
  "el",
  "l",
  "la",
  "le",
  "les",
  "of",
  "the",
  "un",
  "une",
]);

/**
 * Edition packaging tokens from `GAME_EDITION_TERMS` (central taxonomy).
 * Single-token terms are kept as-is. Multi-word `… edition` phrases contribute
 * their qualifier tokens (`special edition` → `special`). Other multi-word
 * labels are compacted so fragments like `game` are not treated as noise.
 */
export const IDENTITY_EDITION_PACKAGING_TOKENS: ReadonlySet<string> = new Set(
  [...GAME_EDITION_TERMS, ...LISTING_EDITION_PACKAGING_EXTRA_TERMS].flatMap(
    (term) => {
      const normalized = normalizeForTokens(term)
        .replace(/[’‘']/g, "")
        .replace(/\s+/g, " ")
        .trim();
      if (!normalized) return [];
      const parts = normalized.split(/\s+/).filter(Boolean);
      if (parts.length === 1) return parts;
      const isEditionPhrase = parts.some(
        (t) => t === "edition" || t === "editions",
      );
      if (isEditionPhrase) {
        return parts.filter(
          (t) =>
            t !== "edition" &&
            t !== "editions" &&
            !IDENTITY_FUNCTION_WORDS.has(t),
        );
      }
      const compact = parts.join("");
      return compact.length > 2 ? [compact] : [];
    },
  ),
);

/** Platform noise from the video-game platform registry. */
export const IDENTITY_PLATFORM_NOISE_TOKENS: ReadonlySet<string> = new Set([
  ...VIDEO_GAME_PLATFORM_TOKEN_TERMS.map((t) => t.toLowerCase()),
  ...VIDEO_GAME_PLATFORM_TERMS.flatMap((term) => {
    const parts = term.split(/\s+/).filter(Boolean);
    const compact = parts.join("");
    return parts.length === 1 ? parts : compact ? [compact] : [];
  }),
]);

/**
 * Volume / issue markers — closed taxonomy mirrored from
 * `VOLUME_KEYWORD_PATTERN` (+ short forms n/no/nr/ed used in title streams).
 */
export const IDENTITY_VOLUME_STOP_WORDS: ReadonlySet<string> = new Set([
  ...VOLUME_KEYWORD_PATTERN
    .replace(/^\(\?:/, "")
    .replace(/\)$/, "")
    .split("|")
    .flatMap((alt) => {
      if (alt === "vol(?:ume)?") return ["vol", "volume", "volumes"];
      if (alt === "tome") return ["tome", "tomes"];
      if (alt === "numero") return ["numero", "numeros"];
      if (alt === "chapitre") return ["chapitre", "chapter"];
      if (alt === "partie") return ["partie", "part"];
      return [alt];
    }),
  "n",
  "no",
  "nr",
  "num",
  "ed",
  "edition",
  "editions",
]);

/**
 * Listing tokens that do not change which product is meant (DLC / connectors).
 * Do not include conjunctions ("and" / "et"): they sit inside franchise names.
 * Platforms come from the registry via `IDENTITY_PLATFORM_NOISE_TOKENS`.
 */
export const IDENTITY_NEUTRAL_LISTING_TOKENS: ReadonlySet<string> = new Set([
  "dlc",
  "expansion",
  "addon",
  "season",
  "pass",
  "sur",
  "on",
  "for",
]);

/**
 * Locale / listing-art packaging (not franchise product lines).
 * Region atoms from listingTerms; language names + art tokens stay closed.
 */
const IDENTITY_LANGUAGE_NAME_TOKENS = [
  "japanese",
  "japonais",
  "english",
  "anglais",
  "francais",
  "french",
  "german",
  "deutsch",
  "italian",
  "spanish",
  "korean",
  "chinese",
] as const;

const IDENTITY_ART_PACKAGING_TOKENS = [
  "multi",
  "asia",
  "visuel",
  "produit",
  "cover",
  "artwork",
  "artbook",
  "screenshot",
  "screen",
] as const;

export const IDENTITY_LISTING_PACKAGING_NOISE: ReadonlySet<string> = new Set([
  ...LISTING_REGION_TERMS.map((term) => term.toLowerCase()),
  ...IDENTITY_LANGUAGE_NAME_TOKENS,
  ...IDENTITY_ART_PACKAGING_TOKENS,
  ...LISTING_DISCARD_PACKAGING_NOUNS.filter((term) => !/\s/.test(term)).map(
    (term) => term.toLowerCase(),
  ),
]);

export function isIdentityEditionPackagingToken(token: string): boolean {
  return IDENTITY_EDITION_PACKAGING_TOKENS.has(token.toLowerCase());
}

export function isIdentityFunctionWord(token: string): boolean {
  return IDENTITY_FUNCTION_WORDS.has(token.toLowerCase());
}

/**
 * Stoplist for “distinctive” title tokens — function words + thin domain chrome.
 * Shared by evidence + ScreenScraper (lives here to avoid provider↔evidence cycles).
 */
export const GENERIC_TITLE_TOKENS: ReadonlySet<string> = new Set([
  ...IDENTITY_FUNCTION_WORDS,
  "with",
  "jeu",
  "game",
  "jeux",
  "games",
  "edition",
  "version",
]);

export function isIdentityPlatformNoiseToken(token: string): boolean {
  return IDENTITY_PLATFORM_NOISE_TOKENS.has(token.toLowerCase());
}

export function isIdentityVolumeStopWord(token: string): boolean {
  return IDENTITY_VOLUME_STOP_WORDS.has(token.toLowerCase());
}

export function isIdentityNeutralListingToken(token: string): boolean {
  const lower = token.toLowerCase();
  return (
    IDENTITY_NEUTRAL_LISTING_TOKENS.has(lower) ||
    IDENTITY_PLATFORM_NOISE_TOKENS.has(lower)
  );
}

export function isIdentityListingPackagingNoise(token: string): boolean {
  return IDENTITY_LISTING_PACKAGING_NOISE.has(token.toLowerCase());
}
