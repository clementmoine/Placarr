import {
  containsGameOfTheYearEdition,
  createGameEditionMatcher,
} from "@/lib/barcode/listingTerms";
import { normalizeDisplayTitle } from "@/lib/title/displayScore";
import { inferTextLanguage, regionRank } from "@/lib/locale/preference";
import { titleTokensEquivalent, TITLE_PHRASE_EQUIVALENT_GROUPS } from "@/lib/title/tokenEquivalents";
import levenshtein from "fast-levenshtein";
import { explicitVolumeNumbers, normalizeVolumeTitleText, normalizeVolumeNumber } from "@/lib/title/volumeNumber";
import { pickBestCoverFromAttachments } from "@/lib/media/attachmentDisplayScore";
import { cleanSearchQuery } from "@/lib/search/query";
import { buildStructuralTitleSearchVariants, isWeakMetadataSearchFragment } from "@/lib/title/searchVariants";
import { parseRomanToken } from "@/lib/title/romanNumeral";
import { resolveGameMetadataPlatform } from "@/lib/metadata/platform";
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

function isCrossLanguagePhraseTranslation(
  requestedName: string,
  candidate: string,
): boolean {
  const requested = requestedName.toLowerCase();
  const candidateLower = candidate.toLowerCase();
  return TITLE_PHRASE_EQUIVALENT_GROUPS.some((group) => {
    const requestedPhrase = group.find((phrase) =>
      requested.includes(phrase.toLowerCase()),
    );
    const candidatePhrase = group.find(
      (phrase) =>
        candidateLower.includes(phrase.toLowerCase()) &&
        phrase.toLowerCase() !== requestedPhrase?.toLowerCase(),
    );
    return Boolean(requestedPhrase && candidatePhrase);
  });
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

  return unique.slice().sort((a, b) => {
    const aCross = isCrossLanguagePhraseTranslation(requestedName, a) ? 0 : 1;
    const bCross = isCrossLanguagePhraseTranslation(requestedName, b) ? 0 : 1;
    if (aCross !== bCross) return aCross - bCross;

    const aFrench = inferTextLanguage(a) === "fr" ? 0 : 1;
    const bFrench = inferTextLanguage(b) === "fr" ? 0 : 1;
    if (aFrench !== bFrench) return aFrench - bFrench;

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

/** Initial provider lookup queries for a game title (variants + optional platform). */
export function buildGameMetadataSearchQueries(
  name: string,
  platform?: string | null,
  shelfName?: string | null,
): string[] {
  const trimmed = name.trim();
  if (!trimmed) return [];

  const resolvedPlatform = resolveGameMetadataPlatform(
    platform,
    shelfName,
    "games",
  );
  const seen = new Set<string>();
  const queries: string[] = [];

  const push = (value: string) => {
    const candidate = value.replace(/\s+/g, " ").trim();
    if (!candidate) return;
    if (isWeakMetadataSearchFragment(candidate)) return;
    const key = candidate.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    queries.push(candidate);
  };

  push(trimmed);
  for (const variant of buildStructuralTitleSearchVariants(trimmed)) {
    push(variant);
  }
  if (resolvedPlatform) {
    push(`${trimmed} ${resolvedPlatform}`);
    for (const variant of buildStructuralTitleSearchVariants(trimmed).slice(
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

const GAME_PRODUCT_IDENTITY_TERMS = [
  "afterbirth+",
  "afterbirth",
  "repentance",
  "rebirth",
  "wrath of the lamb",
  "antibirth",
  "repop",
  "night springs",
  "the lake house",
] as const;

function normalizeProductIdentityHaystack(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\+/g, " plus ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Distinctive expansion / sequel markers (Repentance, Afterbirth+, RePOP…). */
export function extractGameProductIdentityTerms(text: string): string[] {
  const haystack = normalizeProductIdentityHaystack(text);
  const found: string[] = [];
  for (const term of GAME_PRODUCT_IDENTITY_TERMS) {
    const normalizedTerm = normalizeProductIdentityHaystack(term);
    if (haystack.includes(normalizedTerm)) {
      found.push(normalizedTerm);
    }
  }
  return found;
}

/**
 * True when the request names a specific product identity (Repentance, RePOP…)
 * but the catalog row names a different one (Afterbirth+, base game only…).
 */
export function gameProductIdentityMismatch(
  requestedNames: string[],
  catalogTitle: string,
): boolean {
  const requestedTerms = new Set(
    requestedNames.flatMap(extractGameProductIdentityTerms),
  );
  if (requestedTerms.size === 0) return false;

  const catalogTerms = new Set(extractGameProductIdentityTerms(catalogTitle));
  if (catalogTerms.size === 0) return true;

  for (const term of requestedTerms) {
    if (catalogTerms.has(term)) return false;
  }
  return true;
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

const FRANCHISE_SEQUEL_ROMAN = new Map<string, string>([
  ["ii", "2"],
  ["iii", "3"],
  ["iv", "4"],
  ["v", "5"],
  ["vi", "6"],
  ["vii", "7"],
  ["viii", "8"],
  ["ix", "9"],
  ["x", "10"],
  ["xi", "11"],
  ["xii", "12"],
]);

function pushFranchiseSequelNumber(target: string[], raw: string | undefined) {
  if (!raw) return;
  const normalized = normalizeVolumeNumber(raw);
  if (normalized === "NaN") return;
  target.push(normalized);
}

function isGalleryIndexCaption(title: string): boolean {
  const normalized = normalizeVolumeTitleText(title);
  return /\b(gameplay|screenshot|capture|screen|image|visuel|photo)\s+\d{1,2}\s*$/.test(
    normalized,
  );
}

/** Sequel markers in game franchises ("Baldur's Gate 3", "Resident Evil 2"). */
function franchiseSequelTokens(title: string): string[] {
  const separatorSource = title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[’‘']/g, "'");
  const text = normalizeVolumeTitleText(title);
  if (!text && !separatorSource) return [];

  const numbers: string[] = [];
  if (!isGalleryIndexCaption(title)) {
    for (const match of text.matchAll(
      /\b(\d{1,2})\s*(?=$|\s+(?:deluxe|limited|edition|goty|complete|definitive|ultimate|standard|collection|bundle|remastered|remaster|director|anniversary|gold|platinum|game of the year))\b/gi,
    )) {
      pushFranchiseSequelNumber(numbers, match[1]);
    }
  }

  for (const match of separatorSource.matchAll(/\b(\d{1,2})\s*(?::|(?:-\s))/g)) {
    pushFranchiseSequelNumber(numbers, match[1]);
  }

  for (const match of text.matchAll(
    /\b(ii|iii|iv|v|vi|vii|viii|ix|x|xi|xii)\b/gi,
  )) {
    const mapped = FRANCHISE_SEQUEL_ROMAN.get(match[1].toLowerCase());
    if (mapped) numbers.push(mapped);
  }

  for (const match of separatorSource.matchAll(
    /\b(ii|iii|iv|v|vi|vii|viii|ix|x|xi|xii)\s*(?::|(?:-\s))/gi,
  )) {
    const mapped = FRANCHISE_SEQUEL_ROMAN.get(match[1].toLowerCase());
    if (mapped) numbers.push(mapped);
  }

  // "Borderlands 3 PS4", "Tekken 7 sur PS4", "Halo 4 Xbox One"
  for (const match of text.matchAll(
    /\b(\d{1,2})\s+(?:(?:sur|on|for)\s+)?(?:ps[1-5]|xbox(?:\s+(?:one|series(?:\s+[xs])?|360))?|switch(?:\s+2)?|pc|playstation(?:\s+[1-5])?)\b/gi,
  )) {
    pushFranchiseSequelNumber(numbers, match[1]);
  }

  // "Borderlands 3 [Deluxe Edition]"
  for (const match of text.matchAll(/\b(\d{1,2})\s*(?=\s*[\[(])/g)) {
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
  const requested = Array.from(
    new Set(requestedNames.flatMap(franchiseSequelTokens)),
  );
  const catalog = franchiseSequelTokens(catalogTitle);
  if (catalog.length === 0) return false;
  if (requested.length === 0) return true;

  const requestedSet = new Set(requested);
  return !catalog.some((number) => requestedSet.has(number));
}

/** True when a gallery image title names another product than the shelf item. */
export function catalogAttachmentTitleConflicts(
  productTitle: string | undefined,
  attachmentTitle: string | undefined,
): boolean {
  if (!productTitle?.trim() || !attachmentTitle?.trim()) return false;
  if (gameProductIdentityMismatch([productTitle], attachmentTitle)) return true;
  return franchiseSequelNumbersConflict([productTitle], attachmentTitle);
}

export function supplementGameEditionMetadata(
  requestedName: string,
  edition: MetadataResult,
  base: MetadataResult,
): MetadataResult {
  const title =
    edition.title?.trim() || requestedName.trim() || base.title?.trim();
  const attachments = mergeEditionAttachments(edition.attachments, base.attachments);

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
    backgroundImageUrl:
      edition.backgroundImageUrl?.trim() || base.backgroundImageUrl,
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
    const aPhrase = group.find((phrase) => aLower.includes(phrase.toLowerCase()));
    const bPhrase = group.find((phrase) => bLower.includes(phrase.toLowerCase()));
    return Boolean(
      aPhrase &&
        bPhrase &&
        aPhrase.toLowerCase() !== bPhrase.toLowerCase(),
    );
  });
}

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

  return Math.max(tokenScore, distanceScore);
}

const VARIANT_ALIGNMENT_STOP_WORDS = new Set([
  "tome",
  "vol",
  "volume",
  "numero",
  "num",
  "no",
  "n",
  "edition",
  "ed",
]);

/** Listing/platform tokens that do not change which product is meant. */
const NEUTRAL_LISTING_TOKENS = new Set([
  "dlc",
  "expansion",
  "addon",
  "season",
  "pass",
  "sur",
  "ps4",
  "ps5",
  "xbox",
  "switch",
  "series",
  "pc",
  "one",
  "nintendo",
]);

function isNeutralListingToken(token: string): boolean {
  return NEUTRAL_LISTING_TOKENS.has(token.toLowerCase());
}

function normalizeMetadataCandidateTitle(title: string): string {
  return title
    .replace(
      /\s+sur\s+(?:PS\d+|Xbox(?:\s+One|\s+Series)?|Switch|PC|Nintendo\s+Switch)\s*$/i,
      "",
    )
    .replace(/\bdlc\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function variantIdentityTokens(title: string): string[] {
  const withoutVolume = title
    .replace(/\bn[°º]?\s*0*\d+\b/gi, " ")
    .replace(/\btome\s*0*\d+\b/gi, " ")
    .replace(/\bvol\.?\s*0*\d+\b/gi, " ")
    .replace(/\bno\.?\s*0*\d+\b/gi, " ");
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

function isVariantMarkerToken(token: string): boolean {
  const lower = token.toLowerCase();
  if (isNeutralListingToken(lower)) return false;
  if (lower.length === 1 && /[a-z]/.test(lower)) return true;
  if (lower.length >= 2 && lower.length <= 3) {
    return /^[bcdfghjklmnpqrstvwxyz]{2,3}$/i.test(lower);
  }
  return false;
}

function isStylizedTitleConnector(token: string, candidateTitle: string): boolean {
  return (
    token.toLowerCase() === "x" &&
    /\b\w+\s+x\s+\w+\b/i.test(candidateTitle.trim())
  );
}

function requestedIdentityTokens(requestedName: string): string[] {
  const tokens = new Set(variantIdentityTokens(requestedName));
  for (const variant of buildStructuralTitleSearchVariants(requestedName)) {
    for (const token of variantIdentityTokens(variant)) {
      tokens.add(token);
    }
  }
  return [...tokens];
}

function suffixTokenAllowed(token: string, allowedSuffix: string[]): boolean {
  return allowedSuffix.some((allowed) => titleTokensEquivalent(token, allowed));
}

/**
 * Detects spinoff/variant markers present in a catalog title but absent from
 * the requested name (SD, Z, GT, …). Keeps legitimate series names intact
 * when the marker is part of the request ("Dragon Ball Z n°01").
 */
export function hasUnrequestedVariantMarker(
  requestedName: string,
  candidateTitle: string,
): boolean {
  const requested = new Set(requestedIdentityTokens(requestedName));
  if (requested.size === 0) return false;

  const extra = variantIdentityTokens(
    normalizeMetadataCandidateTitle(candidateTitle),
  ).filter(
    (token) =>
      ![...requested].some((known) => titleTokensEquivalent(token, known)),
  );
  return extra.some(
    (token) =>
      !isNeutralListingToken(token) &&
      isVariantMarkerToken(token) &&
      !isStylizedTitleConnector(token, candidateTitle),
  );
}

/**
 * When the request names a series suffix ("Super", "Z"…), rejects candidates
 * that insert extra identity tokens into that suffix ("super livre", "Z Kai").
 * When the request only names the base franchise ("Dragon Ball n°01"), still
 * rejects spinoff markers (SD, GT…) but allows album/chapter subtitles after
 * the shared prefix ("Le nuage supersonique").
 */
export function hasUnrequestedSeriesSuffixToken(
  requestedName: string,
  candidateTitle: string,
): boolean {
  const requested = variantIdentityTokens(requestedName);
  const candidate = variantIdentityTokens(
    normalizeMetadataCandidateTitle(candidateTitle),
  );
  if (requested.length === 0 || candidate.length === 0) return false;

  let prefixLen = 0;
  while (
    prefixLen < requested.length &&
    prefixLen < candidate.length &&
    (requested[prefixLen] === candidate[prefixLen] ||
      titleTokensEquivalent(requested[prefixLen], candidate[prefixLen]))
  ) {
    prefixLen++;
  }

  // Cross-language or differently tokenized titles (LOTR FR vs EN) share no
  // prefix — defer to similarity scoring instead of suffix-token rules.
  if (prefixLen === 0) return false;

  const requestedSuffix = requested.slice(prefixLen);
  const candidateSuffix = candidate.slice(prefixLen);

  if (requestedSuffix.length === 0) {
    return candidateSuffix.some(
      (token) =>
        isVariantMarkerToken(token) &&
        !isStylizedTitleConnector(token, candidateTitle),
    );
  }

  // Require a multi-token franchise root before comparing series lines
  // ("Dragon Ball Super" vs "Dragon Ball super livre"). Single-token roots
  // defer to similarity scoring (e.g. "Zapper" FR vs EN subtitles).
  if (prefixLen < 2) return false;

  if (requestedSuffix.length > 0 && candidateSuffix.length > 0) {
    const sharesSuffixToken = requestedSuffix.some((token) =>
      candidateSuffix.some((other) => titleTokensEquivalent(token, other)),
    );
    if (!sharesSuffixToken) {
      const requestedSequel = franchiseSequelTokens(requestedName);
      const candidateSequel = franchiseSequelTokens(candidateTitle);
      if (
        requestedSequel.length > 0 &&
        candidateSequel.some((number) => requestedSequel.includes(number))
      ) {
        return false;
      }
    }
  }

  return candidateSuffix
    .filter((token) => !isNeutralListingToken(token))
    .some((token) => !suffixTokenAllowed(token, requestedSuffix));
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

function allNumbers(value: string): string[] {
  return Array.from(
    new Set(
      (normalizeVolumeTitleText(value).match(/\d+/g) || [])
        .map(normalizeEditionNumber)
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
    return candidateEditionNumbers.length === 0;
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

const TRAILING_PLATFORM_COMPARISON_SUFFIX =
  /\s+(?:ps5|ps4|ps3|ps2|ps1|psp|psvita|switch2?|xbox(?:\s+one|\s+series(?:\s+x)?)?|wiiu?|3ds|nes|snes|n64|gamecube|gba|gbc|gb|ds|pc)\s*$/i;

function stripTrailingPlatformFromComparisonName(name: string): string {
  return name.replace(TRAILING_PLATFORM_COMPARISON_SUFFIX, "").trim();
}

export function metadataTitleMatchScore(
  result: MetadataResult,
  comparisonNames: string[],
): number {
  const title = result.title || "";
  if (!title) return 0;

  return comparisonNames.reduce((bestScore, comparisonName) => {
    const normalizedComparisonName =
      stripTrailingPlatformFromComparisonName(comparisonName);
    const direct = metadataTitleSimilarity(title, normalizedComparisonName);
    const compact = metadataTitleSimilarity(
      compactVolumeTitleForMatch(title),
      compactVolumeTitleForMatch(normalizedComparisonName),
    );
    return Math.max(bestScore, direct, compact);
  }, 0);
}

function extractNumeralRange(title: string): { start: number; end: number } | null {
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

  let subtitle = colonMatch[1].replace(/\s+[-–—]\s+.*$/, "").trim();
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
  if (isGenericTitleFragment(result.title, comparisonNames)) return false;
  const primaryComparisonName =
    comparisonNames.find((name) => name.trim())?.trim() || "";
  if (
    primaryComparisonName &&
    hasUnrequestedVariantMarker(primaryComparisonName, result.title || "")
  ) {
    return false;
  }
  if (
    primaryComparisonName &&
    editionIdentityBasesMismatch(primaryComparisonName, result.title || "")
  ) {
    return false;
  }
  if (
    primaryComparisonName &&
    hasUnrequestedSeriesSuffixToken(primaryComparisonName, result.title || "")
  ) {
    return false;
  }
  if (
    comparisonNames.some((name) =>
      gameProductIdentityMismatch([name], result.title || ""),
    )
  ) {
    return false;
  }
  const stripChocoBonPlanPlatformSuffix = (title: string) =>
    title
      .replace(
        /\s+sur\s+(?:PS\d+|Xbox(?:\s+One|\s+Series)?|Switch|PC|Nintendo\s+Switch)\s*$/i,
        "",
      )
      .trim();

  if (
    comparisonNames.some((name) => {
      const base = extractBaseTitleVariant(name);
      if (!base) return false;
      const normalizedCandidate = stripChocoBonPlanPlatformSuffix(
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
      const normalizedCandidate = stripChocoBonPlanPlatformSuffix(
        result.title || "",
      );
      return normalizedCandidate.toLowerCase() === trimmed.toLowerCase();
    })
  ) {
    return true;
  }
  if (!editionNumbersAreAligned(result.title, comparisonNames)) return false;
  if (!franchiseSequelNumbersAreAligned(result.title, comparisonNames)) {
    return false;
  }
  if (
    comparisonNames.some((name) =>
      numeralRangesMismatch(name, result.title || ""),
    )
  ) {
    return false;
  }
  if (franchiseSequelNumbersConflict(comparisonNames, result.title || "")) {
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
  }
  return isStrictSubsetOfSome;
}

export function shouldRecheckMetadataMatch(
  requestedName: string,
  current: MetadataResult,
  canonicalFallbackNames: string[],
): boolean {
  if (!current.title || canonicalFallbackNames.length === 0) return false;

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

  const currentKey = cleanSearchQuery(current.title || "").toLowerCase();
  const candidates = canonicalFallbackNames.filter(
    (fallbackName) =>
      cleanSearchQuery(fallbackName).toLowerCase() !== currentKey,
  );

  for (const fallbackName of candidates.slice(0, 6)) {
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
