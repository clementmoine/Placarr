import { cleanCode } from "@/core/identify/query";
import { barcodeSuggestsPalRegion } from "@/core/identify/normalize";
import { containsGameClassicsKeyword } from "@/core/identify/listingTerms";
import { resolveGameMetadataPlatform } from "@/core/enrich/platform";
import { buildPriceSearchQueries } from "@/core/commerce/pricing/searchQueries";
import type {
  BarcodePriceRefreshContext,
  MatchContext,
  MetadataAdapterContext,
  ProviderProductUrlRef,
} from "@/types/providerModule";

function uniqueNonEmpty(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const trimmed = value?.trim();
    if (!trimmed) continue;
    const key = trimmed
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

function uniqueBarcodes(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const cleaned = cleanCode(value);
    if (!cleaned || seen.has(cleaned)) continue;
    seen.add(cleaned);
    out.push(cleaned);
  }
  return out;
}

export type BuildMatchContextInput = {
  shelfType: string;
  shelfName?: string | null;
  primaryTitle: string;
  /** Soft titles (aliases, metadata title, cache raw names…). */
  titles?: Array<string | null | undefined>;
  /** Hard-acceptance titles (item + metadata title). Defaults to primary. */
  acceptanceTitles?: Array<string | null | undefined>;
  barcodes?: Array<string | null | undefined>;
  platformKey?: string | null;
  releaseDate?: string | null;
  externalIds?: Record<string, string | null | undefined>;
  providerProductUrls?: readonly ProviderProductUrlRef[];
  /** Extra haystacks for PAL / classics heuristics (cache raw names…). */
  regionHints?: Array<string | null | undefined>;
  isPal?: boolean;
  isClassics?: boolean;
};

/**
 * Build the shared match bag once per enrich / price pass.
 * Callers merge provider contributions into the input fields first.
 */
export function buildMatchContext(input: BuildMatchContextInput): MatchContext {
  const primaryTitle = input.primaryTitle.trim();
  const titles = uniqueNonEmpty([primaryTitle, ...(input.titles ?? [])]);
  const acceptanceTitles = uniqueNonEmpty(
    input.acceptanceTitles?.length ? input.acceptanceTitles : [primaryTitle],
  );
  const barcodes = uniqueBarcodes(input.barcodes ?? []);
  const platformKey =
    input.platformKey?.trim() ||
    resolveGameMetadataPlatform(
      input.platformKey,
      input.shelfName,
      input.shelfType,
    ) ||
    null;

  const regionHaystacks = uniqueNonEmpty([
    primaryTitle,
    input.shelfName,
    ...(input.regionHints ?? []),
  ]);
  const hasNtscIndicator = regionHaystacks.some((value) =>
    /\b(ntsc|us|usa|jp|jpn|japan)\b/i.test(value),
  );
  const primaryBarcode = barcodes[0];
  const isPal =
    input.isPal ??
    (primaryBarcode
      ? barcodeSuggestsPalRegion(primaryBarcode)
      : !hasNtscIndicator);
  const isClassics =
    input.isClassics ??
    regionHaystacks.some((value) => containsGameClassicsKeyword(value));

  return {
    barcodes,
    primaryTitle,
    titles,
    acceptanceTitles,
    shelfType: input.shelfType,
    shelfName: input.shelfName ?? null,
    platformKey,
    releaseDate: input.releaseDate?.trim() || null,
    isPal,
    isClassics,
    providerProductUrls: input.providerProductUrls,
    externalIds: input.externalIds,
  };
}

/** Preferred barcode for lookup, or `""` when title-only. */
export function matchPrimaryBarcode(match: MatchContext): string {
  return match.barcodes?.[0] ?? "";
}

/** Every digits-only barcode known for this item. */
export function matchBarcodes(match: MatchContext): string[] {
  if (match.barcodes?.length) return match.barcodes;
  const legacy = match as BarcodePriceRefreshContext;
  const cleaned = legacy.cleanedBarcode?.trim();
  return cleaned ? [cleaned] : [];
}

/** Soft titles for provider search / pickBest. */
export function matchLookupTitles(match: MatchContext): string[] {
  if (match.titles?.length) return match.titles;
  // Legacy BarcodePriceRefreshContext fixtures may omit `titles`.
  const legacy = match as BarcodePriceRefreshContext;
  return uniqueNonEmpty([legacy.primaryName, ...(legacy.fallbackNames ?? [])]);
}

/** Hard titles for marketplace / listing validation. */
export function matchAcceptanceTitles(match: MatchContext): string[] {
  if (match.acceptanceTitles?.length) return match.acceptanceTitles;
  const lookup = matchLookupTitles(match);
  return lookup.slice(0, Math.min(2, lookup.length));
}

/**
 * Seek queries for price scrapers: every known barcode, primary title, then
 * title variants. Prefer this over `[cleanedBarcode, ...fallbackNames]` so a
 * secondary EAN contributed by metadata is tried by every provider.
 * Caps title seeks tightly — each seek is a sequential HTTP round-trip.
 */
