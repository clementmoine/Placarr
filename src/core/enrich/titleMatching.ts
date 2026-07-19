import {
  CATALOG_REQUIRED_TITLE_MARKER_GROUPS,
  containsGameOfTheYearEdition,
  createGameEditionMatcher,
  createNonGameMediaMatcher,
} from "@/core/identify/listingTerms";
import { normalizeDisplayTitle } from "@/core/enrich/titles/displayScore";
import {
  inferTextLanguage,
  preferredLanguage,
  regionRank,
} from "@/core/locale/preference";
import {
  titleTokenPresentInSet,
  titleTokensEquivalent,
  TITLE_PHRASE_EQUIVALENT_GROUPS,
} from "@/core/enrich/titles/tokenEquivalents";
import levenshtein from "fast-levenshtein";
import {
  explicitVolumeNumbers,
  normalizeVolumeTitleText,
  normalizeVolumeNumber,
  VOLUME_NUMBER_SUFFIX_PATTERN,
} from "@/core/enrich/titles/volumeNumber";
import { pickBestCoverFromAttachments } from "@/core/enrich/media/attachmentDisplayScore";
import {
  cleanSearchQuery,
  stripLegalMarkSymbols,
} from "@/core/enrich/search/query";
import {
  buildStructuralTitleSearchVariants,
  isWeakMetadataSearchFragment,
} from "@/core/enrich/titles/searchVariants";
import { parseRomanToken } from "@/core/enrich/titles/romanNumeral";
import { normalizeForTokens } from "@/core/enrich/titles/normalize";
import { listingLooksLikeMerchAccessory } from "@/core/identify/titleUtils";
import {
  createSequelNumberBeforePlatformMatcher,
  createTrailingVideoGamePlatformSuffixMatcher,
} from "@/core/identify/platforms/platforms";
import {
  IDENTITY_EDITION_PACKAGING_TOKENS,
  IDENTITY_FUNCTION_WORDS,
  IDENTITY_LEADING_ARTICLES,
  IDENTITY_LISTING_PACKAGING_NOISE,
  IDENTITY_PLATFORM_NOISE_TOKENS,
  IDENTITY_VOLUME_STOP_WORDS,
  isIdentityNeutralListingToken,
  isIdentityVolumeStopWord,
} from "@/core/enrich/titles/identityNoise";
import { buildBundleMetadataSearchQueries, bundleTitlePartsMatchCatalogTitle, isBundleTitle } from "@/core/enrich/bundleTitle";
import { resolveGameMetadataPlatform } from "@/core/enrich/platform";
import {
  extractTitleIntentYear,
  preferReleaseDateMatchingTitleYear,
  stripTitleIntentYear,
  titleIntentYearAlignment,
} from "@/core/enrich/titles/intentYear";
import {
  authorNamesFromMetadata,
  residualIdentityMatch,
} from "@/core/enrich/titles/residualIdentity";
import type {
  MetadataAttachment,
  MetadataFact,
  MetadataResult,
} from "@/types/metadataProvider";

function namesFromMetadataSource(source: MetadataResult): string[] {
  const regional = (source.regionalTitles || [])
    .slice()
    .sort((a, b) => regionRank(a.region) - regionRank(b.region))
    .map((entry) => entry.text);
  return [...regional, source.title, ...(source.aliases || [])]
    .filter((value): value is string => Boolean(value?.trim()))
    .map((value) => value.trim());
}

export function collectCanonicalFallbackNames(
  requestedName: string,
  sources: Array<MetadataResult | null | undefined>,
): string[] {
  const requestedKey = cleanSearchQuery(requestedName).toLowerCase();

  return Array.from(
    new Set(
      [
        ...buildRequestedTitleFallbackVariants(requestedName),
        ...sources.flatMap((source) =>
          source ? namesFromMetadataSource(source) : [],
        ),
      ]
        .filter((value): value is string => Boolean(value?.trim()))
        .filter(
          (value) => cleanSearchQuery(value).toLowerCase() !== requestedKey,
        ),
    ),
  );
}

export function orderFallbackNamesForLocale(
  requestedName: string,
  names: string[],
): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];

  for (const value of names) {
    const trimmed = value.replace(/\s+/g, " ").trim();
    if (!trimmed) continue;
    const key = cleanSearchQuery(trimmed).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(trimmed);
  }

  // Langue préférée d'abord (ordre configuré, pas de langue codée en dur) ;
  // l'équivalence par-produit vient des alias providers présents dans `names`.
  const preferred = preferredLanguage();
  return unique.slice().sort((a, b) => {
    const aPreferred = inferTextLanguage(a) === preferred ? 0 : 1;
    const bPreferred = inferTextLanguage(b) === preferred ? 0 : 1;
    if (aPreferred !== bPreferred) return aPreferred - bPreferred;

    const aScore = metadataTitleSimilarity(requestedName, a);
    const bScore = metadataTitleSimilarity(requestedName, b);
    if (aScore !== bScore) return bScore - aScore;

    return a.length - b.length;
  });
}

export function buildGameMetadataFallbackNames(
  requestedName: string,
  barcodeAlternateNames: string[],
  sources: Array<MetadataResult | null | undefined>,
  extraNames: string[] = [],
): string[] {
  // Title-derived and provider-canonical names are more reliable than noisy
  // marketplace barcode listings (e.g. "... Nintendo Wii FR PAL TBE Complet
  // Testé"). Order them first so high-value retries — including the base title
  // produced by buildRequestedTitleFallbackVariants — survive the per-provider
  // fallback `limit` instead of being crowded out by listing chatter.
  const canonical = orderFallbackNamesForLocale(requestedName, [
    ...collectCanonicalFallbackNames(requestedName, sources),
    ...extraNames,
  ]);
  const barcode = orderFallbackNamesForLocale(
    requestedName,
    barcodeAlternateNames,
  );

  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const name of [...canonical, ...barcode]) {
    const key = cleanSearchQuery(name).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    ordered.push(name);
  }
  return ordered;
}

export function buildRequestedTitleFallbackVariants(
  requestedName: string,
): string[] {
  const variants = buildStructuralTitleSearchVariants(requestedName);

  const baseTitle = extractBaseTitleVariant(requestedName);
  if (baseTitle) variants.push(baseTitle);

  return variants;
}

/** Names used to accept provider hits against a requested shelf title. */
export function buildMetadataAlignmentNames(
  name: string,
  barcodeAlternateNames: string[] = [],
): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  const withoutYear = stripTitleIntentYear(name);
  for (const candidate of [
    name,
    withoutYear !== name ? withoutYear : null,
    ...buildRequestedTitleFallbackVariants(name),
    ...(withoutYear !== name
      ? buildRequestedTitleFallbackVariants(withoutYear)
      : []),
    extractBaseTitleVariant(name),
    extractBaseTitleVariant(withoutYear),
    ...barcodeAlternateNames,
  ]) {
    const value = candidate?.trim();
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    ordered.push(value);
  }
  return ordered;
}

/** Initial provider lookup queries for a game title (variants + optional platform). */
export function buildGameMetadataSearchQueries(
  name: string,
  platform?: string | null,
  shelfName?: string | null,
): string[] {
  const trimmed = stripLegalMarkSymbols(name.trim()) || name.trim();
  if (!trimmed) return [];

  // Parenthetical years are shelf disambiguators, not catalog title tokens.
  const searchBase = stripTitleIntentYear(trimmed) || trimmed;

  const resolvedPlatform = resolveGameMetadataPlatform(
    platform,
    shelfName,
    "games",
  );
  const seen = new Set<string>();
  const queries: string[] = [];

  const push = (value: string) => {
    const candidate =
      stripLegalMarkSymbols(value.replace(/\s+/g, " ").trim()) ||
      value.replace(/\s+/g, " ").trim();
    if (!candidate) return;
    if (isWeakMetadataSearchFragment(candidate)) return;
    const key = candidate.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    queries.push(candidate);
  };

  push(searchBase);
  for (const variant of buildStructuralTitleSearchVariants(searchBase)) {
    push(variant);
  }
  for (const query of buildBundleMetadataSearchQueries(
    searchBase,
    shelfName,
    resolvedPlatform ?? undefined,
  )) {
    push(query);
  }
  if (resolvedPlatform) {
    push(`${searchBase} ${resolvedPlatform}`);
    for (const variant of buildStructuralTitleSearchVariants(searchBase).slice(
      0,
      4,
    )) {
      push(`${variant} ${resolvedPlatform}`);
    }
  }

  return queries;
}

