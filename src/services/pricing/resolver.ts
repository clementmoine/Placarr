import { prisma } from "@/lib/db/prisma";
import {
  hasExplicitVolumeMarker,
  isLotListing,
  listingLooksLikeNonBookProduct,
  priceListingMatchesAnyItemName,
  priceListingVolumeConflictsWithItem,
} from "@/lib/barcode/titleUtils";
import { detectPlatformKey } from "@/lib/barcode/query";
import { detectShelfGamePlatformKey } from "@/lib/metadata/platform";
import { mergePriceOffers, type PriceOfferInput } from "@/services/metadata/evidence";
import { buildPriceSearchQueries } from "@/lib/pricing/searchQueries";
import { parsePriceProviderSources } from "@/lib/pricing/cachePolicy";
import { containsGameClassicsKeyword } from "@/lib/barcode/listingTerms";
import {
  filterObservationsByOutlierTrim,
  filterUsedPricesAboveNew,
  trimPriceOutlierCents,
} from "@/lib/pricing/outlierTrim";
import {
  collectRefreshBarcodePriceOffers,
  priceProviderTokenFromOffers,
} from "@/services/provider/barcodePrices";
import { isReferencePriceSource, formatProviderSourceLabel } from "@/services/provider/registry";

export type PriceObservation = {
  source: string;
  productName?: string | null;
  merchantName?: string | null;
  condition?: string | null;
  priceCents: number;
  currency?: string | null;
  sourceUrl?: string | null;
  offerCount?: number | null;
  observedAt?: Date | string | null;
};

export type BarcodePricesResult = {
  priceNew: number | null;
  priceUsed: number | null;
  priceUsedCIB: number | null;
  priceLastUpdated: Date | null;
  priceSources: string[];
  /** Display labels aligned with `priceSources` (registry-derived, server-stamped). */
  priceSourceDisplayNames: string[];
  /** True when the only price source is a reference/catalog database provider. */
  isReferencePriceOnly: boolean;
  priceObservations: ReturnType<typeof serializePriceOffers>;
};

export type RefreshBarcodePricesInput = {
  cleanedBarcode: string;
  shelfType: string;
  /** Shelf/platform name, used for region (PAL/NTSC) and provider context. */
  shelfName?: string | null;
  /** Primary display name (item or scanned match) used in game heuristics. */
  primaryName: string;
  /** Extra query names (metadata title, aliases…) merged ahead of cached raw names. */
  extraNames?: string[];
};

type GetCachedBarcodePricesOptions = {
  itemId?: string | null;
  metadataId?: string | null;
  itemNames?: string[];
  shelfName?: string | null;
};

export type RefreshItemPricesInput = {
  shelfType: string;
  shelfName?: string | null;
  primaryName: string;
  extraNames?: string[];
  itemId: string;
  metadataId?: string | null;
};

function averageCents(values: number[]) {
  const trimmed = trimPriceOutlierCents(values);
  if (trimmed.length === 0) return null;
  return Math.round(
    trimmed.reduce((sum, value) => sum + value, 0) / trimmed.length,
  );
}

function gameUsedConditions(shelfType: string) {
  return shelfType === "games" ? ["loose", "used"] : ["used"];
}

function trimObservedPriceOutliers(
  shelfType: string,
  offers: PriceObservation[],
): PriceObservation[] {
  let trimmed = filterObservationsByOutlierTrim(offers, ["new"]);
  trimmed = filterObservationsByOutlierTrim(trimmed, gameUsedConditions(shelfType));
  if (shelfType === "games") {
    trimmed = filterObservationsByOutlierTrim(trimmed, ["cib"]);
  }
  return filterUsedPricesAboveNew(trimmed, shelfType, isReferencePriceSource);
}

/** Unnamed shop rows are kept only when no titled listing matched. */
function dropUnnamedMarketplaceNoise(
  offers: PriceObservation[],
): PriceObservation[] {
  const namedMatches = offers.filter((offer) => offer.productName?.trim());
  if (namedMatches.length === 0) return offers;

  return offers.filter(
    (offer) =>
      offer.productName?.trim() ||
      isReferencePriceSource(offer.source ?? ""),
  );
}

