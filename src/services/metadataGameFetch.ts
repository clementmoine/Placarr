import {
  buildGameMetadataFallbackNames,
  collectCanonicalFallbackNames,
  findBetterScreenScraperMatch,
  isMetadataTitleAligned,
  shouldRecheckScreenScraperMatch,
} from "@/lib/metadataTitleMatching";
import {
  dedupeFacts,
  dedupeFieldEvidence,
  metadataFieldEvidence,
} from "@/services/metadataFacts";
import {
  mergeGameMetadata,
  preferRequestedDisplayTitle,
} from "@/services/metadataMerge";
import {
  isPcLikeGamePlatform,
  orderedProviderIdsForType,
} from "@/services/metadataProviderSelection";
import {
  fetchFromRawg,
  fetchFromScreenScraper,
  metadataProviderResolverMap,
} from "@/services/metadataResolvers";
import { fetchFromIGDB } from "@/services/providers/igdb";
import { fetchFromHowLongToBeat } from "@/services/providers/howlongtobeat";
import { fetchFromCoverProject } from "@/services/providers/coverproject";
import { fetchFromLaunchBox } from "@/services/providers/launchbox";
import { fetchFromTheGamesDB } from "@/services/providers/thegamesdb";
import { fetchFromSteamGridDB } from "@/services/providers/steamgriddb";
import { isScreenScraperQuotaBlocked } from "@/services/providers/screenscraper/cache";
import {
  areDisplayTitlesSameProduct,
  requestedTitleCoversCurrentTitle,
} from "@/lib/displayTitleScore";
import { loadBarcodeAlternateNames } from "@/lib/barcodeAlternateNames";
import { pickDiscoveredBarcode } from "@/lib/barcode/normalize";
import { cleanCode } from "@/lib/barcode/query";
import {
  resolveMetadataProvidersInOrder,
  runQueuedMetadataProviderCall,
} from "@/lib/metadataProviderQueue";
import { fetchMetadataFromPriceCharting } from "@/services/providers/pricecharting";
import { fetchMetadataFromPriceChartingByName } from "@/services/providers/pricecharting/fetch";
import type { PriceChartingMetadata } from "@/services/providers/pricecharting/fetch";
import type { MetadataFact, MetadataResult } from "@/types/metadataProvider";

function resolvePriceChartingTitleFallback(
  pcMeta: PriceChartingMetadata | null | undefined,
  alignmentNames: string[],
): string | undefined {
  const title = pcMeta?.title?.trim();
  if (!title) return undefined;
  if (!isMetadataTitleAligned({ title }, alignmentNames, 0.58)) {
    return undefined;
  }
  return title;
}

function applyPriceChartingTitleFallback(
  merged: MetadataResult,
  pcTitle: string | undefined,
  alignmentNames: string[],
): MetadataResult {
  if (!pcTitle) return merged;
  if (!merged.title?.trim()) {
    return { ...merged, title: pcTitle };
  }
  if (
    !isMetadataTitleAligned(merged, alignmentNames, 0.58) &&
    isMetadataTitleAligned({ title: pcTitle }, alignmentNames, 0.58)
  ) {
    const aliases = Array.from(
      new Set([merged.title, ...(merged.aliases || [])]),
    ).filter(
      (alias) => alias.toLowerCase().trim() !== pcTitle.toLowerCase().trim(),
    );
    return {
      ...merged,
      title: pcTitle,
      aliases: aliases.length > 0 ? aliases : undefined,
    };
  }
  return merged;
}

function preferRequestedDisplayTitleWithPriceCharting(
  metadata: MetadataResult,
  requestedName: string,
  pcTitleFallback?: string,
): MetadataResult {
  if (
    pcTitleFallback &&
    metadata.title === pcTitleFallback &&
    areDisplayTitlesSameProduct(pcTitleFallback, requestedName) &&
    !requestedTitleCoversCurrentTitle(requestedName, pcTitleFallback)
  ) {
    const requestedTitle = requestedName.trim();
    const aliases = Array.from(
      new Set([requestedTitle, ...(metadata.aliases || [])]),
    ).filter(
      (alias) =>
        alias.toLowerCase().trim() !== pcTitleFallback.toLowerCase().trim(),
    );
    return {
      ...metadata,
      aliases: aliases.length > 0 ? aliases : undefined,
    };
  }

  return preferRequestedDisplayTitle(metadata, requestedName);
}

