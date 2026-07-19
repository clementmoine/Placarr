import levenshtein from "fast-levenshtein";

import { cleanSearchQuery } from "@/core/enrich/search/query";
import { moveTrailingSortArticleToFront } from "@/core/enrich/titles/sort";
import {
  createVideoGamePlatformMatcher,
  VIDEO_GAME_PLATFORM_TERMS,
} from "@/core/identify/platforms/platforms";
import {
  GAME_EDITION_TERMS,
  LISTING_CALENDAR_MONTH_TERMS,
  LISTING_CONDITION_TERMS,
  LISTING_EDITION_PACKAGING_EXTRA_TERMS,
  LISTING_FORMAT_TERMS,
  LISTING_NOISE_TERMS,
  LISTING_NON_GAME_MEDIA_TERMS,
  LISTING_PUBLISHER_SUFFIX_TERMS,
  LISTING_REGION_TERMS,
  containsGameOfTheYearEdition,
} from "@/core/identify/listingTerms";
import { isListingMetadataSegment } from "@/core/identify/listingMetadata";
import { isLotListing } from "@/core/identify/listingLot";
import {
  CATALOG_SKU_RE,
  ERA_ADJECTIVE_TERMS,
  LEADING_AGE_ADJECTIVE_RE,
  LEADING_PACK_RE,
  MARKETING_STICKER_RE,
  MEDIA_CATEGORY_LEADING_RE,
  stripSellerListingChrome,
} from "@/core/identify/listingChrome";
import {
  BOARDGAME_CATEGORY_CHROME_RE,
  BUNDLE_PERIPHERAL_RE,
  listingLooksLikeGameAccessory,
  listingLooksLikeMerchAccessory,
  listingLooksLikeNonBookProduct,
} from "@/core/identify/listingMerch";
import {
  IDENTITY_FUNCTION_WORDS,
  IDENTITY_PLATFORM_NOISE_TOKENS,
  IDENTITY_VOLUME_STOP_WORDS,
} from "@/core/enrich/titles/identityNoise";
import {
  explicitVolumeNumbers,
  volumeNumberFromPriceListing,
  volumeNumberFromTitle,
} from "@/core/enrich/titles/volumeNumber";
import { normalizeForTokens } from "@/core/enrich/titles/normalize";
import { parseRomanToken } from "@/core/enrich/titles/romanNumeral";
import { englishNumberWordToDigits } from "@/core/enrich/titles/numberWords";
import { priceListingSharesItemIdentity } from "@/core/commerce/retailer/titleMatch";

export { moveTrailingSortArticleToFront } from "@/core/enrich/titles/sort";
export { normalizeForTokens } from "@/core/enrich/titles/normalize";
export { isListingDiscardable } from "@/core/identify/listingDiscard";
export { isLotListing } from "@/core/identify/listingLot";
export {
  listingLooksLikeGameAccessory,
  listingLooksLikeMerchAccessory,
  listingLooksLikeNonBookProduct,
} from "@/core/identify/listingMerch";

export function getSequelIndicators(normStr: string): Set<string> {
  const tokens = normStr.split(/[^a-z0-9]+/).filter(Boolean);
  const indicators = new Set<string>();
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!;
    const next = tokens[i + 1];
    const gluedSuffix = token.match(/^(\d+)(bis|ter|quater)$/i);
    if (gluedSuffix) {
      indicators.add(
        `${Number.parseInt(gluedSuffix[1]!, 10)}${gluedSuffix[2]!.toLowerCase()}`,
      );
      continue;
    }
    if (/^\d+$/.test(token)) {
      const num = Number.parseInt(token, 10);
      if (num >= 1900 && num <= 2099) {
        continue;
      }
      if (next && /^(bis|ter|quater)$/i.test(next)) {
        indicators.add(`${num}${next.toLowerCase()}`);
        i++;
        continue;
      }
      indicators.add(String(num));
      continue;
    }
    const roman = parseRomanToken(token);
    if (roman != null && roman >= 1 && roman <= 99) {
      indicators.add(String(roman));
    } else {
      const fromWord = englishNumberWordToDigits(token);
      if (fromWord) indicators.add(fromWord);
    }
  }
  return indicators;
}

function escapeRegExp(string: string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const SUFFIX_PATTERNS = Array.from(
  new Set([
    ...VIDEO_GAME_PLATFORM_TERMS,
    ...LISTING_FORMAT_TERMS,
    ...LISTING_CONDITION_TERMS,
    ...LISTING_NOISE_TERMS,
    ...LISTING_PUBLISHER_SUFFIX_TERMS,
    ...GAME_EDITION_TERMS,
    ...LISTING_EDITION_PACKAGING_EXTRA_TERMS,
    ...LISTING_REGION_TERMS,
    ...ERA_ADJECTIVE_TERMS,
  ]),
);

const PLATFORM_SUFFIX_PATTERNS = new Set<string>(VIDEO_GAME_PLATFORM_TERMS);
const EDITION_SUFFIX_PATTERNS = new Set<string>([
  ...GAME_EDITION_TERMS,
  ...LISTING_EDITION_PACKAGING_EXTRA_TERMS,
]);

// Noise terms valid as leading prefixes but meaningful as a trailing title
// word ("… The Arcade Game"). Short function-word connectors (pour/for) stay
// stripable as suffixes.
const SUFFIX_EXCLUDED_NOISE = new Set(
  LISTING_NOISE_TERMS.filter((term) => {
    if (/\s/.test(term) || term.length > 4) return false;
    return !IDENTITY_FUNCTION_WORDS.has(term);
  }),
);

function stripListingMetadataSegments(value: string): string {
  const parts = value
    .split(/\s*[-–—|]+\s*/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length <= 1) return value;

  let start = 0;
  let end = parts.length;

  while (start < end && isListingMetadataSegment(parts[start]!)) start += 1;
  while (end > start && isListingMetadataSegment(parts[end - 1]!)) end -= 1;

  const kept = parts.slice(start, end);
  return kept.length > 0 ? kept.join(" - ") : value;
}

function joinTermAlternation(terms: readonly string[]): string {
  return [...terms]
    .map((term) =>
      term
        .split(/\s+/)
        .map(escapeRegExp)
        .join("\\s+"),
    )
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)
    .join("|");
}

const PLATFORM_PHRASE_ALT = joinTermAlternation(VIDEO_GAME_PLATFORM_TERMS);
const LEADING_JEU_PLATFORM_RE = PLATFORM_PHRASE_ALT
  ? new RegExp(
      `^(?:jeux?\\s+(?:video\\s+)?(?:${PLATFORM_PHRASE_ALT})|jeux?\\s+console)\\b\\s*`,
      "i",
    )
  : /$a/;