function relaxedOffersForPriceFallback(
  shelfType: string,
  shelfName: string | null | undefined,
  itemNames: string[],
  offers: PriceObservation[],
): PriceObservation[] {
  const platformFiltered = offers.filter((offer) =>
    priceListingMatchesShelfPlatform(shelfType, shelfName, offer.productName),
  );
  if (itemNames.length === 0) return platformFiltered;

  const numberedBook =
    shelfType === "books" &&
    itemNames.some((name) => hasExplicitVolumeMarker(name));

  return platformFiltered.filter((offer) => {
    const listing = offer.productName?.trim() ?? "";
    if (listing && isLotListing(listing)) return false;
    if (listing && listingLooksLikeNonBookProduct(listing)) return false;

    if (!listing) {
      if (numberedBook) return false;
      return isReferencePriceSource(offer.source ?? "");
    }
    return priceListingMatchesAnyItemName(itemNames, offer.productName);
  });
}

type ItemPriceResolution = {
  summary: ReturnType<typeof summarizeObservedPrices>;
  filteredOffers: PriceObservation[];
  strictMatch: boolean;
};

/**
 * Strict title/platform filter first; when every listing title is noisy, fall
 * back to trimmed aggregates so shelf cards match item pages (which keep the
 * same summary via {@link alignBarcodePricesForItemNames}).
 */
function resolveItemPriceFromOffers(
  shelfType: string,
  shelfName: string | null | undefined,
  itemNames: string[],
  offers: PriceObservation[],
): ItemPriceResolution | null {
  if (offers.length === 0) return null;

  const filtered = filterItemPriceOffers(
    shelfType,
    shelfName,
    itemNames,
    offers,
  );
  if (filtered.length > 0) {
    return {
      summary: summarizeObservedPrices(shelfType, filtered),
      filteredOffers: filtered,
      strictMatch: true,
    };
  }

  const trimmed = trimObservedPriceOutliers(
    shelfType,
    relaxedOffersForPriceFallback(shelfType, shelfName, itemNames, offers),
  );
  const summary = summarizeObservedPrices(shelfType, trimmed);
  const hasSummary =
    summary.priceNew != null ||
    summary.priceUsed != null ||
    summary.priceUsedCIB != null;
  if (!hasSummary) return null;

  return {
    summary,
    filteredOffers: [],
    strictMatch: false,
  };
}

function pricesForCondition(offers: PriceObservation[], conditions: string[]) {
  const wanted = new Set(conditions);
  return offers
    .filter((offer) => offer.condition && wanted.has(offer.condition))
    .map((offer) => offer.priceCents);
}

function summarizeObservedPrices(
  shelfType: string,
  offers: PriceObservation[],
) {
  return {
    priceNew: averageCents(pricesForCondition(offers, ["new"])),
    priceUsed: averageCents(
      pricesForCondition(
        offers,
        shelfType === "games" ? ["loose", "used"] : ["used"],
      ),
    ),
    priceUsedCIB:
      shelfType === "games"
        ? averageCents(pricesForCondition(offers, ["cib"]))
        : null,
  };
}

function priceSourcesFromOffers(
  offers: PriceObservation[],
  fallbackProvider?: string | null,
) {
  return Array.from(
    new Set([
      ...offers.map((offer) => offer.source).filter(Boolean),
      ...parsePriceProviderSources(fallbackProvider),
    ]),
  );
}

function serializePriceOffers(offers: PriceObservation[]) {
  return offers.map((offer) => ({
    source: offer.source,
    productName: offer.productName ?? null,
    merchantName: offer.merchantName ?? null,
    condition: offer.condition ?? null,
    priceCents: offer.priceCents,
    currency: offer.currency ?? "EUR",
    sourceUrl: offer.sourceUrl ?? null,
    offerCount: offer.offerCount ?? null,
    observedAt: offer.observedAt
      ? new Date(offer.observedAt).toISOString()
      : null,
    isReferencePriceSource: isReferencePriceSource(offer.source),
    sourceDisplayLabel: formatProviderSourceLabel(offer.source),
  }));
}

