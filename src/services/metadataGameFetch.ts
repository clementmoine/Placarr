import {
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
import { fetchFromSteamGridDB } from "@/services/providers/steamgriddb";
import {
  areDisplayTitlesSameProduct,
  requestedTitleCoversCurrentTitle,
} from "@/lib/displayTitleScore";
import { pickDiscoveredBarcode } from "@/lib/barcode/normalize";
import { cleanCode } from "@/lib/barcode/query";
import { fetchMetadataFromPriceCharting } from "@/services/providers/pricecharting";
import { fetchMetadataFromPriceChartingByName } from "@/services/providers/pricecharting/fetch";
import type { PriceChartingMetadata } from "@/services/providers/pricecharting/fetch";
import type { MetadataFact, MetadataResult } from "@/types/metadataProvider";

function resolvePriceChartingTitleFallback(
  pcMeta: PriceChartingMetadata | null | undefined,
  requestedName: string,
): string | undefined {
  const title = pcMeta?.title?.trim();
  if (!title) return undefined;
  if (!isMetadataTitleAligned({ title }, [requestedName], 0.58)) {
    return undefined;
  }
  return title;
}

function applyPriceChartingTitleFallback(
  merged: MetadataResult,
  pcTitle: string | undefined,
  requestedName: string,
): MetadataResult {
  if (!pcTitle) return merged;
  if (!merged.title?.trim()) {
    return { ...merged, title: pcTitle };
  }
  if (
    !isMetadataTitleAligned(merged, [requestedName], 0.58) &&
    isMetadataTitleAligned({ title: pcTitle }, [requestedName], 0.58)
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
  requestedName: string,
): MetadataResult | null {
  const comparisonNames = requestedName.trim() ? [requestedName.trim()] : [];
  if (!result?.title || comparisonNames.length === 0) return result;
  return isMetadataTitleAligned(result, comparisonNames, 0.58) ? result : null;
}

export async function fetchFromAllGameSources(
  name: string,
  barcode?: string | null,
  platform?: string | null,
): Promise<MetadataResult | null> {
  const includePcSources = isPcLikeGamePlatform(platform);
  const gameProviderOrder = [
    "igdb",
    "screenscraper",
    "howlongtobeat",
    "steam",
    "rawg",
    "steamgriddb",
  ];
  const selectedProviderIds = orderedProviderIdsForType(
    "games",
    gameProviderOrder,
  );
  const settled = await Promise.allSettled(
    selectedProviderIds.map(async (providerId) => ({
      providerId,
      value: await metadataProviderResolverMap
        .get(providerId)
        ?.resolve({ name, barcode, platform, includePcSources }),
    })),
  );
  const byProvider = new Map<string, MetadataResult | null>();
  for (const item of settled) {
    if (item.status !== "fulfilled") continue;
    byProvider.set(item.value.providerId, item.value.value || null);
  }

  let igdb = dropMisalignedGameMetadata(byProvider.get("igdb") || null, name);
  let ss = byProvider.get("screenscraper") || null;
  let hltb = byProvider.get("howlongtobeat") || null;
  const steam = byProvider.get("steam") || null;
  let rawg = dropMisalignedGameMetadata(byProvider.get("rawg") || null, name);
  let steamGrid = byProvider.get("steamgriddb") || null;
  let pcMeta = null as Awaited<
    ReturnType<typeof fetchMetadataFromPriceCharting>
  > | null;

  const cleanedInputBarcode = cleanCode(barcode);
  const isPalRegion =
    cleanedInputBarcode.length === 13 && !cleanedInputBarcode.startsWith("0");

  if (cleanedInputBarcode) {
    try {
      pcMeta = await fetchMetadataFromPriceCharting(
        cleanedInputBarcode,
        name,
        platform || undefined,
        isPalRegion,
      );
    } catch (error) {
      console.warn("[PriceCharting] metadata enrichment failed", error);
    }
  } else {
    try {
      pcMeta = await fetchMetadataFromPriceChartingByName(
        name,
        platform || undefined,
        isPalRegion,
      );
    } catch (error) {
      console.warn("[PriceCharting] metadata lookup by name failed", error);
    }
  }

  let canonicalFallbackNames = collectCanonicalFallbackNames(name, [
    igdb,
    ss,
    rawg,
    steam,
    steamGrid,
  ]);

  if (!ss) {
    for (const fallbackName of canonicalFallbackNames.slice(0, 12)) {
      ss = await fetchFromScreenScraper(fallbackName, barcode, platform);
      if (ss) break;
    }
  }

  if (!igdb) {
    for (const fallbackName of canonicalFallbackNames.slice(0, 12)) {
      const candidate = await fetchFromIGDB(fallbackName, platform);
      if (
        candidate &&
        isMetadataTitleAligned(
          candidate,
          [name, fallbackName, ...canonicalFallbackNames],
          0.58,
        )
      ) {
        igdb = candidate;
        break;
      }
    }
  }

  canonicalFallbackNames = collectCanonicalFallbackNames(name, [
    igdb,
    ss,
    rawg,
    steam,
    steamGrid,
  ]);

  if (ss && shouldRecheckScreenScraperMatch(name, ss, canonicalFallbackNames)) {
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
    for (const fallbackName of canonicalFallbackNames.slice(0, 12)) {
      const fallbackRawg = await fetchFromRawg(fallbackName);
      if (
        fallbackRawg?.facts?.some((fact) => fact.kind === "rating") &&
        isMetadataTitleAligned(
          fallbackRawg,
          [fallbackName, ...rawgComparisonNames],
          0.58,
        )
      ) {
        rawg = fallbackRawg;
        break;
      }
    }
  }

  if (!steamGrid) {
    for (const fallbackName of canonicalFallbackNames.slice(0, 12)) {
      steamGrid = await fetchFromSteamGridDB(fallbackName);
      if (steamGrid) break;
    }
  }

  if (!hltb) {
    for (const fallbackName of canonicalFallbackNames.slice(0, 12)) {
      hltb = await fetchFromHowLongToBeat(fallbackName, platform);
      if (hltb) break;
    }
  }

  const pcTitleFallback = resolvePriceChartingTitleFallback(pcMeta, name);

  if (
    !igdb &&
    !ss &&
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
    ...metadataFieldEvidence("HowLongToBeat", hltb),
    ...(includePcSources ? metadataFieldEvidence("Steam", steam) : []),
    ...metadataFieldEvidence("RAWG", rawg),
    ...metadataFieldEvidence("SteamGridDB", steamGrid),
  ]);
  const merged = applyPriceChartingTitleFallback(
    mergeGameMetadata(igdb, ss, hltb, steam, rawg, steamGrid, {
      includePcSources,
    }),
    pcTitleFallback,
    name,
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
