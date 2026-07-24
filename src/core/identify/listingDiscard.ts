/**
 * Reverse-meaning listing discard — structural rules, not an open product word list.
 *
 * "Boîtier seul" / "no game" change *what is being sold*; consensus/IDF cannot
 * catch that. Prefer noun taxonomies + seul/only/vide/sans/pas-de patterns.
 *
 * Packaging pairs ("notice + jaquette") only discard when little product
 * identity remains — a complete game listing that also says "notice livret"
 * must stay.
 *
 * @see docs/word_list_audit.md
 */
import { normalizeForTokens } from "@/core/enrich/titles/normalize";
import {
  LISTING_DISCARD_MEDIA_NOUNS,
  LISTING_DISCARD_PACKAGING_NOUNS,
} from "@/core/identify/listingTerms";
import { SITE_TAGLINE_RE } from "@/core/identify/listingChrome";
import { createVideoGamePlatformMatcher } from "@/core/identify/platforms/platforms";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeDiscardText(value: string): string {
  return normalizeForTokens(value)
    .replace(/[’']/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function joinAlternation(terms: readonly string[]): string {
  return [...terms]
    .map((term) =>
      term
        .split(/\s+/)
        .map(escapeRegExp)
        .join("\\s+"),
    )
    .sort((a, b) => b.length - a.length)
    .join("|");
}

const MEDIA_ALT = joinAlternation(LISTING_DISCARD_MEDIA_NOUNS);
const PACKAGING_ALT = joinAlternation(LISTING_DISCARD_PACKAGING_NOUNS);

const MISSING_MEDIA_RE = new RegExp(
  `\\b(?:(?:pas\\s+de|sans|no)\\s+(?:${MEDIA_ALT})|(?:${MEDIA_ALT})\\s+non\\s+(?:inclus|fourni))\\b`,
  "i",
);

const SOLO_OR_EMPTY_PACKAGING_RE = new RegExp(
  `\\b(?:(?:${PACKAGING_ALT})\\s+(?:seul|seule|only|vide)|(?:empty)\\s+(?:${PACKAGING_ALT})|(?:${PACKAGING_ALT})\\s+de\\s+jeu\\s+(?:seul|seule))\\b`,
  "i",
);

const PACKAGING_PAIR_RE = new RegExp(
  `\\b(?:${PACKAGING_ALT})\\s*(?:et|\\+|\\s)\\s*(?:${PACKAGING_ALT})\\b`,
  "i",
);

const PACKAGING_TOKEN_RE = new RegExp(`\\b(?:${PACKAGING_ALT})\\b`, "gi");
const PLATFORM_PHRASE_MATCHER = createVideoGamePlatformMatcher("gi");

/** Multi-game marketplace lots that are not a single SKU. */
const MULTI_GAME_LOT_COUNT_RE = /\b(?:lot|pack)\s+\d+\s+jeux?\b/i;
const MULTI_GAME_LOT_PLATFORM_RE = /\b\d+\s+jeux?\s+/i;

function isMultiGameLotListing(normalized: string): boolean {
  if (MULTI_GAME_LOT_COUNT_RE.test(normalized)) return true;
  if (!MULTI_GAME_LOT_PLATFORM_RE.test(normalized)) return false;
  PLATFORM_PHRASE_MATCHER.lastIndex = 0;
  const afterCount = normalized.replace(/^\D*\d+\s+jeux?\s+/i, "");
  return PLATFORM_PHRASE_MATCHER.test(afterCount.split(/\s+/).slice(0, 4).join(" "));
}


/**
 * Packaging-pair listings discard only when the title is mostly accessories.
 * "Mario Kart Wii notice livret" keeps two+ product tokens after stripping.
 */
function packagingPairLacksProductIdentity(normalized: string): boolean {
  if (!PACKAGING_PAIR_RE.test(normalized)) return false;

  const remainder = normalized
    .replace(PACKAGING_TOKEN_RE, " ")
    .replace(PLATFORM_PHRASE_MATCHER, " ")
    .replace(/\b(?:et|avec|sans|plus|complet|complete|neuf|loose|occasion)\b/gi, " ")
    .replace(/\+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const significant = remainder
    .split(/\s+/)
    .filter((token) => token.length >= 3 || /^\d+$/.test(token));
  return significant.length < 2;
}

export function isListingDiscardable(title: string): boolean {
  const normalized = normalizeDiscardText(title);
  if (!normalized) return false;

  if (SITE_TAGLINE_RE.test(normalized)) return true;
  if (MISSING_MEDIA_RE.test(normalized)) return true;
  if (SOLO_OR_EMPTY_PACKAGING_RE.test(normalized)) return true;
  if (packagingPairLacksProductIdentity(normalized)) return true;
  if (isMultiGameLotListing(normalized)) return true;

  return false;
}