function withPriceSourceTraits(
  result: Omit<
    BarcodePricesResult,
    "isReferencePriceOnly" | "priceSourceDisplayNames"
  >,
): BarcodePricesResult {
  const sources = result.priceSources;
  return {
    ...result,
    priceSourceDisplayNames: sources.map(formatProviderSourceLabel),
    isReferencePriceOnly:
      sources.length === 1 && isReferencePriceSource(sources[0] ?? ""),
  };
}

export function emptyBarcodePrices(): BarcodePricesResult {
  return withPriceSourceTraits({
    priceNew: null,
    priceUsed: null,
    priceUsedCIB: null,
    priceLastUpdated: null,
    priceSources: [],
    priceObservations: [],
  });
}

function priceListingMatchesShelfPlatform(
  shelfType: string,
  shelfName: string | null | undefined,
  productName?: string | null,
): boolean {
  if (shelfType !== "games" || !shelfName?.trim() || !productName?.trim()) {
    return true;
  }
  const shelfPlatform = detectShelfGamePlatformKey(shelfName);
  if (!shelfPlatform) return true;
  const listingPlatform = detectPlatformKey(productName);
  if (!listingPlatform) return true;
  return listingPlatform === shelfPlatform;
}

export function filterItemPriceOffers(
  shelfType: string,
  shelfName: string | null | undefined,
  itemNames: string[],
  offers: PriceObservation[],
): PriceObservation[] {
  const platformFiltered = offers.filter((offer) =>
    priceListingMatchesShelfPlatform(shelfType, shelfName, offer.productName),
  );

  const names = [...new Set(itemNames.map((name) => name.trim()).filter(Boolean))];
  const titleFiltered =
    names.length === 0
      ? platformFiltered
      : platformFiltered.filter((offer) =>
          priceListingMatchesAnyItemName(names, offer.productName),
        );

  const baseOffers = names.length === 0 ? platformFiltered : titleFiltered;

  return trimObservedPriceOutliers(
    shelfType,
    dropUnnamedMarketplaceNoise(baseOffers),
  );
}

function observationsFromFilteredOffers(
  sourceObservations: ReturnType<typeof serializePriceOffers>,
  filtered: PriceObservation[],
) {
  return sourceObservations.filter((offer) =>
    filtered.some(
      (row) =>
        row.source === offer.source &&
        row.condition === offer.condition &&
        row.priceCents === offer.priceCents &&
        row.productName === offer.productName,
    ),
  );
}

/**
 * Drops marketplace rows whose product title does not match any known item name.
 * Keeps barcode-scoped aggregate prices when every listing title is noisy (e.g.
 * EN marketplace copy vs a FR shelf title) so the item page stays aligned with
 * the shelf card, which reads the same cache without this filter.
 */
export function alignBarcodePricesForItemNames(
  shelfType: string,
  itemNames: string[],
  prices: BarcodePricesResult,
  shelfName?: string | null,
): BarcodePricesResult {
  const names = [...new Set(itemNames.map((name) => name.trim()).filter(Boolean))];
  if (names.length === 0 || prices.priceObservations.length === 0) {
    return prices;
  }

  const sourceOffers: PriceObservation[] = prices.priceObservations.map(
    (offer) => ({
      source: offer.source,
      productName: offer.productName,
      merchantName: offer.merchantName,
      condition: offer.condition ?? undefined,
      priceCents: offer.priceCents,
      currency: offer.currency ?? undefined,
      sourceUrl: offer.sourceUrl,
      offerCount: offer.offerCount,
      observedAt: offer.observedAt,
    }),
  );
  const filtered = filterItemPriceOffers(
    shelfType,
    shelfName,
    names,
    sourceOffers,
  );

  if (filtered.length === 0) {
    const namedOffers = sourceOffers.filter((offer) => offer.productName?.trim());
    if (namedOffers.length > 0) {
      if (
        namedOffers.every(
          (offer) =>
            isLotListing(offer.productName!) ||
            listingLooksLikeNonBookProduct(offer.productName!),
        )
      ) {
        return emptyBarcodePrices();
      }
      if (
        namedOffers.every((offer) =>
          priceListingVolumeConflictsWithItem(names, offer.productName),
        )
      ) {
        return emptyBarcodePrices();
      }
    }

    const hasSummary =
      prices.priceNew != null ||
      prices.priceUsed != null ||
      prices.priceUsedCIB != null;
    if (!hasSummary) return emptyBarcodePrices();
    return { ...prices, priceObservations: [] };
  }

  const summary = summarizeObservedPrices(shelfType, filtered);

  return withPriceSourceTraits({
    priceNew: summary.priceNew,
    priceUsed: summary.priceUsed,
    priceUsedCIB: summary.priceUsedCIB,
    priceLastUpdated: prices.priceLastUpdated,
    priceSources: priceSourcesFromOffers(filtered),
    priceObservations: observationsFromFilteredOffers(
      prices.priceObservations,
      filtered,
    ),
  });
}

