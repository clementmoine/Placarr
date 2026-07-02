import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@prisma/client";
import {
  buildCachedBarcodePayload,
  cleanCompiledResultForResponse,
} from "@/lib/barcode/lookup/cachePayload";
import {
  scoreTypeCandidate,
  uniqueClean,
  type CompiledResult,
  type ResolvedMatch,
} from "@/lib/barcode/evidence";
import { runBarcodeLookups } from "@/lib/barcode/lookup/lookups";
import {
  collectPayloadListingNames,
  detectBoardGameSignal,
  detectMediaFormat,
  detectVideoFormatSignal,
} from "@/lib/barcode/boardGameSignal";
import type { BarcodeLookupPayload } from "@/lib/barcode/lookup/payload";
import { compileAllBarcodeTypeResults } from "@/lib/barcode/lookup/sourceAssembly";
import {
  BARCODE_CACHE_VERSION,
  versionProvider,
} from "@/lib/barcode/titleUtils";
import { detectPlatformKey } from "@/lib/barcode/query";
import { isPriceCacheFresh } from "@/lib/pricing/cachePolicy";
import { createBarcodeLookupDeps } from "@/services/provider/barcode";
import { createBarcodeLookupTaskBuilders } from "@/services/provider/barcode";
import { collectScanPriceOffers } from "@/services/provider/barcodePrices";
import { persistBarcodePrices } from "@/services/pricing/resolver";
import { PROVIDER_MODULES } from "@/services/provider/registry";
import type { BarcodeCache } from "@prisma/client";

// Providers whose ONLY media type is board games (Philibert, Okkazeo,
// BoardGameGeek…) — derived from the registry, never a hand-kept name list. Such
// a specialist identifying a barcode is authoritative proof it is a board game,
// the agnostic replacement for the old publisher-name guessing.
const BOARD_GAME_SPECIALIST_LABELS = new Set(
  PROVIDER_MODULES.filter(
    (m) => m.info.types.length === 1 && m.info.types[0] === "boardgames",
  ).map((m) => (m.evidence?.label ?? m.info.id).toLowerCase()),
);

/**
 * 1 when the compiled board-game result is anchored (canonical/trusted) by a
 * board-game-specialist provider, else 0 — a strong, registry-driven type signal
 * that needs no publisher list.
 */
function detectBoardGameSpecialistSignal(
  boardgamesResult: CompiledResult | null,
): number {
  if (!boardgamesResult) return 0;
  const anchors = boardgamesResult.matches.flatMap((match) => [
    ...match.evidence.canonicalProviders,
    ...match.evidence.trustedRetailerProviders,
  ]);
  const isSpecialist = (providerName: string) => {
    const norm = providerName.toLowerCase();
    for (const label of BOARD_GAME_SPECIALIST_LABELS) {
      if (norm.includes(label) || label.includes(norm)) return true;
    }
    return false;
  };
  return anchors.some(isSpecialist) ? 1 : 0;
}

export {
  areLikelySameProduct,
  cleanTitleForDisplay,
  filterPlatformRedundancies,
  isListingDiscardable,
  versionProvider,
} from "@/lib/barcode/titleUtils";
export { isCanonicalProvider } from "@/services/provider/evidence";

const barcodeLookupTaskBuilders = createBarcodeLookupTaskBuilders(
  createBarcodeLookupDeps(),
);

function recordStep(label: string) {
  if (process.env.RECORD) {
    // eslint-disable-next-line no-console
    console.log(`[record step] ${label}`);
  }
}

type BarcodeCachePriceSnapshot = Pick<
  BarcodeCache,
  "priceLastUpdated" | "priceNew" | "priceUsed" | "priceUsedCIB"
>;

export type BarcodeResolveResult = {
  provider: string | null;
  rawNames: string[];
  cleanName: string;
  displayName: string;
  edition: string | null;
  suggestions: string[];
  matches: ResolvedMatch[];
  shelfType: string | null;
  /** Physical format named by the listings ("LaserDisc", "VHS"…), for shelf hints. */
  mediaFormat?: string | null;
  platformKey?: string | null;
  refreshed?: boolean;
  staleCache?: boolean;
  priceNew?: number | null;
  priceUsed?: number | null;
  priceUsedCIB?: number | null;
  observations?: import("@/types/metadataObservation").MetadataObservation[];
  observationSchemaVersion?: string | null;
};


