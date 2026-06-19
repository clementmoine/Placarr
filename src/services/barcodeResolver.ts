import { prisma } from "@/lib/prisma";
import {
  buildCachedBarcodePayload,
  cleanCompiledResultForResponse,
} from "@/lib/barcode/cachePayload";
import {
  scoreTypeCandidate,
  uniqueClean,
  type CompiledResult,
  type ResolvedMatch,
} from "@/lib/barcode/evidence";
import { runBarcodeLookups } from "@/lib/barcode/lookups";
import { compileAllBarcodeTypeResults } from "@/lib/barcode/sourceAssembly";
import { BARCODE_CACHE_VERSION, versionProvider } from "@/lib/barcode/titleUtils";
import { detectPlatformKey } from "@/lib/barcode/query";
import { createBarcodeLookupDeps } from "@/services/providerBarcodeDeps";
import { createBarcodeLookupTaskBuilders } from "@/services/providerBarcode";

export {
  areLikelySameProduct,
  cleanTitleForDisplay,
  filterPlatformRedundancies,
  isListingDiscardable,
  versionProvider,
} from "@/lib/barcode/titleUtils";
export { isCanonicalProvider } from "@/services/providerEvidence";

const barcodeLookupTaskBuilders = createBarcodeLookupTaskBuilders(
  createBarcodeLookupDeps(),
);

export type BarcodeResolveResult = {
  provider: string | null;
  rawNames: string[];
  cleanName: string;
  suggestions: string[];
  matches: ResolvedMatch[];
  shelfType: string | null;
  platformKey?: string | null;
  refreshed?: boolean;
  staleCache?: boolean;
};

async function cacheBarcodeResult(
  cleanedBarcode: string,
  res: CompiledResult,
  shelfType: string,
) {
  try {
    await prisma.barcodeCache.deleteMany({
      where: { barcode: cleanedBarcode },
    });

    await prisma.barcodeCache.create({
      data: {
        barcode: cleanedBarcode,
        provider: versionProvider(res.provider),
        shelfType,
        platformKey: res.platformKey || null,
        rawNames: {
          create: uniqueClean([res.cleanName, ...(res.suggestions || [])], {
            preservePlatformSuffix: shelfType === "games",
          }).map((value) => {
            const matchingMatch = res.matches.find(
              (match) =>
                match.suggestions.some(
                  (suggestion) =>
                    suggestion.toLowerCase().trim() ===
                    value.toLowerCase().trim(),
                ) ||
                match.name.toLowerCase().trim() === value.toLowerCase().trim(),
            );
            return {
              value,
              coverUrl: matchingMatch?.coverUrl || null,
            };
          }),
        },
      },
    });
  } catch (error) {
    console.error("[BarcodeCache] Error caching result:", error);
  }
}

function selectBarcodeTypeResult(
  type: string | null,
  typeResults: Record<string, CompiledResult | null>,
  cleanedBarcode: string,
): { selectedType: string | null; selectedResult: CompiledResult | null } {
  if (type && typeResults[type]) {
    return { selectedType: type, selectedResult: typeResults[type] };
  }

  const isAudioLikeBarcode = /^(0?(498|499)|45|88)/.test(cleanedBarcode);
  const candidates = Object.entries(typeResults)
    .filter(
      ([candidateType]) => !(isAudioLikeBarcode && candidateType === "games"),
    )
    .filter((entry): entry is [string, CompiledResult] => Boolean(entry[1]));
  candidates.sort(
    (a, b) =>
      scoreTypeCandidate(b[0], b[1], cleanedBarcode) -
      scoreTypeCandidate(a[0], a[1], cleanedBarcode),
  );

  const best = candidates[0];
  if (!best) {
    return { selectedType: null, selectedResult: null };
  }

  let selectedType = best[0];
  let selectedResult = best[1];

  if (
    !type &&
    /^(0?(498|499)|45|88)/.test(cleanedBarcode) &&
    /\b(?:orchestra|soundtrack|ost|album|cd)\b/i.test(selectedResult.cleanName)
  ) {
    selectedType = "musics";
  }

  return { selectedType, selectedResult };
}

export async function resolveBarcode(
  cleanedBarcode: string,
  type: string | null,
  opts: { refresh?: boolean; platformHint?: string | null } = {},
): Promise<BarcodeResolveResult> {
  const shouldRefresh = opts.refresh ?? false;
  const contextPlatformKey = opts.platformHint
    ? detectPlatformKey(opts.platformHint)
    : null;

  const cachedResult = await prisma.barcodeCache.findUnique({
    where: { barcode: cleanedBarcode },
    include: { rawNames: true },
  });

  const shouldBypassCache =
    !!cachedResult &&
    (shouldRefresh || !cachedResult.provider.includes(BARCODE_CACHE_VERSION));

  if (cachedResult && cachedResult.rawNames.length > 0 && !shouldBypassCache) {
    return buildCachedBarcodePayload(cachedResult, type, cleanedBarcode);
  }

  const payload = await runBarcodeLookups({
    cleanedBarcode,
    type,
    contextPlatformKey,
    taskBuilders: barcodeLookupTaskBuilders,
  });
  const typeResults = await compileAllBarcodeTypeResults({
    cleanedBarcode,
    type,
    payload,
  });
  const { selectedType, selectedResult } = selectBarcodeTypeResult(
    type,
    typeResults,
    cleanedBarcode,
  );

  if (selectedResult && selectedType) {
    await cacheBarcodeResult(cleanedBarcode, selectedResult, selectedType);
    const cleaned = cleanCompiledResultForResponse(
      selectedResult,
      selectedType,
    );

    return {
      ...selectedResult,
      ...cleaned,
      shelfType: selectedType,
    };
  }

  if (cachedResult && cachedResult.rawNames.length > 0 && shouldBypassCache) {
    if (shouldRefresh) {
      return {
        provider: null,
        rawNames: [],
        cleanName: "",
        suggestions: [],
        matches: [],
        shelfType: type || null,
        platformKey: null,
        refreshed: true,
      };
    }

    return buildCachedBarcodePayload(cachedResult, type, cleanedBarcode, {
      markStale: true,
    });
  }

  return {
    provider: null,
    rawNames: [],
    cleanName: "",
    suggestions: [],
    matches: [],
    shelfType: type || null,
    platformKey: null,
  };
}