/**
 * Read prices for a barcode from the shared cache only — no network. Prices are
 * scoped to the barcode (not the item), so a value resolved at scan time is
 * reused by the item page and modal. Returns null when nothing is cached.
 */
export async function getCachedBarcodePrices(
  cleanedBarcode: string,
  shelfType: string,
  options: GetCachedBarcodePricesOptions = {},
): Promise<BarcodePricesResult | null> {
  const cached = await prisma.barcodeCache.findUnique({
    where: { barcode: cleanedBarcode },
    select: {
      id: true,
      shelfType: true,
      provider: true,
      priceNew: true,
      priceUsed: true,
      priceUsedCIB: true,
      priceLastUpdated: true,
    },
  });
  // A cache built for another shelf type isn't a reliable estimate here.
  const usableBarcodeCache =
    cached && (!cached.shelfType || cached.shelfType === shelfType)
      ? cached
      : null;

  const offerScopes = [
    ...(usableBarcodeCache ? [{ barcodeCacheId: usableBarcodeCache.id }] : []),
    ...(options.itemId ? [{ itemId: options.itemId }] : []),
    ...(options.metadataId ? [{ metadataId: options.metadataId }] : []),
  ];
  if (!usableBarcodeCache && offerScopes.length === 0) return null;

  const offers = await prisma.priceOffer.findMany({
    where: offerScopes.length === 1 ? offerScopes[0] : { OR: offerScopes },
    orderBy: { observedAt: "desc" },
    take: 24,
  });
  const hasSummary =
    usableBarcodeCache?.priceNew != null ||
    usableBarcodeCache?.priceUsed != null ||
    usableBarcodeCache?.priceUsedCIB != null;
  if (offers.length === 0 && !hasSummary) return null;

  const sourceOffers = toPriceObservations(offers);
  const itemNames = (options.itemNames ?? []).filter((name) => name.trim());

  if (itemNames.length > 0) {
    return resolveItemDisplayPrices(
      shelfType,
      options.shelfName,
      itemNames,
      sourceOffers,
      usableBarcodeCache
        ? {
            priceNew: usableBarcodeCache.priceNew,
            priceUsed: usableBarcodeCache.priceUsed,
            priceUsedCIB: usableBarcodeCache.priceUsedCIB,
            priceLastUpdated: usableBarcodeCache.priceLastUpdated,
          }
        : null,
    );
  }

  const observedSummary =
    offers.length > 0 ? summarizeObservedPrices(shelfType, offers) : null;
  const summary = {
    priceNew: observedSummary?.priceNew ?? usableBarcodeCache?.priceNew ?? null,
    priceUsed:
      observedSummary?.priceUsed ?? usableBarcodeCache?.priceUsed ?? null,
    priceUsedCIB:
      observedSummary?.priceUsedCIB ?? usableBarcodeCache?.priceUsedCIB ?? null,
  };

  return withPriceSourceTraits({
    priceNew: summary.priceNew,
    priceUsed: summary.priceUsed,
    priceUsedCIB: summary.priceUsedCIB,
    priceLastUpdated:
      usableBarcodeCache?.priceLastUpdated ?? offers[0]?.observedAt ?? null,
    priceSources: priceSourcesFromOffers(offers, usableBarcodeCache?.provider),
    priceObservations: serializePriceOffers(offers),
  });
}