const TRAILING_CONNECTOR_ALT = [...IDENTITY_FUNCTION_WORDS]
  .filter((word) => (LISTING_NOISE_TERMS as readonly string[]).includes(word))
  .sort((a, b) => b.length - a.length)
  .map(escapeRegExp)
  .join("|");
const TRAILING_FORMAT_CARRIER_ALT = joinTermAlternation(
  LISTING_NON_GAME_MEDIA_TERMS.filter((term) => !/\s/.test(term)),
);
const SHORT_REGION_ALT = joinTermAlternation(
  LISTING_REGION_TERMS.filter((term) => !/\s/.test(term) && term.length <= 3),
);
const PUBLISHER_ALT = joinTermAlternation(LISTING_PUBLISHER_SUFFIX_TERMS);

/**
 * Strip a leading publisher when enough product identity remains.
 * Single short remainder ("Nintendo Land" → "Land") is kept intact.
 */
function stripLeadingPublisherChrome(value: string): string {
  if (!PUBLISHER_ALT) return value;
  const match = value.match(
    new RegExp(`^(?:${PUBLISHER_ALT})\\s+(.+)$`, "i"),
  );
  if (!match?.[1]) return value;
  const rest = match[1].trim();
  const tokens = rest.split(/\s+/).filter(Boolean);
  // Keep "Atari 2600 …" intact so platform-prefix stripping can consume the
  // full platform phrase (publisher + model number).
  if (tokens[0] && /^\d{3,}$/.test(tokens[0])) return value;
  if (tokens.length >= 2) return rest;
  if (tokens.length === 1 && tokens[0]!.length >= 6) return rest;
  return value;
}

/**
 * Strip a trailing publisher when the stem still has ≥2 tokens.
 * "… Red Mask Space Cowboys" → drop studio tail without naming it.
 */
function stripTrailingPublisherChrome(value: string): string {
  if (!PUBLISHER_ALT) return value;
  const match = value.match(
    new RegExp(`^(.+?)\\s+(?:${PUBLISHER_ALT})\\s*$`, "i"),
  );
  if (!match?.[1]) return value;
  const stem = match[1].trim();
  const tokens = stem.split(/\s+/).filter(Boolean);
  if (tokens.length >= 2) return stem;
  return value;
}

function stripListingChromeNoise(value: string): string {
  let cleaned = value;
  let prev = "";
  // Publisher / category chrome can be stacked on either side — peel until stable.
  while (cleaned !== prev) {
    prev = cleaned;
    cleaned = cleaned
      .replace(
        new RegExp(
          `^(?:${BOARDGAME_CATEGORY_CHROME_RE.source})\\s*[-–—:|]?\\s*`,
          "i",
        ),
        "",
      )
      .replace(
        new RegExp(
          `(?:\\s+(?:${BOARDGAME_CATEGORY_CHROME_RE.source}))+$`,
          "i",
        ),
        "",
      )
      .replace(LEADING_AGE_ADJECTIVE_RE, "")
      .trim();
    cleaned = stripLeadingPublisherChrome(cleaned);
    cleaned = stripTrailingPublisherChrome(cleaned);
  }

  cleaned = cleaned
    .replace(
      SHORT_REGION_ALT
        ? new RegExp(`\\s+\\b(?:${SHORT_REGION_ALT})\\b\\s*$`, "i")
        : /$a/,
      "",
    )
    // Completeness + connector + platform (complet required — avoids
    // "pour PC" mid-title wiping Ghost Recon / Xbox consensus).
    .replace(
      new RegExp(
        `\\s+\\b(?:complet|complete)\\s+(?:sur|pour|for)\\s+(?:nintendo\\s+)?(?:${PLATFORM_PHRASE_ALT})\\b.*$`,
        "i",
      ),
      "",
    )
    .replace(
      new RegExp(
        `\\s+\\bjeux?\\s+(?:nintendo\\s+)?(?:${PLATFORM_PHRASE_ALT})\\b.*$`,
        "i",
      ),
      "",
    )
    .replace(/\s+\bpal\b\s*(?:jeux?)?\b.*$/i, "")
    .replace(
      new RegExp(`\\bnintendo\\s+(?:${PLATFORM_PHRASE_ALT})\\s*$`, "i"),
      "",
    )
    .replace(
      new RegExp(
        `\\s+\\bnintendo\\s+(?:${PLATFORM_PHRASE_ALT})\\b\\s*(?:${SHORT_REGION_ALT || "a^"})?\\s*$`,
        "i",
      ),
      "",
    )
    .replace(
      TRAILING_FORMAT_CARRIER_ALT
        ? new RegExp(
            `\\s+\\b(?:${TRAILING_FORMAT_CARRIER_ALT})\\b\\s*$`,
            "i",
          )
        : /$a/,
      "",
    )
    .replace(MARKETING_STICKER_RE, "")
    .replace(
      TRAILING_CONNECTOR_ALT
        ? new RegExp(`\\b(?:${TRAILING_CONNECTOR_ALT})\\s*$`, "i")
        : /$a/,
      "",
    )
    .trim();

  cleaned = cleaned.replace(CATALOG_SKU_RE, "");
  return cleaned.replace(/\s+/g, " ").trim();
}

function stripAccessorySegments(value: string): string {
  return value
    .replace(
      new RegExp(
        `\\s*(?:\\+|\\bet\\b|\\bavec\\b|\\bsans\\b)\\s*(?:wii\\s+)?(?:${BUNDLE_PERIPHERAL_RE.source})\\b.*$`,
        "i",
      ),
      "",
    )
    .replace(
      new RegExp(
        `\\s*\\+\\s*jeux?\\s+wii\\s*\\+\\s*(?:${BUNDLE_PERIPHERAL_RE.source})\\b.*$`,
        "i",
      ),
      " Wii",
    )
    .replace(/\s*\+\s*jeux?\s*$/i, "")
    .trim();
}

