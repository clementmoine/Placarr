import { detectPlatformKey } from "@/lib/barcode/query";
import {
  areLikelySameProduct,
  cleanTitleForDisplay,
  getSequelIndicators,
  isListingDiscardable,
  normalizeForTokens,
} from "@/lib/barcode/titleUtils";
import { cleanSearchQuery } from "@/services/metadataSearchUtils";
import {
  isCanonicalProvider,
  isTrustedRetailerProvider,
  sourceWeightForProvider,
} from "@/services/providerEvidence";
import { decode as decodeHTMLEntities } from "html-entities";
import levenshtein from "fast-levenshtein";

import type {
  ParsedProductName,
  ProductEvidence,
  SourceProduct,
} from "./types";

function normalizeTitleIdentity(
  name: string,
  stripListingNoise = true,
): string {
  const title = stripListingNoise ? cleanSearchQuery(name) || name : name;
  return normalizeForTokens(title)
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseProductName(
  rawName: string,
  preserveDisplayTitle = false,
): ParsedProductName {
  const decoded = decodeHTMLEntities(rawName || "");
  const cleanName = cleanTitleForDisplay(decoded, {
    preservePlatformSuffix: preserveDisplayTitle,
  });
  const title = preserveDisplayTitle
    ? cleanName
    : cleanTitleForDisplay(cleanSearchQuery(cleanName) || cleanName);
  const normalizedTitle = normalizeTitleIdentity(
    title || cleanName,
    !preserveDisplayTitle,
  );
  const normalizedRaw = normalizeForTokens(cleanName);
  const tokens = new Set(normalizedTitle.split(/\s+/).filter(Boolean));
  const indicators = getSequelIndicators(normalizedTitle);
  // `cleanName` strips the platform suffix for marketplace listings (e.g.
  // "… - Xbox" → "…"), so fall back to the raw decoded name to keep the
  // platform signal — otherwise a game named after a movie loses its only
  // game-vs-movie discriminator and gets misclassified.
  const platformKey =
    detectPlatformKey(cleanName) || detectPlatformKey(decoded) || undefined;
  const region = normalizedRaw
    .match(/\b(pal|ntsc|usa|us|eur|eu|uk|jp|jpn|japan|fr|fra)\b/)?.[1]
    ?.toUpperCase();
  const year = cleanName.match(/\b(19|20)\d{2}\b/)?.[0];
  const edition = normalizedRaw.match(
    /\b(classics|platinum|essential|essentials|players choice|player's choice|greatest hits|nintendo selects|best of|collector|collectors|limited|limitee|limitee|edition)\b/,
  )?.[1];

  return {
    rawName,
    cleanName,
    title: title || cleanName,
    normalizedTitle,
    platformKey,
    region,
    edition,
    year,
    tokens,
    indicators,
  };
}

function indicatorsMatch(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const indicator of a) {
    if (!b.has(indicator)) return false;
  }
  return true;
}

export function evidenceSimilarity(
  a: ProductEvidence,
  b: ProductEvidence,
): number {
  if (!a.parsed.normalizedTitle || !b.parsed.normalizedTitle) return 0;
  if (!indicatorsMatch(a.parsed.indicators, b.parsed.indicators)) return 0;

  const aNorm = a.parsed.normalizedTitle;
  const bNorm = b.parsed.normalizedTitle;
  if (aNorm === bNorm) return 1;
  if (a.coverUrl && b.coverUrl && a.coverUrl === b.coverUrl) return 0.98;

  const platformConflict =
    a.parsed.platformKey &&
    b.parsed.platformKey &&
    a.parsed.platformKey !== b.parsed.platformKey;
  if (platformConflict && a.isCanonical && b.isCanonical) {
    return 0;
  }

  const dist = levenshtein.get(aNorm, bNorm);
  const maxLen = Math.max(aNorm.length, bNorm.length);
  const levenshteinScore = maxLen > 0 ? 1 - dist / maxLen : 0;
  const containsScore =
    aNorm.includes(bNorm) || bNorm.includes(aNorm) ? 0.24 : 0;
  const intersection = [...a.parsed.tokens].filter(
    (token) => token.length > 3 && b.parsed.tokens.has(token),
  );
  const tokenScore =
    Math.min(0.36, intersection.length * 0.12) +
    (intersection.length >=
      Math.min(a.parsed.tokens.size, b.parsed.tokens.size) &&
    intersection.length > 0
      ? 0.12
      : 0);

  return Math.max(
    levenshteinScore,
    levenshteinScore + containsScore,
    tokenScore,
  );
}

export const GENERIC_TITLE_TOKENS = new Set([
  "the",
  "and",
  "for",
  "with",
  "le",
  "la",
  "les",
  "des",
  "de",
  "du",
  "un",
  "une",
  "jeu",
  "game",
  "edition",
  "version",
]);

function distinctiveExtraTokens(
  a: ProductEvidence,
  b: ProductEvidence,
): string[] {
  const aTokens = [...a.parsed.tokens].filter(
    (token) => token.length > 3 && !GENERIC_TITLE_TOKENS.has(token),
  );
  const bTokens = [...b.parsed.tokens].filter(
    (token) => token.length > 3 && !GENERIC_TITLE_TOKENS.has(token),
  );
  return [
    ...aTokens.filter((token) => !b.parsed.tokens.has(token)),
    ...bTokens.filter((token) => !a.parsed.tokens.has(token)),
  ];
}

export function areEvidenceSameProduct(
  a: ProductEvidence,
  b: ProductEvidence,
): boolean {
  const score = evidenceSimilarity(a, b);
  const extraTokens = distinctiveExtraTokens(a, b);
  const hasDistinctiveSubtitle =
    extraTokens.length > 0 &&
    a.parsed.tokens.size >= 2 &&
    b.parsed.tokens.size >= 2;

  if (
    hasDistinctiveSubtitle &&
    a.isCanonical === b.isCanonical &&
    score < 0.82
  ) {
    return false;
  }

  if (score >= 0.62) return true;

  const aFirstSig = [...a.parsed.tokens].find((token) => token.length > 3);
  const bFirstSig = [...b.parsed.tokens].find((token) => token.length > 3);
  return !!aFirstSig && aFirstSig === bFirstSig && score >= 0.36;
}

export function buildProductEvidence(
  providerName: string,
  product: SourceProduct,
  canonicalOverride?: boolean,
): ProductEvidence | null {
  const isTrustedRetailer =
    canonicalOverride == null && isTrustedRetailerProvider(providerName);
  const isCanonical =
    canonicalOverride === true ||
    (canonicalOverride == null &&
      isCanonicalProvider(providerName) &&
      !isTrustedRetailer);
  const preserveDisplayTitle = isCanonical || isTrustedRetailer;
  const parsedBase = parseProductName(product.name, preserveDisplayTitle);
  const parsed = product.platformKey
    ? { ...parsedBase, platformKey: product.platformKey }
    : parsedBase;
  if (!parsed.title || isListingDiscardable(parsed.cleanName)) return null;
  const priority = isCanonical
    ? product.isAlias
      ? 1
      : 2
    : isTrustedRetailer
      ? 1
      : 0;

  return {
    providerName,
    rawName: parsed.rawName,
    cleanName: parsed.cleanName,
    title: parsed.title,
    coverUrl: product.coverUrl || null,
    isCanonical,
    isTrustedRetailer,
    isAlias: !!product.isAlias,
    region: product.region || null,
    priority,
    sourceWeight: sourceWeightForProvider(providerName, !!product.isAlias),
    parsed,
  };
}

export function uniqueClean(
  values: string[],
  options: { preservePlatformSuffix?: boolean } = {},
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const cleaned = cleanTitleForDisplay(
      decodeHTMLEntities(value || ""),
      options,
    );
    const key = cleaned.toLowerCase().trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(cleaned);
  }
  return out;
}