async function cacheBarcodeResult(
  cleanedBarcode: string,
  res: CompiledResult,
  shelfType: string,
  previousCache?: BarcodeCachePriceSnapshot | null,
  mediaFormat?: string | null,
) {
  try {
    const priceSnapshot =
      previousCache ??
      (await prisma.barcodeCache.findUnique({
        where: { barcode: cleanedBarcode },
        select: {
          priceLastUpdated: true,
          priceNew: true,
          priceUsed: true,
          priceUsedCIB: true,
        },
      }));
    const rawNames = uniqueClean(
      [
        res.displayName || res.cleanName,
        res.cleanName,
        ...(res.suggestions || []),
      ],
      {
        preservePlatformSuffix: shelfType === "games",
      },
    ).map((value) => {
      const matchingMatch = res.matches.find(
        (match) =>
          match.suggestions.some(
            (suggestion) =>
              suggestion.toLowerCase().trim() === value.toLowerCase().trim(),
          ) || match.name.toLowerCase().trim() === value.toLowerCase().trim(),
      );
      return {
        value,
        coverUrl: matchingMatch?.coverUrl || null,
      };
    });

    await prisma.barcodeCache.upsert({
      where: { barcode: cleanedBarcode },
      create: {
        barcode: cleanedBarcode,
        provider: versionProvider(res.provider),
        shelfType,
        mediaFormat: mediaFormat ?? null,
        // Persist the compile step's final title decision verbatim so a cache
        // read reuses it instead of re-deriving (and re-stripping integral
        // edition terms). See cachePayload.buildCachedBarcodePayload.
        cleanName: res.cleanName || null,
        displayName: res.displayName || null,
        edition: res.edition ?? null,
        platformKey: res.platformKey || null,
        priceLastUpdated: priceSnapshot?.priceLastUpdated ?? null,
        priceNew: priceSnapshot?.priceNew ?? null,
        priceUsed: priceSnapshot?.priceUsed ?? null,
        priceUsedCIB: priceSnapshot?.priceUsedCIB ?? null,
        observations: res.observations?.length
          ? (res.observations as unknown as Prisma.InputJsonValue)
          : undefined,
        observationSchemaVersion: res.observationSchemaVersion ?? null,
        rawNames: {
          create: rawNames,
        },
      },
      update: {
        provider: versionProvider(res.provider),
        shelfType,
        mediaFormat: mediaFormat ?? null,
        cleanName: res.cleanName || null,
        displayName: res.displayName || null,
        edition: res.edition ?? null,
        platformKey: res.platformKey || null,
        priceLastUpdated: priceSnapshot?.priceLastUpdated ?? null,
        priceNew: priceSnapshot?.priceNew ?? null,
        priceUsed: priceSnapshot?.priceUsed ?? null,
        priceUsedCIB: priceSnapshot?.priceUsedCIB ?? null,
        observations: res.observations?.length
          ? (res.observations as unknown as Prisma.InputJsonValue)
          : undefined,
        observationSchemaVersion: res.observationSchemaVersion ?? null,
        rawNames: {
          deleteMany: {},
          create: rawNames,
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
  boardGameSignal = 0,
  videoFormatSignal = 0,
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
      scoreTypeCandidate(
        b[0],
        b[1],
        cleanedBarcode,
        boardGameSignal,
        videoFormatSignal,
      ) -
      scoreTypeCandidate(
        a[0],
        a[1],
        cleanedBarcode,
        boardGameSignal,
        videoFormatSignal,
      ),
  );

  const best = candidates[0];
  if (!best) {
    return { selectedType: null, selectedResult: null };
  }

  let selectedType = best[0];
  const selectedResult = best[1];

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

  const cachedTypeMismatches =
    !!type && !!cachedResult?.shelfType && cachedResult.shelfType !== type;
  const shouldBypassCache =
    !!cachedResult &&
    (shouldRefresh ||
      cachedTypeMismatches ||
      !cachedResult.provider.includes(BARCODE_CACHE_VERSION));

  if (cachedResult && cachedResult.rawNames.length > 0 && !shouldBypassCache) {
    return buildCachedBarcodePayload(cachedResult, type, cleanedBarcode);
  }

  recordStep("lookups:start");
  const payload = await runBarcodeLookups({
    cleanedBarcode,
    type,
    contextPlatformKey,
    taskBuilders: barcodeLookupTaskBuilders,
  });
  recordStep("lookups:done");
  const typeResults = await compileAllBarcodeTypeResults({
    cleanedBarcode,
    type,
    payload,
  });
  recordStep("compile:done");
  const listingNames = collectPayloadListingNames(payload);
  const boardGameSignal = Math.max(
    detectBoardGameSignal(listingNames),
    detectBoardGameSpecialistSignal(typeResults.boardgames),
  );
  const videoFormatSignal = detectVideoFormatSignal(listingNames);
  const { selectedType, selectedResult } = selectBarcodeTypeResult(
    type,
    typeResults,
    cleanedBarcode,
    boardGameSignal,
    videoFormatSignal,
  );

  const mediaFormat = detectMediaFormat(listingNames);

  if (selectedResult && selectedType) {
    recordStep("cache:start");
    await cacheBarcodeResult(
      cleanedBarcode,
      selectedResult,
      selectedType,
      cachedResult,
      mediaFormat,
    );
    recordStep("cache:done");
    const cleaned = cleanCompiledResultForResponse(
      selectedResult,
      selectedType,
    );

    // Surface prices captured for free during identification (one call per
    // provider) so the scan shows a value and the item price route reads the
    // cache instead of re-querying the provider.
    let capturedPrices: {
      priceNew: number | null;
      priceUsed: number | null;
      priceUsedCIB: number | null;
    } | null = null;

    const cachedShelfTypeMatches =
      !cachedResult?.shelfType || cachedResult.shelfType === selectedType;
    const cachedHasPrices =
      cachedResult != null &&
      cachedShelfTypeMatches &&
      (cachedResult.priceNew != null ||
        cachedResult.priceUsed != null ||
        cachedResult.priceUsedCIB != null);
    const cachedPricesAreFresh =
      cachedResult != null &&
      cachedHasPrices &&
      isPriceCacheFresh(selectedType, cachedResult);

    const scanOffers = collectScanPriceOffers(payload, selectedType);

    if (
      scanOffers.length > 0 &&
      !cachedPricesAreFresh &&
      !process.env.RECORD
    ) {
      // Merge captured prices into the cache (never clobbers other providers'
      // offers — see mergePriceOffers).
      try {
        const persisted = await persistBarcodePrices({
          cleanedBarcode,
          shelfType: selectedType,
          priceOffers: scanOffers,
        });
        capturedPrices = {
          priceNew: persisted.priceNew,
          priceUsed: persisted.priceUsed,
          priceUsedCIB: persisted.priceUsedCIB,
        };
      } catch (error) {
        console.error("[Barcode] Failed to persist captured prices:", error);
      }
    } else if (cachedHasPrices) {
      capturedPrices = {
        priceNew: cachedResult.priceNew,
        priceUsed: cachedResult.priceUsed,
        priceUsedCIB: cachedResult.priceUsedCIB,
      };
    }

    return {
      ...selectedResult,
      ...cleaned,
      shelfType: selectedType,
      mediaFormat,
      ...(capturedPrices ?? {}),
    };
  }

  recordStep("resolve:empty");

  if (cachedResult && cachedResult.rawNames.length > 0 && shouldBypassCache) {
    if (shouldRefresh || cachedTypeMismatches) {
      return {
        provider: null,
        rawNames: [],
        cleanName: "",
        displayName: "",
        edition: null,
        suggestions: [],
        matches: [],
        shelfType: type || null,
        platformKey: null,
        refreshed: shouldRefresh || undefined,
        staleCache: cachedTypeMismatches || undefined,
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
    displayName: "",
    edition: null,
    suggestions: [],
    matches: [],
    shelfType: type || null,
    platformKey: null,
  };
}
