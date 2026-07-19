/**
 * Structural listing chrome — shape-based peels, not open product vocabulary.
 *
 * @see docs/word_list_audit.md
 */

/**
 * Trailing marketing stickers wrapped in asterisks ("*rare*", "*neuf*").
 * Any short sticker, not a named word list.
 */
export const MARKETING_STICKER_RE = /\s*\*[^*\n]{1,24}\*\s*$/;

/**
 * Vendor catalog SKUs glued into marketplace titles (SCUNL…, SQEX…).
 * Shape: 4+ letters, a digit, then 2+ alphanumerics — avoids short titles
 * like FIFA21.
 */
export const CATALOG_SKU_RE = /\b[A-Z]{4,}[0-9][A-Z0-9]{2,}\b/gi;

/**
 * Leading French age adjectives before optional "jeu(x)" —
 * closed grammatical class, not product vocabulary.
 */
export const LEADING_AGE_ADJECTIVE_RE =
  /^(?:ancien(?:ne)?s?|vieux|vieille)\s+(?:jeux?\s+)?/i;

/** Leading pack chrome ("Pack jeu …", "Pack …"). */
export const LEADING_PACK_RE = /^(?:pack(?:\s+jeux?)?)\b\s*/i;

/** Seller shipping / logistics tails. */
export const SELLER_SHIPPING_CHROME_RE =
  /\b(?:adresse\s+course|envoi(?:\s+rapide(?:\s+et\s+suivi)?|\s+suivi)?)\b/gi;

/** VIP / scratch-code stickers on marketplace listings. */
export const SELLER_VIP_CHROME_RE =
  /\b(?:(?:code|carte)\s+vip|vip\s+non\s+gratt[eé]|non\s+gratt[eé])\b/gi;

/** "jeu complet" completeness chrome (not a display edition SKU). */
export const JEU_COMPLET_CHROME_RE = /\bjeu\s+complet(?:\s+en)?\b/gi;

/** Manual leftovers glued as title suffixes. */
export const MANUAL_CHROME_RE = /\b(?:mode\s+d['']?emploi|notice)\b/gi;

/**
 * Original Xbox / first-gen listing noise — ordinal + gen/génération,
 * not an open list of spellings.
 */
export const PLATFORM_GENERATION_CHROME_RE =
  /\b(?:\d+(?:[eè]re?|e|ème|eme|st|nd|rd|th)?|first)\s+(?:gen(?:eration)?|génération)s?\b/gi;

/** Whole dash-segment form of {@link PLATFORM_GENERATION_CHROME_RE}. */
export const PLATFORM_GENERATION_SEGMENT_RE =
  /^(?:\d+(?:[eè]re?|e|ème|eme|st|nd|rd|th)?|first)\s+(?:gen(?:eration)?|génération)s?$/i;

/**
 * Trailing era adjectives (closed grammatical class) — not product identity.
 */
export const ERA_ADJECTIVE_TERMS = ["original", "vintage", "old"] as const;

export const ERA_ADJECTIVE_SEGMENT_RE = new RegExp(
  `^(?:${ERA_ADJECTIVE_TERMS.join("|")})$`,
  "i",
);
export const ERA_ADJECTIVE_TRAILING_RE = new RegExp(
  `\\s+\\b(?:${ERA_ADJECTIVE_TERMS.join("|")})\\b\\s*$`,
  "i",
);

/**
 * Price-comparator site chrome mistaken for a product title.
 * Compositional: "comparateur …" / "meilleur(s) prix …".
 */
export const SITE_TAGLINE_RE =
  /\bcomparateur(?:\s+de\s+prix)?(?:\s+neutre(?:\s+et\s+independant)?)?\b|\bneutre\s+et\s+independant\b|\bmeilleurs?\s+prix\s+(?:du\s+web|en\s+ligne)\b/i;

/**
 * Media-category chrome ("jeu vidéo", "jeu console", "game for") —
 * compositions, not per-platform word lists.
 */
export const MEDIA_CATEGORY_SEGMENT_RE =
  /^(?:jeux?\s+videos?|jeux?\s+console|jeu\s+pour|game\s+for)$/i;

export const MEDIA_CATEGORY_LEADING_RE =
  /^(?:jeux?\s+videos?|jeux?\s+console|jeu\s+pour|game\s+for)\b\s*/i;

export const MEDIA_CATEGORY_INFIX_RE =
  /\b(?:jeux?\s+videos?|jeux?\s+console)\b/gi;

/**
 * Region compounds built from atomic codes (pal+lang, version française,
 * import+region, region free) — not an open product vocabulary.
 */
const REGION_LANG_ALT =
  "fr|vf|fra|fre|en|eng|de|ger|it|ita|es|spa|us|usa|uk|jp|jpn|eu|eur";

export const REGION_COMPOUND_SEGMENT_RE = new RegExp(
  `^(?:pal\\s+(?:${REGION_LANG_ALT})|version\\s+fran[cç]ais[e]?|import\\s+(?:${REGION_LANG_ALT})|region\\s+free)$`,
  "i",
);

export const REGION_COMPOUND_TRAILING_RE = new RegExp(
  `\\s+\\b(?:pal\\s+(?:${REGION_LANG_ALT})|version\\s+fran[cç]ais[e]?|import\\s+(?:${REGION_LANG_ALT})|region\\s+free)\\b\\s*$`,
  "i",
);

/** Strip seller / VIP / manual / complet / gen / era / media-category chrome. */
export function stripSellerListingChrome(value: string): string {
  return value
    .replace(SELLER_SHIPPING_CHROME_RE, " ")
    .replace(SELLER_VIP_CHROME_RE, " ")
    .replace(JEU_COMPLET_CHROME_RE, " ")
    .replace(MANUAL_CHROME_RE, " ")
    .replace(PLATFORM_GENERATION_CHROME_RE, " ")
    .replace(ERA_ADJECTIVE_TRAILING_RE, " ")
    .replace(REGION_COMPOUND_TRAILING_RE, " ")
    .replace(MEDIA_CATEGORY_INFIX_RE, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function titleHasMediaCategoryChrome(value: string): boolean {
  MEDIA_CATEGORY_INFIX_RE.lastIndex = 0;
  return (
    MEDIA_CATEGORY_SEGMENT_RE.test(value) || MEDIA_CATEGORY_INFIX_RE.test(value)
  );
}
