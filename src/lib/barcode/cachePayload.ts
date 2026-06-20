import { prisma } from "@/lib/prisma";
import {
  BARCODE_CACHE_VERSION,
  cleanTitleForDisplay,
  filterPlatformRedundancies,
  versionProvider,
} from "@/lib/barcode/titleUtils";
import {
  clusterSuggestions,
  mergeDuplicateMatches,
  type ResolvedMatch,
} from "@/lib/barcode/evidence";
import { decode as decodeHTMLEntities } from "html-entities";
import { isCleanCachedProvider } from "@/services/providerEvidence";
import type { BarcodeCache, RawName } from "@prisma/client";

type CachedBarcodeRecord = BarcodeCache & {
  rawNames: RawName[];
};

function deduplicate<T>(arr: T[], keyFn: (item: T) => string): T[] {
  const seen = new Set<string>();
  return arr.filter((item) => {
    const key = keyFn(item).toLowerCase().trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function getPrioritizedImageUrl(title: string): Promise<string | null> {
  const metas = await prisma.metadata.findMany({
    where: { title },
    select: { imageUrl: true },
  });

  if (metas.length === 0) return null;

  const sortedMetas = metas.sort((a, b) => {
    const urlA = a.imageUrl || "";
    const urlB = b.imageUrl || "";
    const isSSA = urlA.includes("screenscraper");
    const isSSB = urlB.includes("screenscraper");
    if (isSSA && !isSSB) return -1;
    if (!isSSA && isSSB) return 1;

    const isRawgA = urlA.includes("rawg.io");
    const isRawgB = urlB.includes("rawg.io");
    if (!isRawgA && isRawgB) return -1;
    if (isRawgA && !isRawgB) return 1;

    return 0;
  });

  return sortedMetas[0].imageUrl || null;
}

export async function buildCachedBarcodePayload(
  cachedResult: CachedBarcodeRecord,
  type: string | null,
  cleanedBarcode: string,
  options: { markStale?: boolean } = {},
) {
  const canUseRawCoverFromCache =
    !type || !cachedResult.shelfType || cachedResult.shelfType === type;
  const rawNames = cachedResult.rawNames.map((rn) => rn.value);
  const filteredNames = filterPlatformRedundancies(rawNames);
  const mappedNamesWithPriority = filteredNames.map((val, index) => {
    const firstNameIsRepresentative =
      isCleanCachedProvider(cachedResult.provider) ||
      options.markStale ||
      cachedResult.provider.includes(BARCODE_CACHE_VERSION);
    const priority = firstNameIsRepresentative && index === 0 ? 2 : 0;
    return { value: val, priority };
  });

  const matches = clusterSuggestions(mappedNamesWithPriority);
  const enrichedMatches = await Promise.all(
    matches.map(async (m) => {
      let coverUrl = await getPrioritizedImageUrl(m.name);

      if (!coverUrl && canUseRawCoverFromCache) {
        const matchingRaw = cachedResult.rawNames.find((rn) => {
          const valNorm = rn.value.toLowerCase().trim();
          return (
            valNorm === m.name.toLowerCase().trim() ||
            m.suggestions.some((s) => s.toLowerCase().trim() === valNorm)
          );
        });
        if (matchingRaw?.coverUrl) {
          coverUrl = matchingRaw.coverUrl;
        }
      }

      if (!coverUrl && type === "books") {
        coverUrl = `https://covers.openlibrary.org/b/isbn/${cleanedBarcode}-M.jpg`;
      }

      return { ...m, coverUrl };
    }),
  );

  const mergedMatches = mergeDuplicateMatches(enrichedMatches);
  const preservePlatformSuffix = (type || cachedResult.shelfType) === "games";
  const cleanNameStr = cleanTitleForDisplay(
    decodeHTMLEntities(filteredNames[0] || rawNames[0] || ""),
    { preservePlatformSuffix },
  );
  const cleanSuggestions = Array.from(
    new Set(
      filteredNames.map((s) =>
        cleanTitleForDisplay(decodeHTMLEntities(s), {
          preservePlatformSuffix,
        }),
      ),
    ),
  );
  const cleanMatches = deduplicate(
    mergedMatches.map((m) => ({
      ...m,
      name: cleanTitleForDisplay(decodeHTMLEntities(m.name), {
        preservePlatformSuffix,
      }),
      suggestions: Array.from(
        new Set(
          m.suggestions.map((s) =>
            cleanTitleForDisplay(decodeHTMLEntities(s), {
              preservePlatformSuffix,
            }),
          ),
        ),
      ),
    })),
    (m) => m.name,
  );

  return {
    provider: options.markStale
      ? versionProvider(cachedResult.provider)
      : cachedResult.provider,
    rawNames: rawNames.map((rn) => decodeHTMLEntities(rn)),
    cleanName: cleanNameStr,
    suggestions: cleanSuggestions,
    matches: cleanMatches,
    shelfType: cachedResult.shelfType,
    platformKey: cachedResult.platformKey || null,
    priceNew: cachedResult.priceNew,
    priceUsed: cachedResult.priceUsed,
    priceUsedCIB: cachedResult.priceUsedCIB,
    staleCache: options.markStale || undefined,
  };
}

export type CachedBarcodePayload = Awaited<
  ReturnType<typeof buildCachedBarcodePayload>
>;

export function cleanCompiledResultForResponse(
  selectedResult: {
    rawNames: string[];
    cleanName: string;
    suggestions: string[];
    matches: ResolvedMatch[];
  },
  selectedType: string,
) {
  const preservePlatformSuffix = selectedType === "games";
  const cleanNameStr = cleanTitleForDisplay(
    decodeHTMLEntities(selectedResult.cleanName),
    { preservePlatformSuffix },
  );
  const cleanSuggestions = Array.from(
    new Set(
      selectedResult.suggestions.map((s) =>
        cleanTitleForDisplay(decodeHTMLEntities(s), {
          preservePlatformSuffix,
        }),
      ),
    ),
  );
  const cleanMatches = deduplicate(
    selectedResult.matches.map((m) => ({
      ...m,
      name: cleanTitleForDisplay(decodeHTMLEntities(m.name), {
        preservePlatformSuffix,
      }),
      suggestions: Array.from(
        new Set(
          m.suggestions.map((s) =>
            cleanTitleForDisplay(decodeHTMLEntities(s), {
              preservePlatformSuffix,
            }),
          ),
        ),
      ),
    })),
    (m) => m.name,
  );

  return {
    rawNames: selectedResult.rawNames.map((rn) => decodeHTMLEntities(rn)),
    cleanName: cleanNameStr,
    suggestions: cleanSuggestions,
    matches: cleanMatches,
  };
}