export function cleanTitleForDisplay(
  name: string,
  options: {
    preservePlatformSuffix?: boolean;
    // Keep edition/budget-line words ("Classics", "Nintendo Selects"…) that are
    // part of an authoritative title ("Gottlieb Pinball Classics"), instead of
    // stripping them as listing noise. Set for canonical/trusted sources.
    preserveEditionTerms?: boolean;
    /** Canonical/trusted clean titles that affirm a leading platform prefix as integral. */
    preserveLeadingPrefixesAffirmedBy?: string[];
  } = {},
): string {
  if (!name) return name;

  let cleaned = name.trim();

  // Replace escaped SQL single quotes or doubled single quotes with a single quote
  cleaned = cleaned.replace(/''/g, "'");

  // Strip emoji / pictographs / dingbats / arrows and stray double-quotes that
  // marketplace listings sprinkle into titles ("Laserdisc📀 …", '… " WALT DISNEY "').
  // They defeat canonical name lookups (TMDB/IGDB) and title scoring. Apostrophes
  // are preserved.
  cleaned = cleaned
    .replace(
      /[\u{1F000}-\u{1FAFF}\u{2190}-\u{21FF}\u{2300}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE00}-\u{FE0F}\u{200D}]/gu,
      " ",
    )
    .replace(/["“”«»]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Media-format and disc-count noise that the suffix/prefix lists miss because
  // it sits mid-title: "Laserdisc", "1 disque", "2 discs", "Coffret 3 DVD"…
  cleaned = cleaned
    .replace(/\blaser\s?disc\b/gi, " ")
    .replace(
      /\b\d+\s*(?:disques?|discs?|cd|dvd|blu-?rays?|vhs|k7|cassettes?|vinyles?|lps?)\b/gi,
      " ",
    )
    .replace(/^(?:jeux?\s+)?vid[eé]o(?:\s+(?:pc|console))?\b[\s:–—\-|]*/i, "")
    .replace(/\s+/g, " ")
    .trim();

  // Remove wrapping quotes if they match
  if (
    (cleaned.startsWith("'") && cleaned.endsWith("'")) ||
    (cleaned.startsWith('"') && cleaned.endsWith('"'))
  ) {
    cleaned = cleaned.slice(1, -1).trim();
  }

  // Remove parenthesized/bracketed metadata first if it contains suffix words
  const bracketRegex = /[\s\-]*[([][^)]*[\])]/g;
  cleaned = cleaned.replace(bracketRegex, (match) => {
    const inner = match
      .replace(/[()[\]]/g, "")
      .toLowerCase()
      .trim();
    const isMetadata = SUFFIX_PATTERNS.some((p) => {
      const regex = new RegExp(`\\b${escapeRegExp(p)}\\b`, "i");
      return regex.test(inner);
    });
    return isMetadata ? "" : match;
  });
  cleaned = moveTrailingSortArticleToFront(cleaned);

  // Bare "game"/"jeu" are stripped as LEADING listing noise (PREFIX_PATTERNS),
  // but as a trailing word they are usually part of the real title ("… The
  // Arcade Game", "End Game", "War Game"), so never strip them as a suffix.
  const suffixPatterns = (
    options.preservePlatformSuffix
      ? SUFFIX_PATTERNS.filter(
          (pattern) => !PLATFORM_SUFFIX_PATTERNS.has(pattern),
        )
      : SUFFIX_PATTERNS
  )
    .filter((pattern) => !SUFFIX_EXCLUDED_NOISE.has(pattern))
    .filter(
      (pattern) =>
        !options.preserveEditionTerms || !EDITION_SUFFIX_PATTERNS.has(pattern),
    );
  const suffixRegex = new RegExp(
    `\\s*\\b(?:${suffixPatterns.map((p) => escapeRegExp(p)).join("|")})\\b\\s*$`,
    "i",
  );

  // Match 4-digit years at the end (optionally preceded by typical separators or publishers)
  const publisherYearAlt = LISTING_PUBLISHER_SUFFIX_TERMS.map(escapeRegExp).join(
    "|",
  );
  const yearSuffixRegex = new RegExp(
    `\\s*(?:[\\-–|/()\\[\\]]|\\b(?:${publisherYearAlt}))\\s*\\b(?:19|20)\\d{2}\\b\\s*$`,
    "i",
  );

  const PREFIX_PATTERNS = [...LISTING_NOISE_TERMS, ...LISTING_FORMAT_TERMS];

  const prefixRegex = new RegExp(
    `^(?:${PREFIX_PATTERNS.map((p) => escapeRegExp(p)).join("|")})\\b`,
    "i",
  );

  let prev;
  do {
    prev = cleaned;
    // Clean leading/trailing punctuation and spaces first
    cleaned = cleaned
      .replace(/^[\s+\-,.:;()/[\]\\]+/, "")
      .replace(/[\s+\-,.:;()/[\]\\]+$/, "")
      .trim();
    cleaned = stripAccessorySegments(cleaned);
    cleaned = stripListingMetadataSegments(cleaned);
    cleaned = stripListingChromeNoise(cleaned);
    cleaned = stripSellerListingChrome(cleaned);

    // Remove wrapping quotes if they match
    if (
      (cleaned.startsWith("'") && cleaned.endsWith("'")) ||
      (cleaned.startsWith('"') && cleaned.endsWith('"'))
    ) {
      cleaned = cleaned.slice(1, -1).trim();
    }
    cleaned = moveTrailingSortArticleToFront(cleaned);
    cleaned = stripLeadingPlatformPrefix(cleaned, {
      preservePlatformSuffix: options.preservePlatformSuffix,
      preserveLeadingPrefixesAffirmedBy:
        options.preserveLeadingPrefixesAffirmedBy,
    });

    // Strip trailing suffix
    cleaned = cleaned
      .replace(suffixRegex, (match, offset, fullValue) => {
        const beforeMatch = normalizeForTokens(
          fullValue.slice(0, offset).trim(),
        );
        const suffix = normalizeForTokens(match.trim());
        const isOrdinalEdition =
          /(?:\d+(?:e|eme|er|re|th|st|nd|rd)?|[ivxlcdm]{1,5})\s*$/i.test(
            beforeMatch,
          ) && /^e?dition\b/.test(suffix);

        return isOrdinalEdition ? match : "";
      })
      .trim();
    // Strip trailing year suffix
    cleaned = cleaned.replace(yearSuffixRegex, "").trim();
    // Strip leading prefix (phrase list + structural pack / category / jeu+platform)
    cleaned = cleaned
      .replace(LEADING_PACK_RE, "")
      .replace(MEDIA_CATEGORY_LEADING_RE, "")
      .replace(LEADING_JEU_PLATFORM_RE, "")
      .replace(prefixRegex, "")
      .trim();
  } while (cleaned !== prev);

  // Clean any remaining leading/trailing punctuation and double whitespaces
  cleaned = cleaned
    .replace(/^[\s+\-,.:;()/[\]\\]+/, "")
    .replace(/[\s+\-,.:;()/[\]\\]+$/, "")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned || name;
}

