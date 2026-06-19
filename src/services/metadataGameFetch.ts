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
import { pickDiscoveredBarcode } from "@/lib/barcode/normalize";
import { cleanCode } from "@/lib/barcode/query";
import { fetchMetadataFromPriceCharting } from "@/services/providers/pricecharting";
import { fetchMetadataFromPriceChartingByName } from "@/services/providers/pricecharting/fetch";
import type { MetadataFact, MetadataResult } from "@/types/metadataProvider";

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
  const selectedProviderIds = orderedProviderIdsForType("games", gameProviderOrder);
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

  let igdb = byProvider.get("igdb") || null;
  let ss = byProvider.get("screenscraper") || null;
  let hltb = byProvider.get("howlongtobeat") || null;
  const steam = byProvider.get("steam") || null;
  let rawg = byProvider.get("rawg") || null;
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
      igdb = await fetchFromIGDB(fallbackName, platform);
      if (igdb) break;
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

  if (!igdb && !ss && !hltb && !steam && !rawg && !steamGrid) {
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
  const merged = mergeGameMetadata(igdb, ss, hltb, steam, rawg, steamGrid, {
    includePcSources,
  });
  const pcFacts: MetadataFact[] = [];
  if (pcMeta?.ageRating) {
    pcFacts.push({
      kind: "age-rating",
      label: pcMeta.ageRating.startsWith("PEGI") ? "PEGI" : "PriceCharting",
      value: pcMeta.ageRating.replace(/^PEGI\s*/i, "").trim() || pcMeta.ageRating,
      source: "pricecharting",
      confidence: 0.62,
      priority: 58,
    });
  }
  const mergedWithEvidence = {
    ...merged,
    facts: dedupeFacts([...(merged.facts || []), ...pcFacts]),
    fieldEvidence: dedupeFieldEvidence([
      ...providerEvidence,
      ...metadataFieldEvidence("MergedEngine", merged, {
        confidence: 0.8,
        priority: 200,
      }),
    ]),
  };

  return preferRequestedDisplayTitle(
    {
      ...mergedWithEvidence,
      barcode:
        pickDiscoveredBarcode([cleanedInputBarcode, pcMeta?.barcode]) ||
        undefined,
    },
    name,
  );
}