/**
 * Edition/reprint qualifiers that describe a *variant* of a game rather than a
 * distinct title. Kept deliberately narrow (strong markers only) so a real
 * subtitle is never mistaken for an edition.
 */
const EDITION_QUALIFIER = createGameEditionMatcher("i");

/**
 * Strips a *trailing* edition qualifier so providers that only index the base
 * game can still match:
 *   "Monopoly - Editions Classique Et Monde"            -> "Monopoly"
 *   "The Legend of Zelda: Skyward Sword - Edition Lim." -> "The Legend of Zelda: Skyward Sword"
 *
 * Splits on the LAST top-level separator (a colon or a spaced dash) so a
 * meaningful subtitle ("Skyward Sword") is preserved, and only when the trailing
 * part is an edition qualifier — never a distinct subtitle. Used as a
 * last-resort fallback name, after the full title and aliases have failed.
 */
export function extractBaseTitleVariant(requestedName: string): string | null {
  const trimmed = requestedName.trim();
  // Greedy leading group => the separator captured is the last one in the title.
  const match = trimmed.match(/^(.+)(?::\s+|\s+[-–—]\s+)(\S.*)$/);
  if (match) {
    const base = match[1].trim();
    const trailing = match[2].trim();
    if (base.length < 3) return null;
    if (base.toLowerCase() === trimmed.toLowerCase()) return null;
    if (!EDITION_QUALIFIER.test(trailing)) return null;
    return base;
  }

  const trailingEdition = trimmed.match(
    /^(.+?)\s+(deluxe|collector|ultimate|legendary|premium|gold|platinum|complete|definitive|anniversary)(?:\s+edition)?$/i,
  );
  if (trailingEdition) {
    const base = trailingEdition[1].trim();
    if (base.length >= 3 && base.toLowerCase() !== trimmed.toLowerCase()) {
      return base;
    }
  }

  return null;
}

function splitEditionBaseTitle(title: string): {
  base: string;
  hasEditionSuffix: boolean;
} {
  const trimmed = title.trim();
  if (!trimmed) return { base: "", hasEditionSuffix: false };

  const match = trimmed.match(/^(.+)(?::\s+|\s+[-–—]\s+)(\S.*)$/);
  if (!match) return { base: trimmed, hasEditionSuffix: false };

  const trailing = match[2].trim();
  if (!EDITION_QUALIFIER.test(trailing)) {
    return { base: trimmed, hasEditionSuffix: false };
  }

  return { base: match[1].trim(), hasEditionSuffix: true };
}

/**
 * Rejects edition-variant false positives where only the trailing qualifier
 * overlaps ("Alan Wake II - Deluxe Edition" vs "Distraint: Deluxe Edition").
 */
function editionIdentityBasesMismatch(
  requestedName: string,
  candidateTitle: string,
): boolean {
  const requested = splitEditionBaseTitle(requestedName);
  if (!requested.hasEditionSuffix || !requested.base) return false;

  const candidate = splitEditionBaseTitle(candidateTitle);
  const candidateIdentity = candidate.hasEditionSuffix
    ? candidate.base
    : candidateTitle.trim();
  if (!candidateIdentity) return false;

  if (metadataTitleSimilarity(requested.base, candidateIdentity) >= 0.58) {
    return false;
  }

  const requestedTokens = variantIdentityTokens(requested.base);
  const candidateTokens = variantIdentityTokens(candidateIdentity);
  if (requestedTokens.length === 0 || candidateTokens.length === 0) {
    return true;
  }

  return !requestedTokens.some((token) =>
    candidateTokens.some((other) => titleTokensEquivalent(token, other)),
  );
}

/** Exported for retailer barcode guards (deluxe false positives). */
export function catalogEditionIdentityMismatch(
  requestedName: string,
  catalogTitle: string,
): boolean {
  return editionIdentityBasesMismatch(requestedName, catalogTitle);
}

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
const SEQUEL_NUMBER_BEFORE_PLATFORM_MATCHER =
  createSequelNumberBeforePlatformMatcher("gi");

function stripTrailingPlatformSuffix(title: string): string {
  return title.replace(TRAILING_PLATFORM_SUFFIX_MATCHER, "").trim();
}

/** Region / listing-art packaging (not franchise product lines). */
const PRODUCT_LINE_PACKAGING_NOISE = IDENTITY_LISTING_PACKAGING_NOISE;

function isProductLineContextNoiseToken(token: string): boolean {
  const lower = token.toLowerCase();
  if (isNeutralListingToken(lower)) return true;
  if (PRODUCT_LINE_LEADING_ARTICLES.has(lower)) return true;
  if (PRODUCT_LINE_EDITION_TOKENS.has(lower)) return true;
  if (PLATFORM_PRODUCT_LINE_NOISE_TOKENS.has(lower)) return true;
  if (PRODUCT_LINE_PACKAGING_NOISE.has(lower)) return true;
  return false;
}