const PLATFORMS = VIDEO_GAME_PLATFORM_TERMS;

function leadingPlatformPrefixAffirmedByTitles(
  title: string,
  platform: string,
  affirmedTitles: string[],
): boolean {
  if (affirmedTitles.length === 0) return false;
  const prefixRegex = new RegExp(`^${escapeRegExp(platform)}\\s+(?=\\S)`, "i");
  if (!prefixRegex.test(title)) return false;
  const titleNorm = normalizeForTokens(title);
  return affirmedTitles.some((canonical) => {
    const canonicalTrimmed = canonical.trim();
    if (!canonicalTrimmed) return false;
    if (canonicalTrimmed.toLowerCase() === title.trim().toLowerCase()) {
      return true;
    }
    if (!prefixRegex.test(canonicalTrimmed)) return false;
    return normalizeForTokens(canonicalTrimmed) === titleNorm;
  });
}

function stripLeadingPlatformPrefix(
  value: string,
  options: {
    preservePlatformSuffix?: boolean;
    preserveLeadingPrefixesAffirmedBy?: string[];
  } = {},
): string {
  const normalized = value.trim();
  if (!normalized) return normalized;

  const sortedPlatforms = [...PLATFORMS].sort((a, b) => b.length - a.length);

  // Catalog chrome "WII / Sports Island" — never an official title spelling.
  // Strip even under preservePlatformSuffix (canonicals are "Wii Sports", not
  // "Wii / …"). Space-separated prefixes still respect preserve / affirmation.
  for (const platform of sortedPlatforms) {
    const slashChrome = new RegExp(
      `^${escapeRegExp(platform)}\\s*[/|]+\\s*(?=\\S)`,
      "i",
    );
    if (slashChrome.test(normalized)) {
      return normalized.replace(slashChrome, "").trim();
    }
  }

  // Authoritative titles keep their official spelling — no leading platform strip.
  if (options.preservePlatformSuffix) return normalized;

  const affirmedBy = options.preserveLeadingPrefixesAffirmedBy ?? [];
  for (const platform of sortedPlatforms) {
    if (
      leadingPlatformPrefixAffirmedByTitles(normalized, platform, affirmedBy)
    ) {
      continue;
    }
    const regex = new RegExp(`^${escapeRegExp(platform)}\\s+(?=\\S)`, "i");
    if (regex.test(normalized)) {
      return normalized.replace(regex, "").trim();
    }
  }

  return normalized;
}

export function filterPlatformRedundancies(suggestions: string[]): string[] {
  return suggestions.filter((item, index) => {
    if (index === 0) return true;
    const itemLower = item.toLowerCase().trim();

    const prefixItem = suggestions.find((other) => {
      const otherLower = other.toLowerCase().trim();
      if (otherLower === itemLower || otherLower.length >= itemLower.length)
        return false;

      if (itemLower.startsWith(otherLower)) {
        const remaining = itemLower
          .slice(otherLower.length)
          .replace(/^[(\s\-]+|[)\s\-]+$/g, "")
          .trim();
        return PLATFORMS.includes(remaining);
      }
      return false;
    });

    return !prefixItem;
  });
}

// v40: persist the compile step's structured title decision (cleanName/
// displayName/edition) in the cache so reads stop re-stripping integral edition
// terms ("Gottlieb Pinball Classics" → "Gottlieb Pinball"). Bumped so pre-v40
// rows (no structured columns, stripped rawNames) are recomputed.
// v41: équivalence de titres data-driven — la table de traduction par-produit
// est remplacée par les alternate names providers + normalisation structurelle
// (accents, consonnes doublées) ; le matching retailer/board-game devient plus
// permissif. Bump pour que les scans cachés re-résolvent avec la nouvelle règle.
// v42: classification du type "musics" pilotée par un signal registry (provider
// mono-type musique anchoré) au lieu du word-list orchestra|soundtrack|ost|…
// dans le resolver. Bump pour re-résoudre les scans cachés sans type explicite.
// v43: câblage du signal jeu-vidéo (detectVideoGameSignal) — plateforme console
// nommée dans les annonces — jusqu'ici défini mais jamais passé par le resolver ;
// promeut `games` et écrase un faux album/film homonyme. Bump pour re-résoudre.
// v44: slugs PriceCharting avec apostrophe encodée %27 (assassin%27s-creed-iii) —
// les titres à apostrophe rataient la fiche directe (404) et résolvaient sans
// les données PriceCharting. Bump pour re-résoudre ces scans.
// v45: numéros de parution suffixés à la française (n°100bis/ter/quater) —
// volumeNumberFromTitle les ignorait, donc l'alignement de numéro traitait
// n°100bis comme n°100. Bump pour re-résoudre les titres suffixés.
export const BARCODE_CACHE_VERSION = "canonical-v45";
export function versionProvider(provider: string): string {
  return provider.includes(BARCODE_CACHE_VERSION)
    ? provider
    : `${provider}+${BARCODE_CACHE_VERSION}`;
}

export {
  explicitVolumeNumbers,
  hasExplicitVolumeMarker,
  stripVolumeMarkersFromTitle,
  volumeNumberFromPriceListing,
  volumeNumberFromTitle,
} from "@/core/enrich/titles/volumeNumber";

/**
 * Checks whether a marketplace/barcode listing refers to the same numbered item
 * as the shelf entry (e.g. blocks ISBN hits for "Tome 01" on "Super Picsou n°10").
 */
export function barcodeListingMatchesAnyItemName(
  itemNames: string[],
  listingName?: string | null,
): boolean {
  const listing = listingName?.trim();
  if (!listing) return true;
  return itemNames.some((name) => barcodeListingMatchesItem(name, listing));
}

/** True when a listing names a different issue/volume than the shelf item. */
export function priceListingVolumeConflictsWithItem(
  itemNames: string[],
  listingName?: string | null,
): boolean {
  const listing = listingName?.trim();
  if (!listing) return false;
  return itemNames.some((name) => {
    const itemIssue = volumeNumberFromTitle(name);
    const listingIssue = volumeNumberFromPriceListing(name, listing);
    return Boolean(itemIssue && listingIssue && itemIssue !== listingIssue);
  });
}

