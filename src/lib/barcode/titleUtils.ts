import levenshtein from "fast-levenshtein";

import { cleanSearchQuery } from "@/lib/search/query";
import { moveTrailingSortArticleToFront } from "@/lib/title/sort";
import { VIDEO_GAME_PLATFORM_TERMS } from "@/lib/games/platforms";
import {
  GAME_EDITION_TERMS,
  LISTING_CONDITION_TERMS,
  LISTING_EXTRA_SUFFIX_TERMS,
  LISTING_FORMAT_TERMS,
  LISTING_NOISE_TERMS,
  LISTING_REGION_TERMS,
} from "@/lib/barcode/listingTerms";
import {
  explicitVolumeNumbers,
  volumeNumberFromTitle,
} from "@/lib/title/volumeNumber";
import { parseRomanToken } from "@/lib/title/romanNumeral";

export { moveTrailingSortArticleToFront } from "@/lib/title/sort";

export function normalizeForTokens(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip accent marks
    .toLowerCase();
}

const NUMBER_WORD_MAP: Record<string, string> = {
  one: "1",
  two: "2",
  three: "3",
  four: "4",
  five: "5",
  six: "6",
  seven: "7",
  eight: "8",
  nine: "9",
  ten: "10",
  eleven: "11",
  twelve: "12",
  thirteen: "13",
  fourteen: "14",
  fifteen: "15",
  sixteen: "16",
  seventeen: "17",
  eighteen: "18",
  nineteen: "19",
  twenty: "20",
  thirty: "30",
  forty: "40",
  fifty: "50",
  sixty: "60",
  seventy: "70",
  eighty: "80",
  ninety: "90",
  hundred: "100",
};

export function getSequelIndicators(normStr: string): Set<string> {
  const tokens = normStr.split(/[^a-z0-9]+/);
  const indicators = new Set<string>();
  for (const token of tokens) {
    if (/^\d+$/.test(token)) {
      const num = parseInt(token, 10);
      if (num >= 1900 && num <= 2099) {
        continue;
      }
      indicators.add(num.toString());
    } else {
      const roman = parseRomanToken(token);
      if (roman != null && roman >= 1 && roman <= 99) {
        indicators.add(String(roman));
      } else if (token in NUMBER_WORD_MAP) {
        indicators.add(NUMBER_WORD_MAP[token]);
      }
    }
  }
  return indicators;
}

interface SuggestionWithPriority {
  value: string;
  priority: number; // 2 = clean main, 1 = clean alias, 0 = drafty
}