/** Drop Day One / GOTY / Deluxe packaging before comparing product-line suffixes. */
function stripProductLinePackaging(title: string): string {
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
export function isGameEditionVariant(requestedName: string): boolean {
  return extractBaseTitleVariant(requestedName) !== null;
}

function pickRicherDescription(
  edition?: string | null,
  base?: string | null,
): string | undefined {
  const editionText = edition?.trim();
  const baseText = base?.trim();
  if (!editionText) return baseText || undefined;
  if (!baseText) return editionText;
  return editionText.length >= baseText.length ? editionText : baseText;
}

function mergeEditionAttachments(
  edition?: MetadataAttachment[],
  base?: MetadataAttachment[],
): MetadataAttachment[] | undefined {
  const combined = [...(edition || []), ...(base || [])];
  if (combined.length === 0) return undefined;

  const seen = new Set<string>();
  const merged: MetadataAttachment[] = [];
  for (const attachment of combined) {
    const key = attachment.url.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push(attachment);
  }
  return merged.length > 0 ? merged : undefined;
}

function mergeEditionFacts(
  edition?: MetadataFact[],
  base?: MetadataFact[],
): MetadataFact[] | undefined {
  const combined = [...(edition || []), ...(base || [])];
  if (combined.length === 0) return undefined;

  const seen = new Set<string>();
  const merged: MetadataFact[] = [];
  for (const fact of combined) {
    if (!fact.label?.trim() || !fact.value?.trim()) continue;
    const key = `${fact.kind}:${fact.label}:${fact.value}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(fact);
  }
  return merged.length > 0 ? merged : undefined;
}

function pushFranchiseSequelNumber(target: string[], raw: string | undefined) {
  if (!raw) return;
  const normalized = normalizeVolumeNumber(raw);
  if (normalized === "NaN") return;
  target.push(normalized);
}

function pushFranchiseSequelRoman(
  target: string[],
  raw: string | undefined,
): void {
  if (!raw) return;
  const value = parseRomanToken(raw);
  if (value == null) return;
  target.push(String(value));
}

function isGalleryIndexCaption(title: string): boolean {
  const normalized = normalizeVolumeTitleText(title);
  return /\b(gameplay|screenshot|capture|screen|image|visuel|photo)\s+\d{1,2}\s*$/.test(
    normalized,
  );
}

/** Xbox Series X/S — standalone "x" is a platform token, not sequel X (10). */
function stripPlatformRomanNoisePhrases(value: string): string {
  return value
    .replace(/\bxbox\s+series\s+x(?:\s+one|\s*\/\s*s)?\b/gi, "xbox series")
    .replace(/\bseries\s+x(?:\s+one|\s*\/\s*s)?\b/gi, "series");
}

/** Sequel markers in game franchises ("Baldur's Gate 3", "Resident Evil 2"). */
function franchiseSequelTokens(title: string): string[] {
  const separatorSource = normalizeForTokens(title).replace(/[’‘']/g, "'");
  const text = normalizeVolumeTitleText(title);
  if (!text && !separatorSource) return [];

  const romanText = stripPlatformRomanNoisePhrases(text);
  const romanSeparator = stripPlatformRomanNoisePhrases(separatorSource);

  const numbers: string[] = [];
  if (!isGalleryIndexCaption(title)) {
    for (const match of text.matchAll(
      /\b(\d{1,2})\s*(?=$|\s+(?:deluxe|limited|edition|goty|complete|definitive|ultimate|standard|collection|bundle|remastered|remaster|director|anniversary|gold|platinum|game of the year))\b/gi,
    )) {
      pushFranchiseSequelNumber(numbers, match[1]);
    }
  }

  for (const match of separatorSource.matchAll(
    /\b(\d{1,2})\s*(?::|(?:-\s))/g,
  )) {
    pushFranchiseSequelNumber(numbers, match[1]);
  }

  for (const match of romanText.matchAll(
    /\b(ii|iii|iv|v|vi|vii|viii|ix|x|xi|xii)\b/gi,
  )) {
    pushFranchiseSequelRoman(numbers, match[1]);
  }

  for (const match of romanSeparator.matchAll(
    /\b(ii|iii|iv|v|vi|vii|viii|ix|x|xi|xii)\s*(?::|(?:-\s))/gi,
  )) {
    pushFranchiseSequelRoman(numbers, match[1]);
  }

  // "Borderlands 3 PS4", "Tekken 7 sur PS4", "Halo 4 Xbox One"
  for (const match of text.matchAll(SEQUEL_NUMBER_BEFORE_PLATFORM_MATCHER)) {
    pushFranchiseSequelNumber(numbers, match[1]);
  }

  // "Borderlands 3 [Deluxe Edition]"
  for (const match of text.matchAll(/\b(\d{1,2})\s*(?=\s*[\[(])/g)) {
    pushFranchiseSequelNumber(numbers, match[1]);
  }

  // "Burnout 3 Takedown" / "Burnout 3 TakeDown" — installment before a subtitle
  // word. Without this, only the colon form ("Burnout 3: Takedown") yields a
  // sequel token and shelf titles without ":" false-conflict against catalog.
  // Skip quantity/edition tails ("Trilogy: 3 Full Games", "3 Deluxe Edition").
  for (const match of text.matchAll(
    /\b(\d{1,2})\s+(?!(?:full|games?|discs?|vols?|volumes?|pack|in|deluxe|limited|edition|goty|complete|definitive|ultimate|standard|collection|bundle|remastered|remaster|director|anniversary|gold|platinum|game of the year)\b)(?=[a-z\u00c0-\u024f])/gi,
  )) {
    pushFranchiseSequelNumber(numbers, match[1]);
  }

  return Array.from(new Set(numbers));
}

function franchiseSequelNumbersAreAligned(
  candidateTitle: string,
  comparisonNames: string[],
): boolean {
  const requestedExplicit = Array.from(
    new Set(comparisonNames.flatMap(explicitVolumeNumbers)),
  );
  // Numbered albums/volumes (n°, Tome, Vol.) are handled by editionNumbersAreAligned.
  if (requestedExplicit.length > 0) return true;

  const requested = Array.from(
    new Set(comparisonNames.flatMap(franchiseSequelTokens)),
  );
  if (requested.length === 0) return true;

  const candidate = franchiseSequelTokens(candidateTitle);
  if (candidate.length === 0) {
    const sharesGoty =
      containsGameOfTheYearEdition(candidateTitle) &&
      comparisonNames.some(containsGameOfTheYearEdition);
    return sharesGoty;
  }

  const requestedSet = new Set(requested);
  return candidate.some((number) => requestedSet.has(number));
}

/** True when the catalog names a sequel the request did not ask for, or both name sequels that disagree. */
export function franchiseSequelNumbersConflict(
  requestedNames: string[],
  catalogTitle: string,
): boolean {
  const requestedExplicit = Array.from(
    new Set(requestedNames.flatMap(explicitVolumeNumbers)),
  );
  // Numbered albums/volumes (n°, Tome, Vol.) are edition identity — same
  // deferral as franchiseSequelNumbersAreAligned.
  if (requestedExplicit.length > 0) return false;

  const catalogExplicit = explicitVolumeNumbers(catalogTitle);
  const requested = Array.from(
    new Set(requestedNames.flatMap(franchiseSequelTokens)),
  );
  const catalog = franchiseSequelTokens(catalogTitle);
  if (catalog.length === 0) return false;
  // Catalog "Wakfu, Tome 3 : …" injects "3" via the "N :" franchise pattern.
  // A bare request ("WAKFU 3 Les Mines…") has no franchise tokens yet — that is
  // not a sequel conflict; title score / album tokens decide.
  if (catalogExplicit.length > 0 && requested.length === 0) return false;
  if (requested.length === 0) return true;

  const requestedSet = new Set(requested);
  return !catalog.some((number) => requestedSet.has(number));
}

function normalizeCatalogTitleText(value: string): string {
  return normalizeForTokens(value)
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function textContainsCatalogPhrase(text: string, phrase: string): boolean {
  const normalizedText = ` ${normalizeCatalogTitleText(text)} `;
  const normalizedPhrase = normalizeCatalogTitleText(phrase);
  return Boolean(
    normalizedPhrase && normalizedText.includes(` ${normalizedPhrase} `),
  );
}

function catalogAttachmentDropsRequiredTitleMarker(
  productTitle: string,
  attachmentTitle: string,
): boolean {
  return CATALOG_REQUIRED_TITLE_MARKER_GROUPS.some(
    (group) =>
      group.some((term) => textContainsCatalogPhrase(productTitle, term)) &&
      !group.some((term) => textContainsCatalogPhrase(attachmentTitle, term)),
  );
}

const NON_GAME_MEDIA_TITLE_PATTERN = createNonGameMediaMatcher("i");

function attachmentTitleLooksLikeNonGameMedia(
  attachmentTitle: string,
  productTitle: string,
): boolean {
  return (
    NON_GAME_MEDIA_TITLE_PATTERN.test(attachmentTitle) &&
    !NON_GAME_MEDIA_TITLE_PATTERN.test(productTitle)
  );
}

export function attachmentTitleMediaTypeConflicts(
  productTitle: string | undefined,
  attachmentTitle: string | undefined,
  options: { mediaType?: string | null } = {},
): boolean {
  if (!productTitle?.trim() || !attachmentTitle?.trim()) return false;
  return (
    options.mediaType === "games" &&
    attachmentTitleLooksLikeNonGameMedia(attachmentTitle, productTitle)
  );
}

const VOLUME_LABEL_NOISE_TOKENS = new Set([
  ...IDENTITY_VOLUME_STOP_WORDS,
  ...IDENTITY_EDITION_PACKAGING_TOKENS,
]);

function specificSubtitleTokens(title: string): string[] {
  const segments = title
    .split(/\s*(?::|[-–—])\s*/g)
    .map((segment) => segment.trim())
    .filter(Boolean);
  if (segments.length < 2) return [];

  return Array.from(
    new Set(
      segments
        .slice(1)
        .flatMap((segment) => normalizeDisplayTitle(segment))
        .filter(
          (token) =>
            token.length > 3 && !VOLUME_LABEL_NOISE_TOKENS.has(token),
        ),
    ),
  );
}

/**
 * Album/issue-specific tokens beyond the franchise stem (e.g. "mines",
 * "lamororia" in "WAKFU 3 Les Mines de Lamororia"). Empty when the request is
 * only franchise + volume ("Wakfu Tome 3").
 */
export function albumSpecificDistinctiveTokens(title: string): string[] {
  const fromSubtitle = specificSubtitleTokens(title);
  if (fromSubtitle.length > 0) return fromSubtitle;

  const tokens = distinctiveTitleTokens(title).filter(
    (token) => !VOLUME_LABEL_NOISE_TOKENS.has(token) && !/^\d+$/.test(token),
  );
  if (tokens.length <= 1) return [];
  return tokens.slice(1);
}

function albumTokenCoverage(required: string[], candidateTitle: string): number {
  if (required.length === 0) return 1;
  const candidateTokens = catalogMatchTokenSet(candidateTitle);
  const matched = required.filter((token) =>
    titleTokenPresentInSet(token, candidateTokens),
  ).length;
  return matched / required.length;
}

/**
 * Same numbered album (tome/n°/bare N) but a different album subtitle — the
 * Wakfu "tome 3 : Mines" vs "tome 3 : Shak Shaka" case. Cross-language game
 * subtitles (FR vs EN) are out of scope: they lack explicit volume markers.
 */
export function sameVolumeAlbumSubtitleConflicts(
  comparisonNames: string[],
  candidateNames: string[],
): boolean {
  const requestedExplicit = Array.from(
    new Set(comparisonNames.flatMap(explicitVolumeNumbers)),
  );
  const requestedBare = Array.from(
    new Set(comparisonNames.flatMap(allNumbers)),
  );

  const reqAlbumGroups = comparisonNames
    .map(albumSpecificDistinctiveTokens)
    .filter((tokens) => tokens.length >= 2);
  if (reqAlbumGroups.length === 0) return false;

  let sawVolumeAlignedCandidate = false;
  for (const candidate of candidateNames) {
    const candidateExplicit = explicitVolumeNumbers(candidate);
    const volumeAligned =
      (requestedExplicit.length > 0 &&
        candidateExplicit.some((number) =>
          requestedExplicit.includes(number),
        )) ||
      (requestedExplicit.length === 0 &&
        candidateExplicit.length > 0 &&
        candidateExplicit.every((number) => requestedBare.includes(number)));
    if (!volumeAligned) continue;
    sawVolumeAlignedCandidate = true;

    const candAlbum = albumSpecificDistinctiveTokens(candidate);
    if (candAlbum.length < 2) continue;

    if (
      reqAlbumGroups.some(
        (required) => albumTokenCoverage(required, candidate) >= 0.75,
      )
    ) {
      return false;
    }
  }

  return sawVolumeAlignedCandidate;
}

function catalogAttachmentDropsSpecificSubtitle(
  productTitle: string,
  attachmentTitle: string,
): boolean {
  const subtitleTokens = specificSubtitleTokens(productTitle);
  if (subtitleTokens.length === 0) return false;

  const attachmentTokens = normalizeDisplayTitle(attachmentTitle);
  const compactAttachmentTitle = normalizeCatalogTitleText(
    attachmentTitle,
  ).replace(/\s+/g, "");

  return !subtitleTokens.some((token) => {
    const compactToken = normalizeCatalogTitleText(token).replace(/\s+/g, "");
    return (
      attachmentTokens.some(
        (other) =>
          titleTokensEquivalent(token, other) ||
          other.includes(token) ||
          token.includes(other),
      ) ||
      (compactToken.length > 3 && compactAttachmentTitle.includes(compactToken))
    );
  });
}

/** True when a gallery image title names another product than the shelf item. */
export function catalogAttachmentTitleConflicts(
  productTitle: string | undefined,
  attachmentTitle: string | undefined,
  options: { mediaType?: string | null } = {},
): boolean {
  if (!productTitle?.trim() || !attachmentTitle?.trim()) return false;
  if (
    listingLooksLikeMerchAccessory(attachmentTitle) &&
    !listingLooksLikeMerchAccessory(productTitle)
  ) {
    return true;
  }
  if (
    attachmentTitleMediaTypeConflicts(productTitle, attachmentTitle, options)
  ) {
    return true;
  }
  if (
    catalogAttachmentDropsRequiredTitleMarker(productTitle, attachmentTitle)
  ) {
    return true;
  }
  if (catalogAttachmentDropsSpecificSubtitle(productTitle, attachmentTitle)) {
    return true;
  }
  if (gameProductIdentityMismatch([productTitle], attachmentTitle)) return true;
  if (franchiseSequelNumbersConflict([productTitle], attachmentTitle)) {
    return true;
  }

  const productDistinctive = distinctiveTitleTokens(productTitle);
  if (productDistinctive.length >= 2) {
    const coverage = distinctiveTokenCoverage(productTitle, attachmentTitle);
    if (
      coverage < 1 &&
      catalogLabelSimilarity(productTitle, attachmentTitle) < 0.7
    ) {
      return true;
    }
  }

  return false;
}

export function supplementGameEditionMetadata(
  requestedName: string,
  edition: MetadataResult,
  base: MetadataResult,
): MetadataResult {
  const title =
    edition.title?.trim() || requestedName.trim() || base.title?.trim();
  const attachments = mergeEditionAttachments(
    edition.attachments,
    base.attachments,
  );

  return {
    ...base,
    ...edition,
    title,
    description: pickRicherDescription(edition.description, base.description),
    facts: mergeEditionFacts(edition.facts, base.facts),
    imageUrl:
      pickBestCoverFromAttachments(attachments ?? []) ||
      base.imageUrl?.trim() ||
      edition.imageUrl?.trim(),
    heroImageUrl: edition.heroImageUrl?.trim() || base.heroImageUrl,
    attachments,
    aliases: Array.from(
      new Set(
        [
          ...(edition.aliases || []),
          ...(base.aliases || []),
          title,
          base.title,
        ].filter((value): value is string => Boolean(value?.trim())),
      ),
    ),
    regionalTitles:
      (edition.regionalTitles?.length ?? 0) > 0
        ? edition.regionalTitles
        : base.regionalTitles,
    externalIds: { ...base.externalIds, ...edition.externalIds },
  };
}

function franchiseSubtitleTokensAlign(
  aTokens: string[],
  bTokens: string[],
): boolean {
  if (aTokens.length < 2 || bTokens.length < 2) return true;
  if (aTokens[0] !== bTokens[0]) return true;

  const aTail = aTokens.slice(1);
  const bTail = bTokens.slice(1);
  if (aTail.length === 0 || bTail.length === 0) return true;

  return aTail.some((aToken) =>
    bTail.some((bToken) => titleTokensEquivalent(aToken, bToken)),
  );
}

function phraseEquivalentSubtitlesAlign(a: string, b: string): boolean {
  const aLower = a.toLowerCase();
  const bLower = b.toLowerCase();
  return TITLE_PHRASE_EQUIVALENT_GROUPS.some((group) => {
    const aPhrase = group.find((phrase) =>
      aLower.includes(phrase.toLowerCase()),
    );
    const bPhrase = group.find((phrase) =>
      bLower.includes(phrase.toLowerCase()),
    );
    return Boolean(
      aPhrase && bPhrase && aPhrase.toLowerCase() !== bPhrase.toLowerCase(),
    );
  });
}

const CATALOG_LABEL_STOP_WORDS = IDENTITY_FUNCTION_WORDS;

function catalogMatchTokenSet(value: string): Set<string> {
  const tokens = new Set(
    normalizeDisplayTitle(value).filter(
      (token) => token.length >= 3 && !CATALOG_LABEL_STOP_WORDS.has(token),
    ),
  );
  for (const match of value.matchAll(/\b(\d{1,2})\b/g)) {
    tokens.add(match[1]!);
  }
  for (const match of value.matchAll(/\b([IVXLCDM]{1,4})\b/gi)) {
    const roman = parseRomanToken(match[1]!);
    if (roman != null) tokens.add(String(roman));
    tokens.add(match[1]!.toLowerCase());
  }
  return tokens;
}

/** Distinctive tokens for catalog label overlap (articles stripped). */
export function distinctiveTitleTokens(value: string): string[] {
  return normalizeDisplayTitle(value).filter(
    (token) => token.length >= 3 && !CATALOG_LABEL_STOP_WORDS.has(token),
  );
}

/**
 * Share of query distinctive tokens found in a catalog label (series name,
 * parenthetical segment, album title). Rewards embedded sub-series labels
 * without product-specific literals.
 */
export function distinctiveTokenCoverage(query: string, candidate: string): number {
  const queryTokens = distinctiveTitleTokens(query);
  if (queryTokens.length === 0) return 0;
  const candidateTokens = catalogMatchTokenSet(candidate);
  const matched = queryTokens.filter((token) =>
    titleTokenPresentInSet(token, candidateTokens),
  ).length;
  return matched / queryTokens.length;
}

/**
 * Similarity for ranking catalog labels (series search, album pick) when the
 * query is a short series stem inside a longer provider label.
 */
export function catalogLabelSimilarity(query: string, label: string): number {
  const coverage = distinctiveTokenCoverage(query, label);
  const similarity = metadataTitleSimilarity(query, label);
  if (coverage >= 1) return Math.max(similarity, 0.85);
  if (coverage >= 0.75) return Math.max(similarity, 0.7);
  return similarity;
}

/**
 * False friends like Bakuman ↔ Batman / Bat Man: short franchise leads that
 * share no root but look close once spaces are ignored. Cap similarity so
 * provider floors at 0.55 cannot adopt the wrong series.
 */
function compactedFranchiseNearMiss(a: string, b: string): boolean {
  const aLead = franchiseLeadTokens(a);
  const bLead = franchiseLeadTokens(b);
  if (aLead.length === 0 || bLead.length === 0) return false;
  if (franchiseLeadsShareRoot(aLead, bLead)) return false;
  if (aLead.length > 2 || bLead.length > 2) return false;

  const compactA = aLead.join("");
  const compactB = bLead.join("");
  if (compactA.length < 5 || compactB.length < 5) return false;
  if (titleTokensEquivalent(compactA, compactB)) return false;

  const distance = levenshtein.get(compactA, compactB);
  const maxLen = Math.max(compactA.length, compactB.length);
  if (distance <= 0) return false;
  // Bakuman/Batman = 2 edits on 7 chars; keep translations (unrelated strings) out.
  return distance <= 3 && distance / maxLen <= 0.4;
}

/** Below typical provider revue/series floors (0.55) for honest non-matches. */
const NON_EQUIVALENT_FRANCHISE_SIMILARITY_CAP = 0.49;

export function metadataTitleSimilarity(a: string, b: string): number {
  const aTokens = normalizeDisplayTitle(a);
  const bTokens = normalizeDisplayTitle(b);
  if (aTokens.length === 0 || bTokens.length === 0) return 0;
  if (aTokens.join(" ") === bTokens.join(" ")) return 1;

  const aSet = new Set(aTokens);
  const bSet = new Set(bTokens);
  const shared = [...aSet].filter((token) => bSet.has(token)).length;
  const tokenScore = shared / Math.max(aSet.size, bSet.size);
  const normalizedA = aTokens.join(" ");
  const normalizedB = bTokens.join(" ");
  const distanceScore =
    1 -
    levenshtein.get(normalizedA, normalizedB) /
      Math.max(normalizedA.length, normalizedB.length);

  // Single-token titles ("Parrain" vs "Parkan") must not align on string distance
  // alone when the sequel marker was stripped by normalizeDisplayTitle.
  // Cap strictly below provider floors (0.55) so near-misses cannot pass.
  if (
    aTokens.length === 1 &&
    bTokens.length === 1 &&
    !titleTokensEquivalent(aTokens[0], bTokens[0])
  ) {
    return Math.min(
      Math.max(tokenScore, distanceScore),
      NON_EQUIVALENT_FRANCHISE_SIMILARITY_CAP,
    );
  }

  // "Bakuman" (1 token) vs "Bat Man" (2) escapes the single-token branch but
  // collapses to the same near-miss once spaces are removed.
  if (compactedFranchiseNearMiss(a, b)) {
    return Math.min(
      Math.max(tokenScore, distanceScore),
      NON_EQUIVALENT_FRANCHISE_SIMILARITY_CAP,
    );
  }

  if (
    aTokens[0] &&
    aTokens[0] === bTokens[0] &&
    phraseEquivalentSubtitlesAlign(a, b)
  ) {
    return Math.max(tokenScore, distanceScore, 0.65);
  }

  const sameLengthFranchisePair =
    aTokens.length === 2 &&
    bTokens.length === 2 &&
    aTokens[0] === bTokens[0] &&
    aTokens[0].length >= 4;

  if (sameLengthFranchisePair) {
    if (!franchiseSubtitleTokensAlign(aTokens, bTokens)) {
      return tokenScore;
    }
    if (aTokens[1] !== bTokens[1]) {
      return Math.max(tokenScore, distanceScore, 0.62);
    }
  }

  const aSequel = franchiseSequelTokens(a);
  const bSequel = franchiseSequelTokens(b);
  const aIdentity = variantIdentityTokens(a);
  const bIdentity = variantIdentityTokens(b);
  let sharedIdentityPrefix = 0;
  while (
    sharedIdentityPrefix < aIdentity.length &&
    sharedIdentityPrefix < bIdentity.length &&
    titleTokensEquivalent(
      aIdentity[sharedIdentityPrefix],
      bIdentity[sharedIdentityPrefix],
    )
  ) {
    sharedIdentityPrefix++;
  }
  if (
    aSequel.length > 0 &&
    bSequel.some((number) => aSequel.includes(number)) &&
    sharedIdentityPrefix >= 2 &&
    aIdentity.length >= 3 &&
    bIdentity.length >= 3
  ) {
    const aSub = aIdentity.slice(sharedIdentityPrefix);
    const bSub = bIdentity.slice(sharedIdentityPrefix);
    if (
      aSub.length > 0 &&
      bSub.length > 0 &&
      !aSub.some((token) =>
        bSub.some((other) => titleTokensEquivalent(token, other)),
      )
    ) {
      return Math.max(tokenScore, distanceScore, 0.62);
    }
  }

  // Covered subset: catalog "007 nightfire" inside shelf "james bond 007 nightfire".
  // Jaccard over the longer side undersells these. Do NOT boost a bare leading
  // franchise stem ("Black Stories" ⊆ "Black Stories - Faits vécus") — that is
  // how wrong retailer covers used to leak back into the gallery.
  const aSubsetOfB = aTokens.every((token) => bSet.has(token));
  const bSubsetOfA = bTokens.every((token) => aSet.has(token));
  if (aSubsetOfB || bSubsetOfA) {
    const shorter = aTokens.length <= bTokens.length ? aTokens : bTokens;
    const longer = aTokens.length <= bTokens.length ? bTokens : aTokens;
    const isLeadingPrefix =
      shorter.length < longer.length &&
      shorter.every((token, index) =>
        titleTokensEquivalent(token, longer[index]),
      );
    if (
      shorter.length < longer.length &&
      !isLeadingPrefix &&
      (shorter.length >= 2 ||
        shorter.some((token) => token.length >= 6 || /^\d{3}$/.test(token)))
    ) {
      return Math.max(tokenScore, distanceScore, 0.62);
    }
  }

  return Math.max(tokenScore, distanceScore);
}

const VARIANT_ALIGNMENT_STOP_WORDS = IDENTITY_VOLUME_STOP_WORDS;

/** Listing tokens that do not change which product is meant (not platforms). */
function isNeutralListingToken(token: string): boolean {
  return isIdentityNeutralListingToken(token);
}

function normalizeMetadataCandidateTitle(title: string): string {
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

function variantIdentityTokens(title: string): string[] {
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

const SERIES_LINE_REJECT_REASONS = new Set([
  "request_series_line_unexplained",
  "series_suffix_mismatch",
  "series_line_extended_on_candidate",
  "short_series_marker_residual",
]);

/**
 * Series / spin-off line conflict via residual identity (no spin-off word list).
 * Volume / merch / product-subtitle rejects stay on `isMetadataTitleAligned`.
 */
export function hasUnrequestedVariantMarker(
  requestedName: string,
  candidateTitle: string,
): boolean {
  const result = residualIdentityMatch({
    requestTitles: [requestedName],
    candidateTitles: [candidateTitle],
  });
  return (
    result.decision === "reject" &&
    result.reasons.some((reason) => SERIES_LINE_REJECT_REASONS.has(reason))
  );
}

/**
 * Parallel product lines insert identity *before* the volume marker
 * ("Neverland Gag Manga Tome 1"). Chapter/album subtitles put identity *after*
 * the volume ("Dragon Ball 1 . Le nuage"). No vocabulary list — only token
 * order relative to the first volume-like token.
 */
export function hasUnrequestedPreVolumeProductLine(
  requestedName: string,
  candidateTitle: string,
): boolean {
  const requestSeries = variantIdentityTokens(
    stripProductLinePackaging(requestedName),
  ).filter((token) => !isProductLineContextNoiseToken(token));
  if (requestSeries.length === 0) return false;

  const tokens = normalizeMetadataCandidateTitle(
    stripProductLinePackaging(candidateTitle),
  )
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  if (tokens.length === 0) return false;

  const isVolumeLike = (token: string): boolean => {
    if (isIdentityVolumeStopWord(token)) return true;
    if (/^\d+$/.test(token)) return true;
    // Booknode / FR shorthand: T01, T4, tome-less volume tokens.
    if (/^t\d+[a-z]*$/i.test(token)) return true;
    return new RegExp(
      `^(?:n|no|nr|num|numero)?\\d+(?:${VOLUME_NUMBER_SUFFIX_PATTERN})?$`,
      "i",
    ).test(token);
  };

  const isSkippableNoise = (token: string): boolean =>
    isProductLineContextNoiseToken(token);

  let reqIdx = 0;
  let i = 0;
  while (i < tokens.length && reqIdx < requestSeries.length) {
    const token = tokens[i];
    if (isVolumeLike(token)) {
      // Volume before the request series finished — not a series+line pattern.
      return false;
    }
    if (isSkippableNoise(token)) {
      i += 1;
      continue;
    }
    if (titleTokensEquivalent(token, requestSeries[reqIdx])) {
      reqIdx += 1;
      i += 1;
      continue;
    }
    if (reqIdx === 0) {
      i += 1;
      continue;
    }
    break;
  }
  if (reqIdx < requestSeries.length) return false;

  const inserted: string[] = [];
  while (i < tokens.length) {
    const token = tokens[i];
    if (isVolumeLike(token)) break;
    if (isSkippableNoise(token)) {
      i += 1;
      continue;
    }
    inserted.push(token);
    i += 1;
  }
  // One label before the volume ("Cycle") is a section marker, not a parallel
  // product line. Parallel lines need ≥2 identity tokens ("Gag Manga").
  const identityInserted = inserted.filter((token) => !/^\d+$/.test(token));
  return identityInserted.length >= 2;
}

/**
 * Series-line / suffix conflicts without spin-off vocabularies:
 * residual identity + pre-volume product lines.
 */
export function hasUnrequestedSeriesSuffixToken(
  requestedName: string,
  candidateTitle: string,
): boolean {
  if (hasUnrequestedPreVolumeProductLine(requestedName, candidateTitle)) {
    return true;
  }
  return hasUnrequestedVariantMarker(requestedName, candidateTitle);
}

const VOLUME_LEAD_STOP_TOKENS = IDENTITY_VOLUME_STOP_WORDS;

/**
 * Leading franchise identity before the first volume/issue marker
 * ("Naruto n°03" → ["naruto"], "Boruto no 03: Naruto Next Generations" → ["boruto"]).
 * Uses volume-aware normalization so markers are not stripped before the cut
 * (variantIdentityTokens would leak subtitle tokens like "Naruto" after "no 03").
 */
export function franchiseLeadTokens(title: string): string[] {
  const tokens = normalizeVolumeTitleText(
    normalizeMetadataCandidateTitle(title),
  )
    .split(/\s+/)
    .filter(Boolean);
  const lead: string[] = [];
  for (const token of tokens) {
    if (/^\d/.test(token)) break;
    if (VOLUME_LEAD_STOP_TOKENS.has(token.toLowerCase())) break;
    lead.push(token);
  }
  return lead;
}

function franchiseLeadsShareRoot(
  requested: string[],
  candidate: string[],
): boolean {
  if (requested.length === 0 || candidate.length === 0) return true;

  const shorter =
    requested.length <= candidate.length ? requested : candidate;
  const longer =
    requested.length <= candidate.length ? candidate : requested;

  // Ordered prefix: "Dragon Ball" ⊆ "Dragon Ball Super".
  if (
    shorter.every((token, index) =>
      titleTokensEquivalent(token, longer[index]),
    )
  ) {
    return true;
  }

  // Single-token franchise inside a longer lead ("Zelda" ⊆ "legend of zelda").
  // Do not treat subtitle reuse ("Naruto" inside a Boruto lead) as agreement:
  // first tokens must still be reconcilable via containment of the short lead.
  if (
    shorter.length === 1 &&
    longer.some((other) => titleTokensEquivalent(shorter[0], other))
  ) {
    return true;
  }

  return false;
}

/**
 * Rejects parallel series that share a subtitle token but not the lead
 * franchise ("Naruto n°03" must not accept "Boruto … Naruto Next Generations").
 * Cross-language titles with no shared lead vocabulary (LOTR FR vs EN) are
 * left to similarity scoring — conflict only when both leads are short
 * franchise names and the requested lead still appears later in the candidate
 * (subtitle / spin-off pollution). Longer leads (multi-word titles) stay out
 * so provider-prefixed catalog titles ("chasseauxlivres - Fantastic Mr. Fox")
 * are not false-conflicted.
 */
export function franchiseLeadTokensConflict(
  requestedName: string,
  candidateTitle: string,
): boolean {
  const requested = franchiseLeadTokens(requestedName);
  const candidate = franchiseLeadTokens(candidateTitle);
  if (requested.length === 0 || candidate.length === 0) return false;
  if (franchiseLeadsShareRoot(requested, candidate)) return false;
  // Single-token (or very short) franchise labels only — multi-word titles
  // use similarity / other gates instead of spin-off pollution.
  if (requested.length > 2 || candidate.length > 2) return false;

  const candidateAll = normalizeVolumeTitleText(
    normalizeMetadataCandidateTitle(candidateTitle),
  )
    .split(/\s+/)
    .filter(Boolean);
  return requested.every((token) =>
    candidateAll.some((other) => titleTokensEquivalent(token, other)),
  );
}

function hasUnrequestedTrailingQualifier(
  requestedName: string,
  resultTitle: string,
): boolean {
  const segments = resultTitle
    .split(/\s*[:\-–—]\s*/g)
    .map((segment) => segment.trim())
    .filter(Boolean);
  if (segments.length < 2) return false;

  const requestedTokens = new Set(normalizeDisplayTitle(requestedName));
  const trailingTokens = normalizeDisplayTitle(segments[segments.length - 1]);
  if (trailingTokens.length === 0) return false;

  return trailingTokens.every((token) => !requestedTokens.has(token));
}

function normalizeEditionNumber(value: string): string {
  return String(Number.parseInt(value, 10));
}

const SUFFIXED_NUMBER_RE = new RegExp(
  `\\d+(?:\\s?${VOLUME_NUMBER_SUFFIX_PATTERN})?`,
  "g",
);

function allNumbers(value: string): string[] {
  return Array.from(
    new Set(
      (normalizeVolumeTitleText(value).match(SUFFIXED_NUMBER_RE) || [])
        .map(normalizeVolumeNumber)
        .filter((number) => number !== "NaN"),
    ),
  );
}

function editionNumbersAreAligned(
  candidateTitle: string,
  comparisonNames: string[],
): boolean {
  const requestedNumbers = Array.from(
    new Set(comparisonNames.flatMap(explicitVolumeNumbers)),
  );
  const candidateEditionNumbers = explicitVolumeNumbers(candidateTitle);

  if (requestedNumbers.length === 0) {
    if (candidateEditionNumbers.length === 0) return true;
    // Bare "WAKFU 3 Les Mines…" vs catalog "Wakfu, Tome 3 : …" — the request
    // has no "tome/n°" marker but still names the same issue number.
    const bareRequested = Array.from(
      new Set(comparisonNames.flatMap(allNumbers)),
    );
    if (bareRequested.length === 0) return false;
    const bareSet = new Set(bareRequested);
    return candidateEditionNumbers.every((number) => bareSet.has(number));
  }

  const requestedSet = new Set(requestedNumbers);
  const candidateNumbers = allNumbers(candidateTitle);
  if (!candidateNumbers.some((number) => requestedSet.has(number))) {
    return false;
  }

  return candidateEditionNumbers.every((number) => requestedSet.has(number));
}

function primaryIssueFromTitle(title: string): string | null {
  const explicit = explicitVolumeNumbers(title)[0];
  if (explicit) return explicit;

  const dotIssue = title.match(/\b(\d+)\s*\.\s+/);
  if (dotIssue?.[1]) return normalizeEditionNumber(dotIssue[1]);

  return null;
}

function compactVolumeTitleForMatch(title: string): string {
  const dotMatch = title.match(/^(.+?)\b(\d+)\s*\.\s+/);
  if (dotMatch) {
    const root = variantIdentityTokens(dotMatch[1]).join(" ");
    const issue = normalizeEditionNumber(dotMatch[2]);
    if (root && issue !== "NaN") return `${root} ${issue}`;
  }

  const issue = primaryIssueFromTitle(title);
  const root = variantIdentityTokens(title).join(" ");
  if (issue && root) return `${root} ${issue}`;
  return title.trim();
}

function stripTrailingPlatformFromComparisonName(name: string): string {
  return stripTrailingPlatformSuffix(name);
}

export function metadataTitleMatchScore(
  result: MetadataResult,
  comparisonNames: string[],
): number {
  // L'alignement crédite TOUS les noms que le provider déclare pour le
  // candidat (titre + aliases + titres régionaux) : la correspondance
  // inter-langues vient de ces données, jamais d'une table de traduction.
  const candidateNames = namesFromMetadataSource(result);
  if (candidateNames.length === 0) return 0;

  return comparisonNames.reduce((bestScore, comparisonName) => {
    const normalizedComparisonName =
      stripTrailingPlatformFromComparisonName(comparisonName);
    const best = candidateNames.reduce((score, candidateName) => {
      const direct = metadataTitleSimilarity(
        candidateName,
        normalizedComparisonName,
      );
      const compact = metadataTitleSimilarity(
        compactVolumeTitleForMatch(candidateName),
        compactVolumeTitleForMatch(normalizedComparisonName),
      );
      return Math.max(score, direct, compact);
    }, 0);
    return Math.max(bestScore, best);
  }, 0);
}

function extractNumeralRange(
  title: string,
): { start: number; end: number } | null {
  const match = title.match(/\b([IVXLCDM]+|\d+)\s*[-–—]\s*([IVXLCDM]+|\d+)\b/i);
  if (!match) return null;
  const start = parseRomanToken(match[1]) ?? Number.parseInt(match[1], 10);
  const end = parseRomanToken(match[2]) ?? Number.parseInt(match[2], 10);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    return null;
  }
  return { start, end };
}

function numeralRangesMismatch(
  requestedName: string,
  candidateTitle: string,
): boolean {
  const requested = extractNumeralRange(requestedName);
  const candidate = extractNumeralRange(candidateTitle);
  if (!requested || !candidate) return false;
  return requested.end < candidate.start || candidate.end < requested.start;
}

/** Reject descriptions that omit a distinctive colon-subtitle (e.g. Blood Dragon). */
export function descriptionMatchesRequestedTitle(
  requestedTitle: string,
  description: string,
): boolean {
  const colonMatch = requestedTitle.match(/^[^:]+:\s*([^:]+)/);
  if (!colonMatch) return true;

  const subtitle = colonMatch[1].replace(/\s+[-–—]\s+.*$/, "").trim();
  if (EDITION_QUALIFIER.test(subtitle)) return true;

  const tokens = normalizeDisplayTitle(subtitle).filter(
    (token) =>
      token.length >= 4 &&
      !["edition", "classic", "game", "the", "sur", "star"].includes(token),
  );
  if (tokens.length === 0) return true;

  const lower = description.toLowerCase();
  return tokens.some((token) => lower.includes(token));
}

export function isMetadataTitleAligned(
  result: MetadataResult,
  comparisonNames: string[],
  minScore: number,
): boolean {
  if (!result.title) return true;
  if (
    comparisonNames.some(
      (name) =>
        isBundleTitle(name) &&
        bundleTitlePartsMatchCatalogTitle(
          name,
          result.title || "",
          result.aliases ?? [],
        ),
    )
  ) {
    return true;
  }
  const primaryComparisonName =
    comparisonNames.find((name) => name.trim())?.trim() || "";
  // Identity / series-line gates must consider every name the provider
  // declares (primary + aliases + regional titles). Rejecting on the English
  // primary alone drops valid FR shelf matches such as LaunchBox
  // "Tomb Raider: The Last Revelation" ↔ "La Révélation Finale".
  const catalogNames = namesFromMetadataSource(result);
  const catalogTitlesForIdentity =
    catalogNames.length > 0 ? catalogNames : [result.title || ""];

  // Fact-based residual: consume known title/volume blocks, judge leftovers
  // (author, merch, volume, series line, unexplained candidate identity…).
  const residual = residualIdentityMatch({
    requestTitles: comparisonNames,
    candidateTitles: catalogTitlesForIdentity,
    candidateAuthors: authorNamesFromMetadata(result.authors),
  });
  if (residual.decision === "accept") return true;
  if (residual.decision === "reject") return false;

  // Merch / volume / series-line variant markers: handled by residual above.
  // "007: Agent Under Fire" looks like a generic fragment of "James Bond 007…"
  // when judged alone, but LaunchBox also declares the full Bond alias — only
  // reject when *every* declared name is a fragment.
  if (
    catalogTitlesForIdentity.every((catalogTitle) =>
      isGenericTitleFragment(catalogTitle, comparisonNames),
    )
  ) {
    return false;
  }
  if (
    primaryComparisonName &&
    catalogTitlesForIdentity.every((catalogTitle) =>
      editionIdentityBasesMismatch(primaryComparisonName, catalogTitle),
    )
  ) {
    return false;
  }
  if (
    primaryComparisonName &&
    catalogTitlesForIdentity.every((catalogTitle) =>
      franchiseLeadTokensConflict(primaryComparisonName, catalogTitle),
    )
  ) {
    return false;
  }
  if (
    primaryComparisonName &&
    catalogTitlesForIdentity.every((catalogTitle) =>
      compactedFranchiseNearMiss(primaryComparisonName, catalogTitle),
    )
  ) {
    return false;
  }
  if (
    comparisonNames.some((name) =>
      catalogTitlesForIdentity.every((catalogTitle) =>
        gameProductIdentityMismatch([name], catalogTitle),
      ),
    )
  ) {
    return false;
  }
  if (
    sameVolumeAlbumSubtitleConflicts(
      comparisonNames,
      namesFromMetadataSource(result),
    )
  ) {
    return false;
  }

  if (
    comparisonNames.some((name) => {
      const base = extractBaseTitleVariant(name);
      if (!base) return false;
      const normalizedCandidate = stripTrailingPlatformSuffix(
        result.title || "",
      );
      return normalizedCandidate.toLowerCase() === base.toLowerCase();
    })
  ) {
    return true;
  }
  if (
    comparisonNames.some((name) => {
      const trimmed = name.trim();
      if (!trimmed) return false;
      const normalizedCandidate = stripTrailingPlatformSuffix(
        result.title || "",
      );
      return normalizedCandidate.toLowerCase() === trimmed.toLowerCase();
    })
  ) {
    return true;
  }
  if (
    !catalogTitlesForIdentity.some((catalogTitle) =>
      editionNumbersAreAligned(catalogTitle, comparisonNames),
    )
  ) {
    return false;
  }
  if (
    !catalogTitlesForIdentity.some((catalogTitle) =>
      franchiseSequelNumbersAreAligned(catalogTitle, comparisonNames),
    )
  ) {
    return false;
  }
  if (
    comparisonNames.some((name) =>
      catalogTitlesForIdentity.every((catalogTitle) =>
        numeralRangesMismatch(name, catalogTitle),
      ),
    )
  ) {
    return false;
  }
  if (
    catalogTitlesForIdentity.every((catalogTitle) =>
      franchiseSequelNumbersConflict(comparisonNames, catalogTitle),
    )
  ) {
    return false;
  }
  return metadataTitleMatchScore(result, comparisonNames) >= minScore;
}

/**
 * Detects a candidate whose title is only a *generic fragment* of the requested
 * title: a strict token-subset of one of the comparison names that drops that
 * name's leading identity token. Catches false matches such as RAWG returning
 * the itch.io game "Retour vers le passé" for "The Lapins Crétins : Retour vers
 * le passé" — it shares the generic subtitle but none of the franchise identity,
 * yet still scores above the alignment threshold via token overlap.
 *
 * Legit base titles keep the leading token and are NOT flagged ("Monopoly" for
 * "Monopoly - Editions ...", "Mario Kart" for "Mario Kart Wii", "The Legend of
 * Zelda: Skyward Sword" for the same with an edition suffix).
 */
export function isGenericTitleFragment(
  candidateTitle: string | undefined,
  comparisonNames: string[],
): boolean {
  if (!candidateTitle) return false;
  const candTokens = normalizeDisplayTitle(candidateTitle);
  if (candTokens.length === 0) return false;
  const candSet = new Set(candTokens);

  let isStrictSubsetOfSome = false;
  for (const name of comparisonNames) {
    const nameTokens = normalizeDisplayTitle(name);
    if (nameTokens.length === 0) continue;
    const nameSet = new Set(nameTokens);
    if (!candTokens.every((token) => nameSet.has(token))) continue;
    if (candTokens.length >= nameTokens.length) return false; // equal/exact → aligned
    isStrictSubsetOfSome = true;
    if (candSet.has(nameTokens[0])) return false; // keeps the leading identity token
    // Catalog "007: Nightfire" keeps the Bond series code from a "James Bond 007…"
    // shelf title — that code is the franchise identity, not a generic subtitle.
    if (
      candTokens.some((token) => /^\d{3}$/.test(token) && nameSet.has(token))
    ) {
      return false;
    }
  }
  return isStrictSubsetOfSome;
}

export function shouldRecheckMetadataMatch(
  requestedName: string,
  current: MetadataResult,
  canonicalFallbackNames: string[],
): boolean {
  if (!current.title) return false;

  if (
    titleIntentYearAlignment(
      extractTitleIntentYear(requestedName),
      current.releaseDate,
    ) === "mismatch"
  ) {
    return true;
  }

  if (canonicalFallbackNames.length === 0) return false;

  if (hasUnrequestedTrailingQualifier(requestedName, current.title)) {
    return true;
  }

  const comparisonNames = [requestedName, ...canonicalFallbackNames];
  return metadataTitleMatchScore(current, comparisonNames) < 0.64;
}

function isBetterMetadataMatch(
  requestedName: string,
  current: MetadataResult,
  candidate: MetadataResult,
  canonicalFallbackNames: string[],
): boolean {
  if (!candidate.title) return false;
  const comparisonNames = [requestedName, ...canonicalFallbackNames];
  const currentScore = metadataTitleMatchScore(current, comparisonNames);
  const candidateScore = metadataTitleMatchScore(candidate, comparisonNames);
  const currentHasExtraQualifier = current.title
    ? hasUnrequestedTrailingQualifier(requestedName, current.title)
    : false;
  const candidateHasExtraQualifier = hasUnrequestedTrailingQualifier(
    requestedName,
    candidate.title,
  );

  if (candidateHasExtraQualifier && !currentHasExtraQualifier) return false;

  const yearPreference = preferReleaseDateMatchingTitleYear(
    extractTitleIntentYear(requestedName),
    current.releaseDate,
    candidate.releaseDate,
  );
  if (yearPreference > 0 && candidateScore >= 0.55) return true;
  if (yearPreference < 0) return false;

  if (candidateScore >= currentScore + 0.08) return true;

  return (
    currentHasExtraQualifier &&
    !candidateHasExtraQualifier &&
    candidateScore >= 0.62
  );
}

export async function findBetterMetadataMatch(
  requestedName: string,
  current: MetadataResult,
  canonicalFallbackNames: string[],
  resolveByName: (name: string) => Promise<MetadataResult | null>,
  options?: { isQuotaBlocked?: () => boolean },
): Promise<MetadataResult | null> {
  if (options?.isQuotaBlocked?.()) return null;

  const intentYear = extractTitleIntentYear(requestedName);
  const currentYearAlign = titleIntentYearAlignment(
    intentYear,
    current.releaseDate,
  );
  const currentKey = cleanSearchQuery(current.title || "").toLowerCase();
  const tryNames: string[] = [];
  const pushName = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    const key = cleanSearchQuery(trimmed).toLowerCase();
    if (tryNames.some((name) => cleanSearchQuery(name).toLowerCase() === key)) {
      return;
    }
    // Same catalog title can still be the wrong remake/year — retry when the
    // shelf year disagrees with the current releaseDate.
    if (key === currentKey && currentYearAlign !== "mismatch") return;
    tryNames.push(trimmed);
  };

  if (currentYearAlign === "mismatch") {
    pushName(stripTitleIntentYear(requestedName) || requestedName);
  }
  for (const fallbackName of canonicalFallbackNames) {
    pushName(fallbackName);
  }

  for (const fallbackName of tryNames.slice(0, 6)) {
    const candidate = await resolveByName(fallbackName);
    if (
      candidate &&
      isBetterMetadataMatch(
        requestedName,
        current,
        candidate,
        canonicalFallbackNames,
      )
    ) {
      return candidate;
    }
  }

  return null;
}