/**
 * Read prices scoped to an item (and optionally its metadata) without a barcode.
 */
export type ShelfItemPriceFields = {
  priceNew: number | null;
  priceUsed: number | null;
  priceUsedCIB: number | null;
  priceLastUpdated: Date | null;
};

function cleanBarcodeValue(barcode?: string | null): string {
  return barcode ? barcode.replace(/[^\d]/g, "").trim() : "";
}

type CacheSummaryFields = {
  priceNew: number | null;
  priceUsed: number | null;
  priceUsedCIB: number | null;
  priceLastUpdated: Date | null;
};

function toPriceObservations(
  offers: Array<{
    source: string;
    productName?: string | null;
    merchantName?: string | null;
    condition?: string | null;
    priceCents: number;
    currency?: string | null;
    sourceUrl?: string | null;
    offerCount?: number | null;
    observedAt?: Date | string | null;
  }>,
): PriceObservation[] {
  return offers.map((offer) => ({
    source: offer.source,
    productName: offer.productName,
    merchantName: offer.merchantName,
    condition: offer.condition,
    priceCents: offer.priceCents,
    currency: offer.currency,
    sourceUrl: offer.sourceUrl,
    offerCount: offer.offerCount,
    observedAt: offer.observedAt,
  }));
}

function priceLastUpdatedFromOffers(
  offers: PriceObservation[],
  fallback: Date | null = null,
): Date | null {
  const first = offers[0]?.observedAt;
  if (!first) return fallback;
  return first instanceof Date ? first : new Date(first);
}

/**
 * Single price resolution path for shelf cards and item pages: strict filter,
 * relaxed fallback, then align with cache / unfiltered offer aggregates (same
 * as {@link alignBarcodePricesForItemNames} after a fresh provider refresh).
 */
function resolveItemDisplayPrices(
  shelfType: string,
  shelfName: string | null | undefined,
  itemNames: string[],
  offers: PriceObservation[],
  cacheSummary: CacheSummaryFields | null,
): BarcodePricesResult | null {
  const observedSummary =
    offers.length > 0 ? summarizeObservedPrices(shelfType, offers) : null;
  const summaryInput: CacheSummaryFields = {
    priceNew: cacheSummary?.priceNew ?? observedSummary?.priceNew ?? null,
    priceUsed: cacheSummary?.priceUsed ?? observedSummary?.priceUsed ?? null,
    priceUsedCIB:
      cacheSummary?.priceUsedCIB ?? observedSummary?.priceUsedCIB ?? null,
    priceLastUpdated:
      cacheSummary?.priceLastUpdated ?? priceLastUpdatedFromOffers(offers),
  };

  if (offers.length > 0) {
    const resolution = resolveItemPriceFromOffers(
      shelfType,
      shelfName,
      itemNames,
      offers,
    );
    if (resolution) {
      const serialized = serializePriceOffers(offers);
      const sourceOffers = resolution.strictMatch
        ? resolution.filteredOffers
        : trimObservedPriceOutliers(
            shelfType,
            relaxedOffersForPriceFallback(
              shelfType,
              shelfName,
              itemNames,
              offers,
            ),
          );

      return withPriceSourceTraits({
        priceNew: resolution.summary.priceNew,
        priceUsed: resolution.summary.priceUsed,
        priceUsedCIB: resolution.summary.priceUsedCIB,
        priceLastUpdated: priceLastUpdatedFromOffers(offers),
        priceSources: priceSourcesFromOffers(sourceOffers),
        priceObservations: resolution.strictMatch
          ? observationsFromFilteredOffers(serialized, resolution.filteredOffers)
          : [],
      });
    }
  }

  const hasSummaryInput =
    summaryInput.priceNew != null ||
    summaryInput.priceUsed != null ||
    summaryInput.priceUsedCIB != null;
  if (!hasSummaryInput && offers.length === 0) return null;

  const aligned = alignBarcodePricesForItemNames(
    shelfType,
    itemNames,
    withPriceSourceTraits({
      priceNew: summaryInput.priceNew,
      priceUsed: summaryInput.priceUsed,
      priceUsedCIB: summaryInput.priceUsedCIB,
      priceLastUpdated: summaryInput.priceLastUpdated,
      priceSources: priceSourcesFromOffers(offers),
      priceObservations: serializePriceOffers(offers),
    }),
    shelfName,
  );

  if (
    aligned.priceNew == null &&
    aligned.priceUsed == null &&
    aligned.priceUsedCIB == null
  ) {
    return null;
  }

  return aligned;
}