function escapeRegExp(string: string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const SUFFIX_PATTERNS = Array.from(
  new Set([
    // Phrases & specific terms
    ...LISTING_EXTRA_SUFFIX_TERMS,

    // Platforms
    ...VIDEO_GAME_PLATFORM_TERMS,

    // 1ère / original Xbox generation patterns
    "1ere generation",
    "1e generation",
    "1ere génération",
    "1e génération",
    "1 generation",
    "1 génération",
    "1ere gen",
    "1e gen",
    "1 gen",
    "first gen",
    "1st gen",
    "original",
    "vintage",
    "old",

    ...LISTING_FORMAT_TERMS,
    ...LISTING_CONDITION_TERMS,
    ...LISTING_NOISE_TERMS,

    // Publishers/Developers (common listing labels)
    "codemasters",
    "atari",
    "ubisoft",
    "konami",
    "sega",
    "capcom",
    "lucas arts",
    "lucasarts",
    "nintendo",
    "ea games",
    "electronic arts",
    "ea sports",
    "ea",
    "microsoft xbox",
    "microsoft",
    "sony",

    ...GAME_EDITION_TERMS,
    ...LISTING_REGION_TERMS,
  ]),
);

const PLATFORM_SUFFIX_PATTERNS = new Set<string>(VIDEO_GAME_PLATFORM_TERMS);
const EDITION_SUFFIX_PATTERNS = new Set<string>(GAME_EDITION_TERMS);

// Noise terms that are valid leading prefixes but meaningful as a trailing word,
// so they must be excluded from suffix stripping (e.g. "… The Arcade Game").
const SUFFIX_EXCLUDED_NOISE = new Set(["game", "jeu", "jeux"]);

function isListingMetadataSegment(segment: string): boolean {
  const normalized = normalizeForTokens(segment)
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  if (!normalized) return true;

  return [
    /^(nintendo|sony|microsoft|sega|atari|ubisoft|ea|electronic arts)$/,
    /^(nintendo\s+)?(wii|switch|ds|3ds)$/,
    /^jeux?\s+(?:nintendo\s+)?(wii|switch|ds|3ds|gamecube|game\s+cube)$/,
    /^(playstation|ps[1-5]|xbox|xbox\s+360|xbox\s+one)$/,
    /^(pal|ntsc|fr|fra|fre|vf|version francaise)$/,
    /^(complet|complete|mint|cd|disc|disque|dvd|notice|livret|boite|boîte|box)$/,
    /^(sans|avec)\s+(notice|livret|boite|boîte)$/,
    /^(teste|testé|tested|working|fonctionnel|tbe|hs)$/,
    /^(zustand\s+(?:sehr\s+)?gut|zustand\s+neu|neuwertig|gebraucht|ovp)$/,
    /^von\s+not\s+specified$/,
    /^(come\s+nuovo|nuovo|usato|sigillato|ottimo|buono)$/,
    /^(brand\s+new|sealed|like\s+new|very\s+good|good\s+condition|region\s+free)$/,
    /\bjeu\s+video\b/,
    /\bjeux?\s+vid[eé]o\b/,
    /\bjeu\b.*\bnotice\b/,
    /\bavec\s+notice\b/,
    /\bsans\s+notice\b/,
    /\bavec\s+livret\b/,
    /\bsans\s+livret\b/,
    /\bversion\s+francaise\b/,
    /\bpal\s+fr\b/,
  ].some((pattern) => pattern.test(normalized));
}

function stripListingMetadataSegments(value: string): string {
  const parts = value
    .split(/\s*[-–—|]+\s*/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length <= 1) return value;

  let start = 0;
  let end = parts.length;

  while (start < end && isListingMetadataSegment(parts[start])) start += 1;
  while (end > start && isListingMetadataSegment(parts[end - 1])) end -= 1;

  const kept = parts.slice(start, end);
  return kept.length > 0 ? kept.join(" - ") : value;
}

function stripAccessorySegments(value: string): string {
  return value
    .replace(
      /\s*(?:\+|\bet\b|\bavec\b|\bsans\b)\s*(?:wii\s+)?(?:zapper|fusil|gun|volant|wheel|manette|controller|notice|wii\s+wheel)\b.*$/i,
      "",
    )
    .replace(
      /\s*\+\s*jeux?\s+wii\s*\+\s*(?:zapper|fusil|volant|wheel)\b.*$/i,
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
  const yearSuffixRegex =
    /\s*(?:[\-–|/()\[\]]|\b(?:codemasters|ea|atari|ubisoft|sega|nintendo|sony|microsoft|konami|capcom))\s*\b(?:19|20)\d{2}\b\s*$/i;

  const PREFIX_PATTERNS = [
    ...LISTING_NOISE_TERMS,
    "pack jeu",
    "pack",
    ...LISTING_FORMAT_TERMS,
  ];

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
    cleaned = cleaned
      .replace(/^(?:jeu\s+d['']?\s*)?escape\s+game\s*[-–—:|]?\s*/i, "")
      .replace(/^d['']?escape\s+game\s*[-–—:|]?\s*/i, "")
      .replace(/^jeu\s+d['']?enqu[eê]te\s*[-–—:|]?\s*/i, "")
      .replace(/^asmodee\s+(?=unlock!?)/i, "")
      .replace(/\s+space\s+cowboys.*$/i, "")
      .replace(/\s+jeu\s+d['']?\s*enqu[eê]te(?:\s+escape\s+game)?\s*$/i, "")
      .replace(/\s+escape\s+game\s*$/i, "")
      .replace(/\s+\bFR\b\s*$/i, "")
      .replace(/\bSCUNL[A-Z0-9]+\b/gi, "")
      .replace(
        /^(?:ancien\s+jeu\s+|ancien\s+)?nintendo\s+(?=(?!land\b).{4,})/i,
        "",
      )
      .replace(
        /^wii\s+(?=(?!sports\b|fit\b|play\b|party\b|music\b|chess\b).{4,})/i,
        "",
      )
      .replace(
        /^wii\s*u\s+(?=(?!sports\b|fit\b|play\b|party\b|music\b|chess\b|panorama\b).{4,})/i,
        "",
      )
      .replace(
        /\s+\b(?:complet|complete)?\s*(?:sur|pour|for)\s+(?:nintendo\s+)?(?:wii|switch|ds|3ds|gamecube|game\s+cube)\b.*$/i,
        "",
      )
      .replace(
        /\s+\bjeux?\s+(?:nintendo\s+)?(?:wii|switch|ds|3ds|gamecube|game\s+cube)\b.*$/i,
        "",
      )
      .replace(/\s+\bpal\b\s*(?:jeux?)?\b.*$/i, "")
      .replace(
        /\bnintendo\s+(?:wii|switch|ds|3ds|gamecube|game\s+cube)\s*$/i,
        "",
      )
      .replace(
        /\s+\bnintendo\s+(?:wii|switch|ds|3ds|gamecube|game\s+cube)\b\s*(?:pal|france|fr|vf|eur|eu)?\s*$/i,
        "",
      )
      .replace(
        /\s+\b(?:cd|album)\b(?:\s+\b(?:walt\s+disney|walt|disney|square\s+enix|japan|jpn|import)\b)*\s*$/i,
        "",
      )
      .replace(
        /\s+\b(?:walt\s+disney|walt|disney|square\s+enix|japan|jpn|import)\b\s*$/i,
        "",
      )
      .replace(/\s*[-–—|]\s*album\s+cd\b.*$/i, "")
      .replace(/\bSQEX\d+\b/gi, "")
      .replace(/\s*\*rare\*\s*$/i, "")
      .replace(/\b(?:pour|for)\s*$/i, "")
      .trim();

    // Remove wrapping quotes if they match
    if (
      (cleaned.startsWith("'") && cleaned.endsWith("'")) ||
      (cleaned.startsWith('"') && cleaned.endsWith('"'))
    ) {
      cleaned = cleaned.slice(1, -1).trim();
    }
    cleaned = moveTrailingSortArticleToFront(cleaned);
    cleaned = stripLeadingPlatformPrefix(cleaned);

    // Strip trailing suffix
    cleaned = cleaned
      .replace(suffixRegex, (match, offset, fullValue) => {
        const beforeMatch = normalizeForTokens(
          fullValue.slice(0, offset).trim(),
        );
        const suffix = normalizeForTokens(match.trim());
        const isOrdinalEdition =
          /\b(1ere|1er|1e|premiere|first|2eme|2e|seconde|second|3eme|3e)\s*$/.test(
            beforeMatch,
          ) && /^e?dition\b/.test(suffix);

        return isOrdinalEdition ? match : "";
      })
      .trim();
    // Strip trailing year suffix
    cleaned = cleaned.replace(yearSuffixRegex, "").trim();
    // Strip leading prefix
    cleaned = cleaned.replace(prefixRegex, "").trim();
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

function stripLeadingPlatformPrefix(value: string): string {
  const normalized = value.trim();
  if (!normalized) return normalized;

  const sortedPlatforms = [...PLATFORMS].sort((a, b) => b.length - a.length);
  for (const platform of sortedPlatforms) {
    // Wii prefixes are handled earlier, where the "Wii Sports/Play/Fit…" titles
    // (the platform word is integral to the official name) are already excluded
    // from stripping — don't re-strip them here (single source of truth).
    if (/\bwii\b/.test(platform)) continue;
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

const DISCARD_PATTERNS = [
  /\bcomparateur\s+de\s+prix\s+neutre\s+et\s+ind[ée]pendant\b/i,
  // No game
  /\bpas\s+de\s+jeu\b/i,
  /\bsans\s+jeu\b/i,
  /\bno\s+game\b/i,
  /\bjeu\s+non\s+inclus\b/i,
  /\bjeu\s+non\s+fourni\b/i,
  /\bno\s+disc\b/i,
  /\bsans\s+disque\b/i,
  /\bpas\s+de\s+disque\b/i,
  /\bsans\s+cartouche\b/i,
  /\bpas\s+de\s+cartouche\b/i,
  /\bno\s+cartridge\b/i,

  // Box/Case only
  /\bboitier\s+seul\b/i,
  /\bboîtier\s+seul\b/i,
  /\bcase\s+only\b/i,
  /\bboitier\s+vide\b/i,
  /\bboîtier\s+vide\b/i,
  /\bempty\s+case\b/i,
  /\bempty\s+box\b/i,
  /\bboite\s+seule\b/i,
  /\bboîte\s+seule\b/i,
  /\bboite\s+vide\b/i,
  /\bboîte\s+vide\b/i,
  /\bbox\s+only\b/i,

  // Manual/Notice only
  /\bnotice\s+seule\b/i,
  /\bnotice\s+seul\b/i,
  /\bmanual\s+only\b/i,
  /\bnotice\s+de\s+jeu\s+seule\b/i,
  /\bnotice\s+de\s+jeu\s+seul\b/i,
  /\bmode\s+d'emploi\s+seul\b/i,
  /\bmode\s+d'emploi\s+seule\b/i,
  /\blivret\s+seul\b/i,
  /\binstructions\s+only\b/i,

  // Notice + Case only (no game)
  /\bnotice\s+(?:et|\+)\s*jaquette\b/i,
  /\bjaquette\s*(?:et|\+)\s*notice\b/i,
  /\bboitier\s*(?:et|\+)\s*notice\b/i,
  /\bnotice\s*(?:et|\+)\s*boitier\b/i,
  /\bboîtier\s*(?:et|\+)\s*notice\b/i,
  /\bnotice\s*(?:et|\+)\s*boîtier\b/i,
  /\bnotice\s+jaquette\b/i,
  /\bjaquette\s+notice\b/i,
  /\bboitier\s+notice\b/i,
  /\bboîtier\s+notice\b/i,
  /\bnotice\s+boitier\b/i,
  /\bnotice\s+boîtier\b/i,
  /\bnotice\s+(?:et|\+)\s*boite\b/i,
  /\bnotice\s+(?:et|\+)\s*boîte\b/i,
  /\bboite\s*(?:et|\+)\s*notice\b/i,
  /\bboîte\s*(?:et|\+)\s*notice\b/i,

  // Multi-item lots are evidence for parsing, not valid single products.
  /\blot\s+\d+\s+jeux?\b/i,
  /\bpack\s+\d+\s+jeux?\b/i,
  /\b\d+\s+jeux?\s+(?:wii|switch|ps[1-5]|xbox|ds|3ds)\b/i,

  // Taglines de sites (pas un produit) — ex. comparateurs de prix
  /\bcomparateur\s+de\s+prix\b/i,
  /\bneutre\s+et\s+ind[ée]pendant\b/i,
  /\bmeilleurs?\s+prix\s+(?:du\s+web|en\s+ligne)\b/i,
];

export function isListingDiscardable(title: string): boolean {
  return DISCARD_PATTERNS.some((pattern) => pattern.test(title));
}

/**
 * A marketplace "lot": a single listing selling several games together
 * ("Teenage Mutant Ninja Turtles 1,2,3 NES", "Lot de 3 jeux", "Spyro 1 2 3").
 * Such a listing does not identify the one product a barcode is for, and its
 * name collapses to a bare franchise that out-ranks the real edition, so it must
 * be discarded before it enters resolution. Run on the RAW listing name (the
 * number run is stripped during cleaning). Deliberately conservative — official
 * collections name themselves "Trilogy"/"1 + 2", which this does NOT match.
 */
export function isLotListing(name: string): boolean {
  const n = ` ${name.toLowerCase()} `;
  // Explicit lot vocabulary.
  if (/\blot\s+(de\b|d['’]|of\b)/.test(n)) return true;
  if (/\bbundle\b/.test(n) && /(\d|\bjeux\b|\bgames\b|\bjuegos\b)/.test(n)) {
    return true;
  }
  // A quantity of (plural) games: "3 jeux", "2 games", "5 juegos". Singular
  // "game"/"jeu" is excluded so a sequel like "Resident Evil 2 game" is kept.
  if (/\b(?:[2-9]|[1-9]\d+)\s*(?:jeux|games|juegos|giochi|spiele)\b/.test(n)) {
    return true;
  }
  // Manga/comics multi-volume lots ("5 MANGA …", "Tomes 1 à 9", box sets).
  if (/\b(?:[2-9]|[1-9]\d+)\s+(?:manga|mangas|bd|bds|tomes?)\b/.test(n)) {
    return true;
  }
  if (/\btomes?\s+\d+\s*(?:à|a|to|-)\s*\d+\b/.test(n)) return true;
  if (/\btomes?\s+\d+\s*(?:et|&)\s*\d+\b/.test(n)) return true;
  if (/\bvol\.?\s*\d+\s*-\s*\d+\b/.test(n)) return true;
  if (/\bn[°º]?\s*\d+\s*-\s*\d+\b/.test(n)) return true;
  if (/\bbox\s+set\b/.test(n)) return true;
  if (/\bcoffret\b/.test(n) && /\b(?:tomes?|vol\.?|n[°º])\s*\d/.test(n)) {
    return true;
  }
  // A run of installment numbers: "… 1,2,3" / "… 1, 2" / "Spyro 1 2 3".
  if (/[1-9]\s*,\s*[1-9](?:\s*,\s*[1-9])*/.test(n)) return true;
  if (/\b[1-9]\s+[1-9]\s+[1-9]\b/.test(n)) return true;
  return false;
}

/** TCG, boosters, merch — not a book/manga ISBN listing. */
export function listingLooksLikeNonBookProduct(name: string): boolean {
  const n = normalizeForTokens(name);
  if (!n) return false;
  return /\b(?:booster|tcg|trading\s+card|cartes?|deck|etb|elite\s+trainer|playmat|figurine|figure|statue|goodies|merchandising|merch|fun\s+ko|funko)\b/.test(
    n,
  );
}

// v40: persist the compile step's structured title decision (cleanName/
// displayName/edition) in the cache so reads stop re-stripping integral edition
// terms ("Gottlieb Pinball Classics" → "Gottlieb Pinball"). Bumped so pre-v40
// rows (no structured columns, stripped rawNames) are recomputed.
export const BARCODE_CACHE_VERSION = "canonical-v40";
export function versionProvider(provider: string): string {
  return provider.includes(BARCODE_CACHE_VERSION)
    ? provider
    : `${provider}+${BARCODE_CACHE_VERSION}`;
}

export {
  explicitVolumeNumbers,
  hasExplicitVolumeMarker,
  stripVolumeMarkersFromTitle,
  volumeNumberFromTitle,
} from "@/lib/title/volumeNumber";

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

function normalizeEditionSubtitleTokens(value: string): string {
  return normalizeForTokens(value)
    .replace(/\b20\s*eme\s*anniversaire\b/g, "20yearcelebration")
    .replace(/\bcelebration\s*des\s*20\s*ans\b/g, "20yearcelebration")
    .replace(/\b20\s*year\s*celebration(?:\s*edition)?\b/g, "20yearcelebration");
}

function stripEditionSubtitleMarkers(value: string): string {
  return normalizeEditionSubtitleTokens(value)
    .replace(/\b20yearcelebration\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Marketplace price rows: strict match first, then FR/EN edition subtitle variants. */
export function priceListingMatchesAnyItemName(
  itemNames: string[],
  listingName?: string | null,
): boolean {
  if (!listingName?.trim()) return true;
  if (barcodeListingMatchesAnyItemName(itemNames, listingName)) return true;

  const listing = listingName.trim();
  return itemNames.some((name) => {
    const itemIssue = volumeNumberFromTitle(name);
    const listingIssue = volumeNumberFromTitle(listing);
    if (itemIssue && listingIssue && itemIssue !== listingIssue) return false;
    if (
      listingIssue &&
      !itemIssue &&
      /\b(?:volume|vol|tome)\s*\d+\b/i.test(listing)
    ) {
      return false;
    }

    const itemCore = stripEditionSubtitleMarkers(name);
    const listingCore = stripEditionSubtitleMarkers(listingName);
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
  "sur",
  "for",
  "the",
  "jeu",
  "game",
  "jeux",
  "video",
  "ps1",
  "ps2",
  "ps3",
  "ps4",
  "ps5",
  "xbox",
  "switch",
  "wii",
  "pc",
  "playstation",
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
  if (/\bgame\s+of\s+the\s+year\b/.test(norm) || /\bgoty\b/.test(norm)) {
    keys.push("goty");
  }
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

export function areLikelySameProduct(a: string, b: string): boolean {
  const aNorm = normalizeForTokens(cleanSearchQuery(a) || a);
  const bNorm = normalizeForTokens(cleanSearchQuery(b) || b);
  if (!aNorm || !bNorm) return false;
  if (aNorm === bNorm) {
    return true;
  }

  // "Game 1" names the first/base game, i.e. the same product as the unnumbered
  // "Game" — so a lone "1" must not make them look like different entries (a
  // noisy listing "… 1 Complete in" vs the canonical base). Drop it before
  // comparing; "Game 2" still stays distinct from both.
  const dropBaseOne = (set: Set<string>) => {
    set.delete("1");
    return set;
  };
  const aIndicators = dropBaseOne(getSequelIndicators(aNorm));
  const bIndicators = dropBaseOne(getSequelIndicators(bNorm));
  if (aIndicators.size !== bIndicators.size) return false;
  for (const indicator of aIndicators) {
    if (!bIndicators.has(indicator)) return false;
  }

  if (listingLooksLikeNonBookProduct(b) && !listingLooksLikeNonBookProduct(a)) {
    return false;
  }

  if (aNorm.includes(bNorm) || bNorm.includes(aNorm)) {
    return true;
  }

  const aTokens = new Set(aNorm.split(/[^a-z0-9]+/).filter(Boolean));
  const bTokens = new Set(bNorm.split(/[^a-z0-9]+/).filter(Boolean));
  const intersection = [...aTokens].filter(
    (token) => token.length > 3 && bTokens.has(token),
  );
  const dist = levenshtein.get(aNorm, bNorm);
  const maxLen = Math.max(aNorm.length, bNorm.length);
  const similarity = maxLen > 0 ? 1 - dist / maxLen : 0;
  const aFirstSig = [...aTokens].find((token) => token.length > 3);
  const bFirstSig = [...bTokens].find((token) => token.length > 3);

  if (
    intersection.some((token) => token.length >= 5) &&
    /\b(?:book|livre|tome|edition|making|art|creation|histoire|manga|bd)\b/i.test(
      `${a} ${b}`,
    )
  ) {
    if (intersection.length >= 2) return true;
    const itemSigTokens = [...aTokens].filter((token) => token.length > 2);
    if (itemSigTokens.length >= 2) {
      const matchedCount = itemSigTokens.filter((token) => bTokens.has(token))
        .length;
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