function normalizeEditionSubtitleTokens(value: string): string {
  return normalizeForTokens(value)
    .replace(/\b20\s*eme\s*anniversaire\b/g, "20yearcelebration")
    .replace(/\bcelebration\s*des\s*20\s*ans\b/g, "20yearcelebration")
    .replace(
      /\b20\s*year\s*celebration(?:\s*edition)?\b/g,
      "20yearcelebration",
    );
}

function stripEditionSubtitleMarkers(value: string): string {
  return normalizeEditionSubtitleTokens(value)
    .replace(/\b20yearcelebration\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Strip marketplace noise before comparing magazine/comic price listing titles. */
export function normalizePriceListingForComparison(value: string): string {
  let text = value
    .replace(/^\s*(?:\w{3}\d{2}\s*--\s*)+/i, "")
    .replace(/^\s*-\s*/, "")
    .replace(/\s*[/|]\s*[^/|]+$/, "")
    .replace(/^\s*(?:livre|magazine|revue|comic|bd|album)\s+/i, "")
    // Seller year tags: "annee 2005 - N° 128"
    .replace(/\bann[eé]e\s+\d{4}\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Keep through the issue marker (n° / Numéro / No.) and drop calendar/seller
  // tails: "Numéro 87 Octobre 1998", "n°081 - Occasion".
  const volumeTail = text.match(
    /^(.*?\b(?:n[°º]|n\s+|#\s*|num(?:e|é)?ro\s+|no\.?\s*)\s*0*\d+(?:\s*bis)?)\b(.*)$/i,
  );
  if (volumeTail?.[2]?.trim()) {
    text = volumeTail[1].trim();
  }

  return text.replace(/\s+/g, " ").trim();
}

/** Marketplace price rows: strict match first, then FR/EN edition subtitle variants. */
export function priceListingMatchesAnyItemName(
  itemNames: string[],
  listingName?: string | null,
): boolean {
  if (!listingName?.trim()) return true;

  const listing = listingName.trim();
  if (listingLooksLikeGameAccessory(listing)) return false;

  return itemNames.some((name) => {
    if (!priceListingSharesItemIdentity(name, listing)) {
      return false;
    }
    if (barcodeListingMatchesItem(name, listing)) return true;

    const itemIssue = volumeNumberFromTitle(name);
    const listingIssue = volumeNumberFromPriceListing(name, listing);
    if (itemIssue && listingIssue && itemIssue !== listingIssue) return false;
    if (
      listingIssue &&
      !itemIssue &&
      /\b(?:volume|vol|tome)\s*\d+\b/i.test(listing)
    ) {
      return false;
    }

    const listingForCompare = normalizePriceListingForComparison(listing);
    const itemCore = stripEditionSubtitleMarkers(name);
    const listingCore = stripEditionSubtitleMarkers(listingForCompare);
    if (!itemCore || !listingCore) return false;
    if (
      isShortSingleWordTitle(name) &&
      !shortTitleListingIsCompatible(
        normalizeForTokens(cleanSearchQuery(name) || name)
          .split(/\s+/)
          .filter(Boolean)[0] ?? "",
        listing,
      )
    ) {
      return false;
    }
    if (!tieredEditionListingMatchesItem(name, listing)) {
      return false;
    }
    return areLikelySameProduct(itemCore, listingCore);
  });
}

const PRICE_LISTING_LEADING_TOKENS = new Set([
  ...IDENTITY_FUNCTION_WORDS,
  ...IDENTITY_PLATFORM_NOISE_TOKENS,
  "jeu",
  "game",
  "jeux",
  "video",
  "edition",
  "ed",
]);

function isShortSingleWordTitle(itemName: string): boolean {
  const tokens = normalizeForTokens(cleanSearchQuery(itemName) || itemName)
    .split(/\s+/)
    .filter(Boolean);
  return tokens.length === 1 && tokens[0]!.length >= 4;
}

function shortTitleListingIsCompatible(
  itemWord: string,
  listingName: string,
): boolean {
  const listingNorm = normalizeForTokens(
    cleanSearchQuery(listingName) || listingName,
  );
  const listingTokens = listingNorm.split(/\s+/).filter(Boolean);
  if (listingTokens.length === 0) return false;

  const titleIndex = listingTokens.indexOf(itemWord);
  if (titleIndex === -1) return false;

  if (titleIndex > 0) {
    const leading = listingTokens.slice(0, titleIndex);
    if (
      leading.length > 0 &&
      !leading.every((token) => PRICE_LISTING_LEADING_TOKENS.has(token))
    ) {
      return false;
    }
  }

  const trailing = listingTokens.slice(titleIndex + 1);
  if (
    trailing.some(
      (token) =>
        /^[a-z]{0,3}\d{2,}[a-z0-9]*$/i.test(token) || /^\d+l$/i.test(token),
    )
  ) {
    return false;
  }

  return true;
}

function extractTieredEditionKeys(text: string): string[] {
  const norm = normalizeForTokens(text);
  const keys: string[] = [];
  if (/\bsuper\s+deluxe\b/.test(norm)) keys.push("super deluxe");
  if (containsGameOfTheYearEdition(norm)) keys.push("goty");
  if (/\bultimate\b/.test(norm)) keys.push("ultimate");
  if (/\bdefinitive\b/.test(norm)) keys.push("definitive");
  if (/\bcollector/.test(norm)) keys.push("collector");
  if (/\bdeluxe\b/.test(norm) && !keys.includes("super deluxe")) {
    keys.push("deluxe");
  }
  return keys;
}

/** Blocks Deluxe vs Super Deluxe, base vs Deluxe, GOTY vs standard, etc. */
export function tieredEditionListingMatchesItem(
  itemName: string,
  listingName: string,
): boolean {
  const itemKeys = extractTieredEditionKeys(itemName);
  const listingKeys = extractTieredEditionKeys(listingName);
  if (itemKeys.length === 0 && listingKeys.length === 0) return true;
  if (itemKeys.length === 0 || listingKeys.length === 0) return false;

  const itemPrimary = itemKeys[0]!;
  const listingPrimary = listingKeys[0]!;
  return itemPrimary === listingPrimary;
}

export function barcodeListingMatchesItem(
  itemName: string,
  listingName?: string | null,
): boolean {
  const listing = listingName?.trim();
  if (!listing) return true;
  if (isLotListing(listing)) return false;
  if (listingLooksLikeNonBookProduct(listing)) return false;

  const itemIssue = volumeNumberFromTitle(itemName);
  const listingIssue = volumeNumberFromTitle(listing);
  if (itemIssue && listingIssue && itemIssue !== listingIssue) return false;
  if (
    listingIssue &&
    !itemIssue &&
    /\b(?:volume|vol|tome)\s*\d+\b/i.test(listing)
  ) {
    return false;
  }
  if (itemIssue && explicitVolumeNumbers(listing).length > 1) return false;

  if (!tieredEditionListingMatchesItem(itemName, listing)) {
    return false;
  }

  if (isShortSingleWordTitle(itemName)) {
    const itemWord = normalizeForTokens(cleanSearchQuery(itemName) || itemName)
      .split(/\s+/)
      .filter(Boolean)[0];
    if (!itemWord || !shortTitleListingIsCompatible(itemWord, listing)) {
      return false;
    }
  }

  return areLikelySameProduct(itemName, listing);
}

/** Console model numbers embedded in platform aliases (2600, 7800, 360…). */
const PLATFORM_MODEL_NUMBER_TOKENS = new Set(
  VIDEO_GAME_PLATFORM_TERMS.flatMap((term) =>
    term.split(/\s+/).filter((part) => /^\d{3,}$/.test(part)),
  ),
);

const PRODUCT_COMPARE_NOISE_TOKENS = new Set(
  [
    ...LISTING_NOISE_TERMS,
    ...LISTING_CONDITION_TERMS,
    ...LISTING_REGION_TERMS,
    ...LISTING_FORMAT_TERMS,
    ...ERA_ADJECTIVE_TERMS,
    ...LISTING_PUBLISHER_SUFFIX_TERMS,
    ...LISTING_CALENDAR_MONTH_TERMS,
    ...LISTING_EDITION_PACKAGING_EXTRA_TERMS,
    ...GAME_EDITION_TERMS,
    ...IDENTITY_VOLUME_STOP_WORDS,
    "cartouche",
    "retro",
    "vcs",
    "windows",
    "walt",
    "annee",
    "année",
  ].flatMap((term) =>
    normalizeForTokens(term)
      .split(/\s+/)
      .filter((token) => token.length >= 3),
  ),
);

const PLATFORM_PHRASE_MATCHER = createVideoGamePlatformMatcher("gi");

function stripPlatformPhrasesForProductCompare(value: string): string {
  return value
    .replace(PLATFORM_PHRASE_MATCHER, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sequelIndicatorsForProductCompare(normStr: string): Set<string> {
  const indicators = getSequelIndicators(
    stripPlatformPhrasesForProductCompare(normStr),
  );
  for (const model of PLATFORM_MODEL_NUMBER_TOKENS) {
    indicators.delete(model);
  }
  return indicators;
}

function significantProductCompareToken(token: string): boolean {
  // Length 3 catches short product words ("cup") while still ignoring "du"/"de".
  if (token.length < 3) return false;
  if (PRODUCT_COMPARE_NOISE_TOKENS.has(token)) return false;
  if (PLATFORM_MODEL_NUMBER_TOKENS.has(token)) return false;
  return true;
}

/** True when `needle` is a leading token prefix of `haystack`, allowing compounds. */
function productCompareTokensAreLeadingPrefix(
  needle: string[],
  haystack: string[],
): boolean {
  let i = 0;
  let j = 0;
  while (i < needle.length && j < haystack.length) {
    if (needle[i] === haystack[j]) {
      i += 1;
      j += 1;
      continue;
    }
    if (
      i + 1 < needle.length &&
      `${needle[i]}${needle[i + 1]}` === haystack[j]
    ) {
      i += 2;
      j += 1;
      continue;
    }
    if (
      j + 1 < haystack.length &&
      needle[i] === `${haystack[j]}${haystack[j + 1]}`
    ) {
      i += 1;
      j += 2;
      continue;
    }
    return false;
  }
  return i === needle.length;
}

function productCompareSpaceFoldedEqual(a: string, b: string): boolean {
  return a.replace(/\s+/g, "") === b.replace(/\s+/g, "");
}

function listingAddsDistinctSpinoffLead(
  itemNorm: string,
  listingNorm: string,
): boolean {
  if (!listingNorm.startsWith(`${itemNorm} `)) return false;
  const extras = listingNorm.slice(itemNorm.length + 1).split(/\s+/).filter(Boolean);
  const firstExtra = extras[0];
  if (!firstExtra || firstExtra.length < 4) return false;
  // Marketplace region/condition noise ("version française", "PAL", …) is not a
  // distinct product lead — unlike "Metal Slug Tactics".
  if (PRODUCT_COMPARE_NOISE_TOKENS.has(firstExtra)) return false;
  // "Remastered" / "GOTY" / "Deluxe" name the same SKU, not a spinoff product.
  if (EDITION_SUFFIX_PATTERNS.has(firstExtra)) return false;
  if (getSequelIndicators(firstExtra).size > 0) return false;

  const moreIdentity = extras.slice(1).some(
    (token) =>
      token.length >= 3 &&
      !PRODUCT_COMPARE_NOISE_TOKENS.has(token) &&
      !EDITION_SUFFIX_PATTERNS.has(token) &&
      getSequelIndicators(token).size === 0,
  );

  // Short leading marker + model/code ("Super Vehicle-001") = same SKU alias,
  // not a spinoff. Short marker alone ("Super") = series line. Longer first
  // tokens ("Tactics") or short + prose subtitle ("Road to …") = spinoff.
  if (/^[a-z]+$/i.test(firstExtra) && firstExtra.length <= 5) {
    if (!moreIdentity) return false;
    if (extras.slice(1).some((token) => /\d/.test(token))) return false;
  }
  return true;
}

/**
 * True when `longerTitle` starts with `baseTitle` then adds a distinct product
 * lead ("FIFA 2002: Road to …", "Metal Slug Tactics"). Punctuation is normalized
 * so a colon after the year does not hide the spinoff.
 */
export function listingIsDistinctProductSpinoff(
  baseTitle: string,
  longerTitle: string,
): boolean {
  const base = normalizeForTokens(cleanSearchQuery(baseTitle) || baseTitle)
    .replace(/[:;|/]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const longer = normalizeForTokens(cleanSearchQuery(longerTitle) || longerTitle)
    .replace(/[:;|/]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!base || !longer) return false;
  return listingAddsDistinctSpinoffLead(base, longer);
}

function normalizeTitleForProductCompare(value: string): string {
  return normalizeForTokens(cleanSearchQuery(value) || value)
    .replace(/[:;|/]/g, " ")
    // Join hyphenated compounds so "Spider-Man" ↔ "Spiderman".
    .replace(/-/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function productCompareTokenSets(a: string, b: string): {
  onlyA: string[];
  onlyB: string[];
  shared: string[];
} | null {
  const aNorm = normalizeTitleForProductCompare(a);
  const bNorm = normalizeTitleForProductCompare(b);
  if (!aNorm || !bNorm) return null;
  const aCompare = stripPlatformPhrasesForProductCompare(aNorm)
    .replace(/[.’']/g, " ")
    .replace(/\b(\d+)\s*(bis|ter|quater)\b/gi, "$1$2")
    .replace(/\s+/g, " ")
    .trim();
  const bCompare = stripPlatformPhrasesForProductCompare(bNorm)
    .replace(/[.’']/g, " ")
    .replace(/\b(\d+)\s*(bis|ter|quater)\b/gi, "$1$2")
    .replace(/\s+/g, " ")
    .trim();
  const aTokens = new Set(aCompare.split(/[^a-z0-9]+/).filter(Boolean));
  const bTokens = new Set(bCompare.split(/[^a-z0-9]+/).filter(Boolean));
  const onlyA = [...aTokens].filter(
    (token) =>
      significantProductCompareToken(token) && !bTokens.has(token),
  );
  const onlyB = [...bTokens].filter(
    (token) =>
      significantProductCompareToken(token) && !aTokens.has(token),
  );
  const shared = [...aTokens].filter(
    (token) =>
      significantProductCompareToken(token) && bTokens.has(token),
  );
  return { onlyA, onlyB, shared };
}

/**
 * True when `alias` only adds product identity on top of `primary` (shared stem
 * + 2+ exclusive tokens) — e.g. "FIFA Soccer 2002: Major League Soccer" beside
 * "FIFA 2002". Regional FR/EN pairs keep exclusive tokens on both sides and
 * return false.
 */
export function listingOnlyAddsProductIdentity(
  primary: string,
  alias: string,
): boolean {
  const exclusives = productCompareTokenSets(primary, alias);
  if (!exclusives) return false;
  const onlyBProduct = exclusives.onlyB.filter(
    (token) => !EDITION_SUFFIX_PATTERNS.has(token),
  );
  return exclusives.onlyA.length === 0 && onlyBProduct.length >= 2;
}

function isEditionOnlyExtension(primary: string, alias: string): boolean {
  const exclusives = productCompareTokenSets(primary, alias);
  if (!exclusives) return false;
  if (exclusives.onlyA.length > 0) return false;
  if (exclusives.onlyB.length === 0) return false;
  return exclusives.onlyB.every((token) => EDITION_SUFFIX_PATTERNS.has(token));
}

/** Shared token beyond the common leading franchise/sequel stem (e.g. "electro"). */
function aliasesShareDistinctiveProductToken(
  primary: string,
  alias: string,
): boolean {
  const exclusives = productCompareTokenSets(primary, alias);
  if (!exclusives) return false;
  const aNorm = normalizeTitleForProductCompare(primary);
  const bNorm = normalizeTitleForProductCompare(alias);
  if (!aNorm || !bNorm) return false;
  const aTokens = aNorm.split(/\s+/).filter(Boolean);
  const bTokens = bNorm.split(/\s+/).filter(Boolean);
  let prefixLen = 0;
  while (
    prefixLen < aTokens.length &&
    prefixLen < bTokens.length &&
    aTokens[prefixLen] === bTokens[prefixLen]
  ) {
    prefixLen++;
  }
  const beyondPrefix = new Set([
    ...aTokens.slice(prefixLen),
    ...bTokens.slice(prefixLen),
  ]);
  return exclusives.shared.some(
    (token) =>
      beyondPrefix.has(token) &&
      token.length >= 5 &&
      !/^\d+$/.test(token) &&
      !EDITION_SUFFIX_PATTERNS.has(token),
  );
}

/**
 * FR/EN subtitle pairs share a franchise stem and each side adds its own words
 * ("Alice : Retour…" ↔ "Alice: Madness Returns"). Numbered siblings that only
 * share a franchise+sequel stem ("… Electro" vs "… Sinister Six") are rejected.
 */
function aliasesLookLikeRegionalTitlePair(
  primary: string,
  alias: string,
): boolean {
  const exclusives = productCompareTokenSets(primary, alias);
  if (!exclusives) return false;
  if (exclusives.shared.length === 0) return false;
  if (exclusives.onlyA.length === 0 || exclusives.onlyB.length === 0) {
    return false;
  }
  // Sequel digits are length-1 so they never enter `exclusives.shared` — read
  // them from the raw normalized titles instead.
  const aTokens = normalizeTitleForProductCompare(primary).split(/\s+/).filter(Boolean);
  const bTokens = normalizeTitleForProductCompare(alias).split(/\s+/).filter(Boolean);
  const sharedRaw = aTokens.filter((token) => bTokens.includes(token));
  if (sharedRaw.some((token) => /^\d+$/.test(token))) return false;
  return true;
}

/**
 * Metadata alias safe to include in marketplace / PriceCharting lookup queries.
 * Keeps same-product, edition variants (Remastered), and regional titles; drops
 * spinoffs, one-sided extensions, and bare franchise prefixes.
 */
export function aliasBelongsInPriceLookup(
  primary: string,
  alias: string,
): boolean {
  if (aliasIsLeadingFranchisePrefixOf(primary, alias)) return false;
  if (isEditionOnlyExtension(primary, alias)) return true;
  if (areLikelySameProduct(primary, alias)) return true;
  if (
    listingIsDistinctProductSpinoff(primary, alias) ||
    listingIsDistinctProductSpinoff(alias, primary)
  ) {
    return false;
  }
  if (listingOnlyAddsProductIdentity(primary, alias)) return false;
  // FR/EN subtitles ("La Revanche d'Electro" ↔ "Enter Electro") share a
  // distinctive token beyond the franchise stem; siblings ("Sinister Six") do
  // not. Pure regional pairs without a shared subtitle word still keep.
  if (aliasesShareDistinctiveProductToken(primary, alias)) return true;
  if (aliasesLookLikeRegionalTitlePair(primary, alias)) return true;
  return false;
}

function aliasIsLeadingFranchisePrefixOf(
  primary: string,
  alias: string,
): boolean {
  const primaryNorm = normalizeTitleForProductCompare(primary);
  const aliasNorm = normalizeTitleForProductCompare(alias);
  if (!primaryNorm || !aliasNorm) return false;
  // Keep single-digit sequel markers ("2") — length>1 would drop them and
  // miss "Spider-Man 2" as a bare franchise prefix of the Electro subtitle.
  const keepToken = (t: string) => t.length > 1 || /^\d+$/.test(t);
  const primaryTokens = primaryNorm.split(/\s+/).filter(keepToken);
  const aliasTokens = aliasNorm.split(/\s+/).filter(keepToken);
  if (aliasTokens.length < 2) return false;
  if (primaryTokens.length <= aliasTokens.length) return false;
  return aliasTokens.every((token, index) => primaryTokens[index] === token);
}

export function areLikelySameProduct(a: string, b: string): boolean {
  const aNorm = normalizeTitleForProductCompare(a);
  const bNorm = normalizeTitleForProductCompare(b);
  if (!aNorm || !bNorm) return false;
  if (aNorm === bNorm) {
    return true;
  }

  if (listingAddsDistinctSpinoffLead(aNorm, bNorm)) {
    return false;
  }

  // "Game 1" names the first/base game, i.e. the same product as the unnumbered
  // "Game" — so a lone "1" must not make them look like different entries (a
  // noisy listing "… 1 Complete in" vs the canonical base). Drop it before
  // comparing; "Game 2" still stays distinct from both.
  const dropBaseOne = (set: Set<string>) => {
    set.delete("1");
    return set;
  };
  const aIndicators = dropBaseOne(sequelIndicatorsForProductCompare(aNorm));
  const bIndicators = dropBaseOne(sequelIndicatorsForProductCompare(bNorm));
  if (aIndicators.size !== bIndicators.size) return false;
  for (const indicator of aIndicators) {
    if (!bIndicators.has(indicator)) return false;
  }

  if (listingLooksLikeNonBookProduct(b) && !listingLooksLikeNonBookProduct(a)) {
    return false;
  }

  const aCompare = stripPlatformPhrasesForProductCompare(aNorm)
    .replace(/[.’']/g, " ")
    .replace(/-/g, " ")
    .replace(/\b(\d+)\s*(bis|ter|quater)\b/gi, "$1$2")
    .replace(/\s+/g, " ")
    .trim();
  const bCompare = stripPlatformPhrasesForProductCompare(bNorm)
    .replace(/[.’']/g, " ")
    .replace(/-/g, " ")
    .replace(/\b(\d+)\s*(bis|ter|quater)\b/gi, "$1$2")
    .replace(/\s+/g, " ")
    .trim();

  if (aCompare === bCompare) {
    return true;
  }

  // "Pac-Man" ↔ "Pac Man" / "Spider-Man" ↔ "Spiderman" after hyphen join.
  if (productCompareSpaceFoldedEqual(aCompare, bCompare)) {
    return true;
  }

  if (aCompare.includes(bCompare)) {
    return true;
  }

  if (bCompare.includes(aCompare)) {
    // Listing contains the item title as a substring ("… fifa 2002") — only
    // accept when the surrounding tokens are marketplace noise, not a sibling
    // product ("Coupe du Monde Fifa 2002"). Longer official titles that keep
    // the item as a leading token prefix stay aligned (Metal Slug ⊂ … Vehicle).
    const aToks = aCompare.split(/[^a-z0-9]+/).filter(Boolean);
    const bToks = bCompare.split(/[^a-z0-9]+/).filter(Boolean);
    if (productCompareTokensAreLeadingPrefix(aToks, bToks)) return true;

    const extras = bCompare
      .replace(aCompare, " ")
      .split(/[^a-z0-9]+/)
      .filter((token) => significantProductCompareToken(token));
    if (extras.length >= 2) return false;
    if (extras.length === 0) return true;
  }

  // Compound-aware prefix when space-fold hides a hyphen join
  // ("jr pacman" ⊂ "jr pac man jeu atari…").
  {
    const aToks = aCompare.split(/[^a-z0-9]+/).filter(Boolean);
    const bToks = bCompare.split(/[^a-z0-9]+/).filter(Boolean);
    if (
      aToks.length > 0 &&
      bToks.length > aToks.length &&
      productCompareTokensAreLeadingPrefix(aToks, bToks)
    ) {
      return true;
    }
    if (
      bToks.length > 0 &&
      aToks.length > bToks.length &&
      productCompareTokensAreLeadingPrefix(bToks, aToks)
    ) {
      return true;
    }
  }

  const aTokens = new Set(aCompare.split(/[^a-z0-9]+/).filter(Boolean));
  const bTokens = new Set(bCompare.split(/[^a-z0-9]+/).filter(Boolean));
  const onlyA = [...aTokens].filter(
    (token) =>
      significantProductCompareToken(token) && !bTokens.has(token),
  );
  const onlyB = [...bTokens].filter(
    (token) =>
      significantProductCompareToken(token) && !aTokens.has(token),
  );
  const artBookLike =
    /\b(?:book|livre|tome|edition|making|art|creation|histoire|manga|bd)\b/i.test(
      `${a} ${b}`,
    );
  // Franchise siblings share a lead ("James Bond 007 …", "FIFA …") but name a
  // different product. Skip this gate for art-book FR/EN title pairs.
  if (!artBookLike) {
    if (onlyA.length > 0 && onlyB.length > 0) return false;
    if (onlyA.length === 0 && onlyB.length >= 2) return false;
  }

  const intersection = [...aTokens].filter(
    (token) => token.length >= 3 && bTokens.has(token),
  );
  const dist = levenshtein.get(aCompare, bCompare);
  const maxLen = Math.max(aCompare.length, bCompare.length);
  const similarity = maxLen > 0 ? 1 - dist / maxLen : 0;
  const aFirstSig = [...aTokens].find((token) => token.length >= 3);
  const bFirstSig = [...bTokens].find((token) => token.length >= 3);

  if (
    intersection.some((token) => token.length >= 5) &&
    /\b(?:book|livre|tome|edition|making|art|creation|histoire|manga|bd)\b/i.test(
      `${a} ${b}`,
    )
  ) {
    if (intersection.length >= 2) return true;
    const itemSigTokens = [...aTokens].filter((token) => token.length > 2);
    if (itemSigTokens.length >= 2) {
      const matchedCount = itemSigTokens.filter((token) =>
        bTokens.has(token),
      ).length;
      return matchedCount >= 2;
    }
    const itemPrimary = itemSigTokens[0];
    return !!itemPrimary && bTokens.has(itemPrimary);
  }

  return (
    similarity > 0.42 ||
    intersection.length >= 2 ||
    (!!aFirstSig && aFirstSig === bFirstSig && similarity > 0.22)
  );
}
