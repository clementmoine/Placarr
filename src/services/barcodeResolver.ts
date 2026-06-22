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
import {
  collectPayloadListingNames,
  detectBoardGameSignal,
} from "@/lib/barcode/boardGameSignal";
import type { BarcodeLookupPayload } from "@/lib/barcode/lookupPayload";
import { compileAllBarcodeTypeResults } from "@/lib/barcode/sourceAssembly";
import {
  BARCODE_CACHE_VERSION,
  versionProvider,
} from "@/lib/barcode/titleUtils";
import { detectPlatformKey } from "@/lib/barcode/query";
import { isPriceCacheFresh } from "@/lib/priceCachePolicy";
import { createBarcodeLookupDeps } from "@/services/providerBarcodeDeps";
import { createBarcodeLookupTaskBuilders } from "@/services/providerBarcode";
import { persistBarcodePrices } from "@/services/priceResolver";
import type { PriceOfferInput } from "@/services/evidence";
import type { BarcodeCache } from "@prisma/client";

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
  platformKey?: string | null;
  refreshed?: boolean;
  staleCache?: boolean;
  priceNew?: number | null;
  priceUsed?: number | null;
  priceUsedCIB?: number | null;
};

/**
 * Collect price offers captured *for free* during identification — i.e. from
 * provider calls the lookup already made. Only sources that resolve to a single
 * product are taken here, so the captured price is never confidently wrong:
 *  - PriceCharting (games): loose/CIB/new parsed from the same detail page.
 *  - LeDenicheur (all types): best-match new price from the same BFF call.
 *  - Philibert (board games): new price from the same product page.
 *  - AchatMoinsCher (all types): barcode resolves to one product page → new+used.
 *  - ChasseAuxLivres (all types): only when it resolved a single product.
 * PicClick is left to the background refresh: it returns a list of marketplace
 * listings, so its price needs matching/aggregation to avoid being wrong.
 */
function collectScanPriceOffers(
  payload: BarcodeLookupPayload,
  shelfType: string,
): PriceOfferInput[] {
  const offers: PriceOfferInput[] = [];
  const push = (
    source: string,
    condition: string,
    priceCents: number | null | undefined,
    rawValue: unknown,
  ) => {
    if (typeof priceCents === "number" && priceCents > 0) {
      offers.push({ source, condition, priceCents, rawValue });
    }
  };

  if (shelfType === "games" && payload.pc?.prices) {
    push(
      "PriceCharting",
      "loose",
      payload.pc.prices.priceUsed,
      payload.pc.prices,
    );
    push(
      "PriceCharting",
      "cib",
      payload.pc.prices.priceUsedCIB,
      payload.pc.prices,
    );
    push("PriceCharting", "new", payload.pc.prices.priceNew, payload.pc.prices);
  }
  if (payload.leDenicheur?.priceNew) {
    push(
      "LeDenicheur",
      "new",
      payload.leDenicheur.priceNew,
      payload.leDenicheur,
    );
  }
  if (payload.philibert?.priceCents) {
    push("Philibert", "new", payload.philibert.priceCents, payload.philibert);
  }
  // AchatMoinsCher resolves a barcode to a single product page (new + used).
  const amcPriced = payload.amc.find(
    (entry) => entry.priceNew != null || entry.priceUsed != null,
  );
  if (amcPriced) {
    push("AchatMoinsCher", "new", amcPriced.priceNew, amcPriced);
    push("AchatMoinsCher", "used", amcPriced.priceUsed, amcPriced);
  }
  // ChasseAuxLivres attaches prices only when it resolved a single product.
  const calLists = [
    payload.calFr,
    payload.calDvd,
    payload.calMusic,
    payload.calToys,
    payload.calJeuxVideo,
    payload.calGeneric,
  ];
  for (const list of calLists) {
    const priced = list.find(
      (entry) => entry.priceNew != null || entry.priceUsed != null,
    );
    if (priced) {
      push("ChasseAuxLivres", "new", priced.priceNew, priced);
      push("ChasseAuxLivres", "used", priced.priceUsed, priced);
      break;
    }
  }

  return offers;
}

async function cacheBarcodeResult(
  cleanedBarcode: string,
  res: CompiledResult,
  shelfType: string,
  previousCache?: BarcodeCachePriceSnapshot | null,
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
        platformKey: res.platformKey || null,
        priceLastUpdated: priceSnapshot?.priceLastUpdated ?? null,
        priceNew: priceSnapshot?.priceNew ?? null,
        priceUsed: priceSnapshot?.priceUsed ?? null,
        priceUsedCIB: priceSnapshot?.priceUsedCIB ?? null,
        rawNames: {
          create: rawNames,
        },
      },
      update: {
        provider: versionProvider(res.provider),
        shelfType,
        platformKey: res.platformKey || null,
        priceLastUpdated: priceSnapshot?.priceLastUpdated ?? null,
        priceNew: priceSnapshot?.priceNew ?? null,
        priceUsed: priceSnapshot?.priceUsed ?? null,
        priceUsedCIB: priceSnapshot?.priceUsedCIB ?? null,
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
      scoreTypeCandidate(b[0], b[1], cleanedBarcode, boardGameSignal) -
      scoreTypeCandidate(a[0], a[1], cleanedBarcode, boardGameSignal),
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
  const boardGameSignal = detectBoardGameSignal(
    collectPayloadListingNames(payload),
  );
  const { selectedType, selectedResult } = selectBarcodeTypeResult(
    type,
    typeResults,
    cleanedBarcode,
    boardGameSignal,
  );

  if (selectedResult && selectedType) {
    await cacheBarcodeResult(
      cleanedBarcode,
      selectedResult,
      selectedType,
      cachedResult,
    );
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

    if (scanOffers.length > 0 && !cachedPricesAreFresh) {
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
      ...(capturedPrices ?? {}),
    };
  }

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