export function matchPriceSeekQueries(
  ctx: Pick<
    BarcodePriceRefreshContext,
    "barcodes" | "cleanedBarcode" | "primaryName" | "fallbackNames"
  >,
): string[] {
  const codes = uniqueNonEmpty([...(ctx.barcodes ?? []), ctx.cleanedBarcode]);
  // With a barcode, one title fallback is enough. Title-only needs two.
  const maxTitleSeeks = codes.length > 0 ? 1 : 2;
  const titles = uniqueNonEmpty([
    ctx.primaryName,
    ...(ctx.fallbackNames ?? []),
  ]).slice(0, maxTitleSeeks);
  return uniqueNonEmpty([...codes, ...titles]);
}

/**
 * Price-refresh context: MatchContext + legacy aliases still read by providers.
 * Search-query expansions go into `fallbackNames` / `leDenicheurQueries` only —
 * `titles` stays the soft-match bag (aliases), never media-hint rewrites.
 */
export function toBarcodePriceRefreshContext(
  match: MatchContext,
  options: {
    expandSearchQueries?: boolean;
    signal?: AbortSignal;
    evidenceOnly?: boolean;
  } = {},
): BarcodePriceRefreshContext {
  const cleanedBarcode = matchPrimaryBarcode(match);
  /** Cap alias expansion — each title becomes several marketplace HTTP seeks. */
  const titleSeed = match.titles.slice(0, 3);
  const expanded = options.expandSearchQueries
    ? buildPriceSearchQueries(titleSeed, match.shelfName)
    : titleSeed;
  const searchTitles = expanded.slice(0, 4);
  const primaryKey = match.primaryTitle
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const fallbackNames = searchTitles.filter((title) => {
    const key = title
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
    return key !== primaryKey;
  });
  const leDenicheurQueries = uniqueNonEmpty([
    ...match.barcodes,
    ...searchTitles,
  ]).slice(0, 5);

  return {
    ...match,
    cleanedBarcode,
    primaryName: match.primaryTitle,
    fallbackNames,
    leDenicheurQueries,
    isPal: match.isPal ?? true,
    isClassics: match.isClassics ?? false,
    ...(options.signal ? { signal: options.signal } : {}),
    ...(options.evidenceOnly ? { evidenceOnly: true } : {}),
  };
}

/**
 * Overlay MatchContext onto a metadata adapter context (stage progression).
 * Safe to call repeatedly — scalars stay in sync with `match`.
 */
export function withMatchOnAdapterContext(
  base: MetadataAdapterContext,
  match: MatchContext,
): MetadataAdapterContext {
  const primaryBarcode = matchPrimaryBarcode(match);
  const titles = matchLookupTitles(match);
  return {
    ...base,
    match,
    name: match.primaryTitle || base.name,
    barcode: primaryBarcode || base.barcode,
    platform: match.platformKey ?? base.platform,
    shelfName: match.shelfName ?? base.shelfName,
    fallbackNames: titles.filter((title) => {
      const key = title
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();
      const primary = match.primaryTitle
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();
      return key !== primary;
    }),
    lookupQueries:
      base.lookupQueries && base.lookupQueries.length > 0
        ? base.lookupQueries
        : titles,
    releaseDate: match.releaseDate ?? base.releaseDate,
    externalIds: {
      ...(base.externalIds ?? {}),
      ...(match.externalIds as Record<string, string | null> | undefined),
    },
  };
}

/** Ensure adapter resolves against the shared match bag when present. */
export function normalizeMetadataAdapterContext(
  ctx: MetadataAdapterContext,
): MetadataAdapterContext {
  if (!ctx.match) return ctx;
  return withMatchOnAdapterContext(ctx, ctx.match);
}

/** Harvest barcodes a metadata result may have contributed. */
export function barcodesFromMetadataContribution(input: {
  barcode?: string | null;
  itemBarcode?: string | null;
}): string[] {
  return uniqueBarcodes([input.itemBarcode, input.barcode]);
}

/** Aggregate titles / barcodes / dates providers already returned. */
export function matchInputsFromMetadataResults(
  results: Array<{
    title?: string | null;
    aliases?: string[] | null;
    regionalTitles?: Array<{ text?: string | null }> | null;
    barcode?: string | null;
    releaseDate?: string | null;
    platformKey?: string | null;
    externalIds?: Record<string, string | null | undefined> | null;
  }>,
): Pick<
  BuildMatchContextInput,
  "titles" | "barcodes" | "releaseDate" | "platformKey" | "externalIds"
> {
  const titles = results.flatMap((result) => [
    result.title,
    ...(result.aliases ?? []),
    ...(result.regionalTitles ?? []).map((entry) => entry.text),
  ]);
  const barcodes = results.map((result) => result.barcode);
  const externalIds: Record<string, string | null | undefined> = {};
  for (const result of results) {
    if (!result.externalIds) continue;
    for (const [key, value] of Object.entries(result.externalIds)) {
      if (value && !externalIds[key]) externalIds[key] = value;
    }
  }
  const withDate = results.find((result) => result.releaseDate?.trim());
  const withPlatform = results.find((result) => result.platformKey?.trim());
  return {
    titles,
    barcodes,
    releaseDate: withDate?.releaseDate ?? null,
    platformKey: withPlatform?.platformKey ?? null,
    externalIds: Object.keys(externalIds).length > 0 ? externalIds : undefined,
  };
}