function resolveShelfItemPriceFields(
  shelfType: string,
  shelfName: string | null | undefined,
  itemNames: string[],
  offers: PriceObservation[],
  cacheSummary: CacheSummaryFields | null,
): ShelfItemPriceFields | null {
  const resolved = resolveItemDisplayPrices(
    shelfType,
    shelfName,
    itemNames,
    offers,
    cacheSummary,
  );
  if (!resolved) return null;

  return {
    priceNew: resolved.priceNew,
    priceUsed: resolved.priceUsed,
    priceUsedCIB: resolved.priceUsedCIB,
    priceLastUpdated: resolved.priceLastUpdated,
  };
}

/**
 * Batch price summaries for shelf grids: filtered offers when available, with
 * barcode-cache fallback when every listing title is noisy.
 */
export async function summarizeShelfItemPrices(
  shelfType: string,
  items: Array<{
    id: string;
    barcode?: string | null;
    name?: string | null;
    metadataTitle?: string | null;
  }>,
  shelfName?: string | null,
): Promise<Map<string, ShelfItemPriceFields>> {
  const result = new Map<string, ShelfItemPriceFields>();
  if (items.length === 0) return result;

  const cleanBarcodes = [
    ...new Set(
      items.map((item) => cleanBarcodeValue(item.barcode)).filter(Boolean),
    ),
  ];
  const caches =
    cleanBarcodes.length > 0
      ? await prisma.barcodeCache.findMany({
          where: { barcode: { in: cleanBarcodes } },
        })
      : [];
  const cacheByBarcode = new Map(caches.map((cache) => [cache.barcode, cache]));

  const usableCacheIds = caches
    .filter((cache) => !cache.shelfType || cache.shelfType === shelfType)
    .map((cache) => cache.id);
  const itemIds = items.map((item) => item.id);

  const offers =
    itemIds.length > 0 || usableCacheIds.length > 0
      ? await prisma.priceOffer.findMany({
          where: {
            OR: [
              ...(itemIds.length > 0 ? [{ itemId: { in: itemIds } }] : []),
              ...(usableCacheIds.length > 0
                ? [{ barcodeCacheId: { in: usableCacheIds } }]
                : []),
            ],
          },
          orderBy: { observedAt: "desc" },
        })
      : [];

  const offersByItemId = new Map<string, typeof offers>();
  for (const item of items) {
    const clean = cleanBarcodeValue(item.barcode);
    const cache = clean ? cacheByBarcode.get(clean) : null;
    const usableCache =
      cache && (!cache.shelfType || cache.shelfType === shelfType)
        ? cache
        : null;
    const itemOffers = offers.filter(
      (offer) =>
        offer.itemId === item.id ||
        (usableCache?.id != null && offer.barcodeCacheId === usableCache.id),
    );
    if (itemOffers.length > 0) {
      offersByItemId.set(item.id, itemOffers.slice(0, 24));
    }
  }

  for (const item of items) {
    const clean = cleanBarcodeValue(item.barcode);
    const cache = clean ? cacheByBarcode.get(clean) : null;
    const usableCache =
      cache && (!cache.shelfType || cache.shelfType === shelfType)
        ? cache
        : null;
    const itemOffers = offersByItemId.get(item.id) ?? [];
    const itemNames = [item.name, item.metadataTitle].filter(
      (name): name is string => !!name?.trim(),
    );
    const sourceOffers = toPriceObservations(itemOffers);
    const cacheSummary = usableCache
      ? {
          priceNew: usableCache.priceNew,
          priceUsed: usableCache.priceUsed,
          priceUsedCIB: usableCache.priceUsedCIB,
          priceLastUpdated: usableCache.priceLastUpdated,
        }
      : null;

    const fields = resolveShelfItemPriceFields(
      shelfType,
      shelfName,
      itemNames,
      sourceOffers,
      cacheSummary,
    );
    if (fields) {
      result.set(item.id, fields);
    }
  }

  return result;
}