function dropMisalignedGameMetadata(
  result: MetadataResult | null,
  alignmentNames: string[],
): MetadataResult | null {
  const comparisonNames = alignmentNames
    .map((value) => value.trim())
    .filter(Boolean);
  if (!result?.title || comparisonNames.length === 0) return result;
  return isMetadataTitleAligned(result, comparisonNames, 0.58) ? result : null;
}

function mergeMetadataFallbackNames(
  requestedName: string,
  barcodeAlternateNames: string[],
  sources: Array<MetadataResult | null | undefined>,
  extraNames: string[] = [],
): string[] {
  return buildGameMetadataFallbackNames(
    requestedName,
    barcodeAlternateNames,
    sources,
    extraNames,
  );
}

async function resolveWithFallbackNames(
  fallbackNames: string[],
  fetcher: (query: string) => Promise<MetadataResult | null>,
  options: {
    limit?: number;
    validate?: (result: MetadataResult, query: string) => boolean;
  } = {},
): Promise<MetadataResult | null> {
  const limit = options.limit ?? 12;
  for (const query of fallbackNames.slice(0, limit)) {
    const result = await fetcher(query);
    if (!result) continue;
    if (options.validate && !options.validate(result, query)) continue;
    return result;
  }
  return null;
}

function gameMetadataSources(
  ...sources: Array<MetadataResult | null | undefined>
): Array<MetadataResult | null | undefined> {
  return sources;
}

function hasUsableCover(
  ...sources: Array<MetadataResult | null | undefined>
): boolean {
  for (const source of sources) {
    if (!source) continue;
    if (source.imageUrl?.trim()) return true;
    if (
      source.attachments?.some(
        (attachment) => attachment.type === "cover" && attachment.url?.trim(),
      )
    ) {
      return true;
    }
  }
  return false;
}

