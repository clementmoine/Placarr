/**
 * Metadata provider search queries and fallback name lists.
 */
import {
  inferTextLanguage,
  preferredLanguage,
  regionRank,
} from "@/core/locale/preference";
import {
  cleanSearchQuery,
  stripLegalMarkSymbols,
} from "@/core/enrich/search/query";
import {
  buildStructuralTitleSearchVariants,
  isWeakMetadataSearchFragment,
} from "@/core/enrich/titles/searchVariants";
import { stripTitleIntentYear } from "@/core/enrich/titles/intentYear";
import { buildBundleMetadataSearchQueries } from "@/core/enrich/bundleTitle";
import { resolveGameMetadataPlatform } from "@/core/enrich/platform";
import { extractBaseTitleVariant } from "@/core/enrich/titles/gameEditionVariant";
import { metadataTitleSimilarity } from "@/core/enrich/titles/titleSimilarity";
import type { MetadataResult } from "@/types/metadataProvider";

export function namesFromMetadataSource(source: MetadataResult): string[] {
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
 * Hardware lookup queries — structural title variants only (no game platform
 * suffix bag). Console names already carry the platform identity.
 */
export function buildHardwareMetadataSearchQueries(name: string): string[] {
  const trimmed = stripLegalMarkSymbols(name.trim()) || name.trim();
  if (!trimmed) return [];

  const searchBase = stripTitleIntentYear(trimmed) || trimmed;

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
  const baseVariant = extractBaseTitleVariant(searchBase);
  if (baseVariant) push(baseVariant);

  return queries;
}