export async function getCachedItemPrices(
  shelfType: string,
  options: {
    itemId: string;
    metadataId?: string | null;
    itemNames?: string[];
    shelfName?: string | null;
  },
): Promise<BarcodePricesResult | null> {
  const offerScopes = [
    { itemId: options.itemId },
    ...(options.metadataId ? [{ metadataId: options.metadataId }] : []),
  ];

  const offers = await prisma.priceOffer.findMany({
    where: offerScopes.length === 1 ? offerScopes[0] : { OR: offerScopes },
    orderBy: { observedAt: "desc" },
    take: 24,
  });
  if (offers.length === 0) return null;

  const sourceOffers = toPriceObservations(offers);
  const itemNames = (options.itemNames ?? []).filter((name) => name.trim());

  return resolveItemDisplayPrices(
    shelfType,
    options.shelfName,
    itemNames,
    sourceOffers,
    null,
  );
}

/**
 * Persist price offers that were obtained from a provider call (captured during
 * barcode resolution, or fetched by {@link refreshBarcodePrices}) without losing
 * existing data: offers are *merged* by source+condition, so a provider that
 * didn't answer keeps its previous value. An empty batch (every provider failed)
 * is a no-op that returns whatever is already cached — the cache is never wiped.
 */
export async function persistBarcodePrices(params: {
  cleanedBarcode: string;
  shelfType: string;
  priceOffers: PriceOfferInput[];
  /**
   * Price-source string to store on the cache row. Omit to leave the existing
   * `provider` untouched (e.g. when capturing prices during barcode resolution,
   * where `provider` carries the identification-cache version).
   */
  provider?: string | null;
}): Promise<BarcodePricesResult> {
  const { cleanedBarcode, shelfType, priceOffers, provider } = params;

  const incoming = priceOffers.filter(
    (offer) =>
      offer.source &&
      Number.isInteger(offer.priceCents) &&
      offer.priceCents > 0,
  );

  // Nothing new (e.g. all providers failed): never erase what we already have.
  if (incoming.length === 0) {
    return (
      (await getCachedBarcodePrices(cleanedBarcode, shelfType)) ??
      emptyBarcodePrices()
    );
  }

  const now = new Date();
  const cacheRecord = await prisma.barcodeCache.upsert({
    where: { barcode: cleanedBarcode },
    create: {
      barcode: cleanedBarcode,
      provider: provider ?? "prices",
      shelfType,
    },
    update: {
      ...(provider ? { provider } : {}),
      shelfType,
    },
  });

  const merged = await mergePriceOffers(
    { barcodeCacheId: cacheRecord.id },
    incoming,
  );
  const { priceNew, priceUsed, priceUsedCIB } = summarizeObservedPrices(
    shelfType,
    merged,
  );

  await prisma.barcodeCache.update({
    where: { id: cacheRecord.id },
    data: { priceNew, priceUsed, priceUsedCIB, priceLastUpdated: now },
  });

  return withPriceSourceTraits({
    priceNew,
    priceUsed,
    priceUsedCIB,
    priceLastUpdated: now,
    priceSources: priceSourcesFromOffers(merged, provider),
    priceObservations: serializePriceOffers(merged),
  });
}

/**
 * Merge price offers onto an item/metadata scope (no barcode cache row).
 */