export async function fetchFromAllGameSources(
  name: string,
  barcode?: string | null,
  platform?: string | null,
  options?: { isBackground?: boolean },
): Promise<MetadataResult | null> {
  const includePcSources = isPcLikeGamePlatform(platform);
  const gameProviderOrder = [
    "screenscraper",
    "igdb",
    "thegamesdb",
    "launchbox",
    "coverproject",
    "howlongtobeat",
    "steam",
    "rawg",
    "steamgriddb",
  ];
  const selectedProviderIds = orderedProviderIdsForType(
    "games",
    gameProviderOrder,
  );
  const byProvider = await resolveMetadataProvidersInOrder(
    selectedProviderIds,
    {
      name,
      barcode,
      platform,
      includePcSources,
      isBackground: options?.isBackground,
    },
    metadataProviderResolverMap,
  );

  const cleanedInputBarcode = cleanCode(barcode);
  const isPalRegion =
    cleanedInputBarcode.length === 13 && !cleanedInputBarcode.startsWith("0");
  const barcodeAlternateNames =
    await loadBarcodeAlternateNames(cleanedInputBarcode);
  const titleAlignmentNames = Array.from(
    new Set([name, ...barcodeAlternateNames].filter(Boolean)),
  );

  let igdb = dropMisalignedGameMetadata(
    byProvider.get("igdb") || null,
    titleAlignmentNames,
  );
  let ss = byProvider.get("screenscraper") || null;
  let tgdb = dropMisalignedGameMetadata(
    byProvider.get("thegamesdb") || null,
    titleAlignmentNames,
  );
  let coverProject = byProvider.get("coverproject") || null;
  let launchbox = dropMisalignedGameMetadata(
    byProvider.get("launchbox") || null,
    titleAlignmentNames,
  );
  let hltb = byProvider.get("howlongtobeat") || null;
  const steam = byProvider.get("steam") || null;
  let rawg = dropMisalignedGameMetadata(
    byProvider.get("rawg") || null,
    titleAlignmentNames,
  );
  let steamGrid = byProvider.get("steamgriddb") || null;
  let pcMeta = null as Awaited<
    ReturnType<typeof fetchMetadataFromPriceCharting>
  > | null;

  if (cleanedInputBarcode) {
    try {
      pcMeta = await runQueuedMetadataProviderCall("pricecharting", () =>
        fetchMetadataFromPriceCharting(
          cleanedInputBarcode,
          name,
          platform || undefined,
          isPalRegion,
        ),
      );
    } catch (error) {
      console.warn("[PriceCharting] metadata enrichment failed", error);
    }
  } else {
    try {
      pcMeta = await runQueuedMetadataProviderCall("pricecharting", () =>
        fetchMetadataFromPriceChartingByName(
          name,
          platform || undefined,
          isPalRegion,
        ),
      );
    } catch (error) {
      console.warn("[PriceCharting] metadata lookup by name failed", error);
    }
  }

  const pcTitleForFallback = resolvePriceChartingTitleFallback(
    pcMeta,
    titleAlignmentNames,
  );

  let canonicalFallbackNames = mergeMetadataFallbackNames(
    name,
    barcodeAlternateNames,
    gameMetadataSources(
      igdb,
      ss,
      tgdb,
      launchbox,
      coverProject,
      rawg,
      steam,
      steamGrid,
      hltb,
    ),
    pcTitleForFallback ? [pcTitleForFallback] : [],
  );

  if (!ss && !isScreenScraperQuotaBlocked()) {
    ss = await resolveWithFallbackNames(
      canonicalFallbackNames,
      (fallbackName) =>
        runQueuedMetadataProviderCall("screenscraper", () =>
          fetchFromScreenScraper(fallbackName, barcode, platform, options),
        ),
      { limit: 6 },
    );
  }

  if (!tgdb) {
    tgdb = await resolveWithFallbackNames(
      canonicalFallbackNames,
      (fallbackName) =>
        runQueuedMetadataProviderCall("thegamesdb", () =>
          fetchFromTheGamesDB(fallbackName, platform, barcode),
        ),
      {
        limit: 12,
        validate: (candidate, fallbackName) =>
          isMetadataTitleAligned(
            candidate,
            [name, fallbackName, ...canonicalFallbackNames],
            0.58,
          ),
      },
    );
  }

  if (!igdb) {
    igdb = await resolveWithFallbackNames(
      canonicalFallbackNames,
      (fallbackName) =>
        runQueuedMetadataProviderCall("igdb", () =>
          fetchFromIGDB(fallbackName, platform),
        ),
      {
        limit: 12,
        validate: (candidate, fallbackName) =>
          isMetadataTitleAligned(
            candidate,
            [name, fallbackName, ...canonicalFallbackNames],
            0.58,
          ),
      },
    );
  }

  if (!launchbox) {
    launchbox = await resolveWithFallbackNames(
      canonicalFallbackNames,
      (fallbackName) =>
        runQueuedMetadataProviderCall("launchbox", () =>
          fetchFromLaunchBox(fallbackName, platform),
        ),
      {
        limit: 8,
        validate: (candidate, fallbackName) =>
          isMetadataTitleAligned(
            candidate,
            [name, fallbackName, ...canonicalFallbackNames],
            0.58,
          ),
      },
    );
  }

  canonicalFallbackNames = mergeMetadataFallbackNames(
    name,
    barcodeAlternateNames,
    gameMetadataSources(
      igdb,
      ss,
      tgdb,
      launchbox,
      coverProject,
      rawg,
      steam,
      steamGrid,
      hltb,
    ),
    pcTitleForFallback ? [pcTitleForFallback] : [],
  );

  if (
    ss &&
    !isScreenScraperQuotaBlocked() &&
    shouldRecheckScreenScraperMatch(name, ss, canonicalFallbackNames)
  ) {
    const improved = await findBetterScreenScraperMatch(
      name,
      ss,
      canonicalFallbackNames,
      barcode,
      platform,
    );
    if (improved) ss = improved;
  }

  const rawgComparisonNames = collectCanonicalFallbackNames(name, [ss, igdb]);
  const hasRawgRating = rawg?.facts?.some((fact) => fact.kind === "rating");
  const rawgLooksMismatched =
    rawg &&
    rawg.title &&
    rawgComparisonNames.length > 0 &&
    !isMetadataTitleAligned(rawg, rawgComparisonNames, 0.58);

  if (!rawg || !hasRawgRating || rawgLooksMismatched) {
    rawg = await resolveWithFallbackNames(
      canonicalFallbackNames,
      (fallbackName) =>
        runQueuedMetadataProviderCall("rawg", () =>
          fetchFromRawg(fallbackName),
        ),
      {
        limit: 12,
        validate: (fallbackRawg, fallbackName) =>
          Boolean(
            fallbackRawg?.facts?.some((fact) => fact.kind === "rating") &&
              isMetadataTitleAligned(
                fallbackRawg,
                [fallbackName, ...rawgComparisonNames],
                0.58,
              ),
          ),
      },
    );
  }

  if (!steamGrid) {
    steamGrid = await resolveWithFallbackNames(
      canonicalFallbackNames,
      (fallbackName) =>
        runQueuedMetadataProviderCall("steamgriddb", () =>
          fetchFromSteamGridDB(fallbackName),
        ),
      { limit: 12 },
    );
  }

  if (!hltb) {
    hltb = await resolveWithFallbackNames(
      canonicalFallbackNames,
      (fallbackName) =>
        runQueuedMetadataProviderCall("howlongtobeat", () =>
          fetchFromHowLongToBeat(fallbackName, platform),
        ),
      { limit: 12 },
    );
  }

  if (!coverProject || !hasUsableCover(coverProject)) {
    const coverFallback = await resolveWithFallbackNames(
      canonicalFallbackNames,
      (fallbackName) =>
        runQueuedMetadataProviderCall("coverproject", () =>
          fetchFromCoverProject(fallbackName, platform),
        ),
      {
        limit: 6,
        validate: (candidate) => hasUsableCover(candidate),
      },
    );
    if (coverFallback) {
      coverProject = coverProject
        ? {
            ...coverProject,
            imageUrl: coverProject.imageUrl || coverFallback.imageUrl,
            attachments: [
              ...(coverProject.attachments || []),
              ...(coverFallback.attachments || []),
            ],
          }
        : coverFallback;
    }
  }

  const pcTitleFallback = pcTitleForFallback;

  if (
    !igdb &&
    !ss &&
    !tgdb &&
    !launchbox &&
    !coverProject &&
    !hltb &&
    !steam &&
    !rawg &&
    !steamGrid &&
    !pcTitleFallback &&
    !pcMeta?.ageRating
  ) {
    return null;
  }

  const providerEvidence = dedupeFieldEvidence([
    ...metadataFieldEvidence("IGDB", igdb),
    ...metadataFieldEvidence("ScreenScraper", ss),
    ...metadataFieldEvidence("TheGamesDB", tgdb),
    ...metadataFieldEvidence("LaunchBox", launchbox),
    ...metadataFieldEvidence("Cover Project", coverProject),
    ...metadataFieldEvidence("HowLongToBeat", hltb),
    ...(includePcSources ? metadataFieldEvidence("Steam", steam) : []),
    ...metadataFieldEvidence("RAWG", rawg),
    ...metadataFieldEvidence("SteamGridDB", steamGrid),
  ]);
  const merged = applyPriceChartingTitleFallback(
    mergeGameMetadata(
      igdb,
      ss,
      tgdb,
      coverProject,
      launchbox,
      hltb,
      steam,
      rawg,
      steamGrid,
      { includePcSources },
    ),
    pcTitleFallback,
    titleAlignmentNames,
  );
  const pcFacts: MetadataFact[] = [];
  if (pcMeta?.ageRating) {
    pcFacts.push({
      kind: "age-rating",
      label: pcMeta.ageRating.startsWith("PEGI") ? "PEGI" : "PriceCharting",
      value:
        pcMeta.ageRating.replace(/^PEGI\s*/i, "").trim() || pcMeta.ageRating,
      source: "pricecharting",
      confidence: 0.62,
      priority: 58,
    });
  }
  const pcTitleEvidence =
    pcTitleFallback && merged.title === pcTitleFallback
      ? metadataFieldEvidence("PriceCharting", { title: pcTitleFallback })
      : [];

  const mergedWithEvidence = {
    ...merged,
    facts: dedupeFacts([...(merged.facts || []), ...pcFacts]),
    fieldEvidence: dedupeFieldEvidence([
      ...providerEvidence,
      ...pcTitleEvidence,
      ...metadataFieldEvidence("MergedEngine", merged, {
        confidence: 0.8,
        priority: 200,
      }),
    ]),
  };

  return preferRequestedDisplayTitleWithPriceCharting(
    {
      ...mergedWithEvidence,
      barcode:
        pickDiscoveredBarcode([cleanedInputBarcode, pcMeta?.barcode]) ||
        undefined,
    },
    name,
    pcTitleFallback,
  );
}
