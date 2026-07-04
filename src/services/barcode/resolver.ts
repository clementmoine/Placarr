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
  detectVideoGameSignal,
} from "@/lib/barcode/boardGameSignal";
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

// Registry-derived evidence labels of providers whose ONLY media type is the
// given one (board games: Philibert, Okkazeo, BoardGameGeek…; music: Discogs,
// MusicBrainz, Deezer). Such a specialist identifying a barcode is authoritative
// proof of the type — the agnostic replacement for the old publisher-name /
// word-list guessing. Never a hand-kept list.
function specialistLabelsForSingleType(mediaType: string): Set<string> {
  return new Set(
    PROVIDER_MODULES.filter(
      (m) => m.info.types.length === 1 && m.info.types[0] === mediaType,
    ).map((m) => (m.evidence?.label ?? m.info.id).toLowerCase()),
  );
}

const BOARD_GAME_SPECIALIST_LABELS =
  specialistLabelsForSingleType("boardgames");
const MUSIC_SPECIALIST_LABELS = specialistLabelsForSingleType("musics");

/**
 * 1 when the compiled result for a type is anchored (canonical/trusted) by a
 * provider that specialises in that single type, else 0 — a strong,
 * registry-driven type signal that needs no publisher or keyword list.
 */
function detectSpecialistSignal(
  result: CompiledResult | null,
  specialistLabels: Set<string>,
): number {
  if (!result) return 0;
  const anchors = result.matches.flatMap((match) => [
    ...match.evidence.canonicalProviders,
    ...match.evidence.trustedRetailerProviders,
  ]);
  const isSpecialist = (providerName: string) => {
    const norm = providerName.toLowerCase();
    for (const label of specialistLabels) {
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

// Audio-like GS1 prefixes used only to break a type tie at selection time.
// NOTE: intentionally distinct from evidence/scoring's AUDIO_BARCODE_PREFIX
// (which feeds the per-type score) — reconciling the two divergent prefix sets
// is tracked separately (changes decide-late identification → cache bump).
const AUDIO_LIKE_BARCODE_PREFIX = /^(0?(498|499)|45|88)/;

function selectBarcodeTypeResult(
  type: string | null,
  typeResults: Record<string, CompiledResult | null>,
  cleanedBarcode: string,
  boardGameSignal = 0,
  videoFormatSignal = 0,
  videoGameSignal = 0,
  musicSpecialistSignal = 0,
): { selectedType: string | null; selectedResult: CompiledResult | null } {
  if (type && typeResults[type]) {
    return { selectedType: type, selectedResult: typeResults[type] };
  }

  const isAudioLikeBarcode = AUDIO_LIKE_BARCODE_PREFIX.test(cleanedBarcode);
  const candidates = Object.entries(typeResults)
    .filter(
      ([candidateType]) => !(isAudioLikeBarcode && candidateType === "games"),
    )
    .filter((entry): entry is [string, CompiledResult] => Boolean(entry[1]));
  const scoreCandidate = (entry: [string, CompiledResult]) =>
    scoreTypeCandidate(
      entry[0],
      entry[1],
      cleanedBarcode,
      boardGameSignal,
      videoFormatSignal,
      videoGameSignal,
      musicSpecialistSignal,
    );
  candidates.sort((a, b) => scoreCandidate(b) - scoreCandidate(a));

  const best = candidates[0];
  if (!best) {
    return { selectedType: null, selectedResult: null };
  }

  return { selectedType: best[0], selectedResult: best[1] };
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
  if (process.env.RECORD) {
    console.log(
      `[record step] compile:games=${typeResults.games ? "hit" : "miss"} pc=${payload.pc?.title ?? "null"}`,
    );
  }
  const listingNames = collectPayloadListingNames(payload);
  const boardGameSignal = Math.max(
    detectBoardGameSignal(listingNames),
    detectSpecialistSignal(
      typeResults.boardgames,
      BOARD_GAME_SPECIALIST_LABELS,
    ),
  );
  const videoFormatSignal = detectVideoFormatSignal(listingNames);
  const videoGameSignal = detectVideoGameSignal(listingNames);
  const musicSpecialistSignal = detectSpecialistSignal(
    typeResults.musics,
    MUSIC_SPECIALIST_LABELS,
  );
  const { selectedType, selectedResult } = selectBarcodeTypeResult(
    type,
    typeResults,
    cleanedBarcode,
    boardGameSignal,
    videoFormatSignal,
    videoGameSignal,
    musicSpecialistSignal,
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

    if (scanOffers.length > 0 && !cachedPricesAreFresh && !process.env.RECORD) {
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