export async function persistItemPrices(params: {
  itemId: string;
  metadataId?: string | null;
  shelfType: string;
  priceOffers: PriceOfferInput[];
}): Promise<BarcodePricesResult> {
  const { itemId, metadataId, shelfType, priceOffers } = params;
  const scope = metadataId ? { itemId, metadataId } : { itemId };

  const incoming = priceOffers.filter(
    (offer) =>
      offer.source &&
      Number.isInteger(offer.priceCents) &&
      offer.priceCents > 0,
  );

  if (incoming.length === 0) {
    return (
      (await getCachedItemPrices(shelfType, { itemId, metadataId })) ??
      emptyBarcodePrices()
    );
  }

  const merged = await mergePriceOffers(scope, incoming);
  const { priceNew, priceUsed, priceUsedCIB } = summarizeObservedPrices(
    shelfType,
    merged,
  );
  const now = new Date();

  return withPriceSourceTraits({
    priceNew,
    priceUsed,
    priceUsedCIB,
    priceLastUpdated: now,
    priceSources: priceSourcesFromOffers(merged),
    priceObservations: serializePriceOffers(merged),
  });
}

/**
 * Query the price providers for a barcode and merge the result into the cache.
 * Heavy (paid third-party calls) — callers should prefer {@link getCachedBarcodePrices}
 * and only refresh when the cache is missing or stale.
 */
export async function refreshBarcodePrices(
  input: RefreshBarcodePricesInput,
): Promise<BarcodePricesResult> {
  const {
    cleanedBarcode,
    shelfType,
    shelfName,
    primaryName,
    extraNames = [],
  } = input;

  const cached = await prisma.barcodeCache.findUnique({
    where: { barcode: cleanedBarcode },
    include: { rawNames: true },
  });

  console.log(
    `[Prices] Fetching fresh prices for barcode ${cleanedBarcode} (shelf type: ${shelfType})`,
  );

  const rawNamesList = cached?.rawNames?.map((rn) => rn.value) || [];
  const namePool = Array.from(
    new Set(
      [...extraNames, primaryName, ...rawNamesList].filter(
        (name): name is string => !!name && name.trim().length > 0,
      ),
    ),
  );
  const fallbackNames = buildPriceSearchQueries(namePool, shelfName);
  const leDenicheurQueries = cleanedBarcode
    ? [cleanedBarcode, ...fallbackNames]
    : fallbackNames;

  const regionHaystacks = [primaryName, shelfName ?? "", ...rawNamesList];
  const hasNtscIndicator = regionHaystacks.some((value) =>
    /\b(ntsc|us|usa|jp|jpn|japan)\b/i.test(value),
  );
  const isPal = !hasNtscIndicator;
  const isClassics = [primaryName, ...rawNamesList].some((value) =>
    containsGameClassicsKeyword(value),
  );

  const priceOffers = await collectRefreshBarcodePriceOffers({
    cleanedBarcode,
    shelfType,
    shelfName,
    primaryName,
    fallbackNames,
    leDenicheurQueries,
    isPal,
    isClassics,
  });

  return persistBarcodePrices({
    cleanedBarcode,
    shelfType,
    priceOffers,
    provider: priceProviderTokenFromOffers(shelfType, priceOffers),
  });
}

/**
 * Query marketplace price providers by title when no barcode is available.
 */
export async function refreshItemPrices(
  input: RefreshItemPricesInput,
): Promise<BarcodePricesResult> {
  const {
    shelfType,
    shelfName,
    primaryName,
    extraNames = [],
    itemId,
    metadataId,
  } = input;

  console.log(
    `[Prices] Fetching title-based prices for item ${itemId} (shelf type: ${shelfType})`,
  );

  const namePool = Array.from(
    new Set(
      [...extraNames, primaryName].filter(
        (name): name is string => !!name && name.trim().length > 0,
      ),
    ),
  );
  const fallbackNames = buildPriceSearchQueries(namePool, shelfName);

  const regionHaystacks = [primaryName, shelfName ?? ""];
  const hasNtscIndicator = regionHaystacks.some((value) =>
    /\b(ntsc|us|usa|jp|jpn|japan)\b/i.test(value),
  );

  const priceOffers = await collectRefreshBarcodePriceOffers({
    cleanedBarcode: "",
    shelfType,
    shelfName,
    primaryName,
    fallbackNames,
    leDenicheurQueries: fallbackNames,
    isPal: !hasNtscIndicator,
    isClassics: false,
  });

  return persistItemPrices({
    itemId,
    metadataId,
    shelfType,
    priceOffers,
  });
}
