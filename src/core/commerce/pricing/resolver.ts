import { prisma } from "@/lib/db/prisma";
import { aliasBelongsInPriceLookup } from "@/core/identify/titleUtils";
import {
  buildMatchContext,
  toBarcodePriceRefreshContext,
} from "@/core/catalog/matchContext";
import {
  collectRefreshBarcodePriceOffers,
  priceProviderTokenFromOffers,
} from "@/core/catalog/barcodePrices";
import {
  persistProviderExternalLinksForBarcodeItems,
  persistProviderExternalLinksForMetadata,
} from "@/core/enrich/persistProviderExternalLinks";
import { mergePriceOffers, type PriceOfferInput } from "@/core/enrich/evidence";
import { parsePriceProviderSources } from "@/core/commerce/pricing/cachePolicy";
import type {
  BarcodePricesResult,
  CacheSummaryFields,
  PriceObservation,
  RefreshBarcodePricesInput,
  RefreshItemPricesInput,
  ShelfItemPriceFields,
} from "@/core/commerce/pricing/priceTypes";
import {
  alignBarcodePricesForItemNames,
  cleanBarcodeValue,
  emptyBarcodePrices,
  filterPriceOfferInputsForPersist,
  priceSourcesFromOffers,
  resolveItemDisplayPrices,
  serializePriceOffers,
  summarizeObservedPrices,
  toPriceObservations,
  withPriceSourceTraits,
} from "@/core/commerce/pricing/pricePipeline";

export type {
  PriceObservation,
  SerializedPriceObservation,
  BarcodePricesResult,
  RefreshBarcodePricesInput,
  RefreshItemPricesInput,
  ShelfItemPriceFields,
} from "@/core/commerce/pricing/priceTypes";

export {
  summarizeObservedPrices,
  emptyBarcodePrices,
  filterPriceOfferInputsForPersist,
  filterItemPriceOffers,
  alignBarcodePricesForItemNames,
  shouldKeepReferencePricesOnTitleMiss,
  resolveItemDisplayPrices,
} from "@/core/commerce/pricing/pricePipeline";

type GetCachedBarcodePricesOptions = {
  itemId?: string | null;
  metadataId?: string | null;
  itemNames?: string[];
  shelfName?: string | null;
  /** Barcode-cache summary only — skip PriceOffer reads (metadata refresh polling). */
  summaryOnly?: boolean;
};

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

  const hasSummary =
    usableBarcodeCache?.priceNew != null ||
    usableBarcodeCache?.priceUsed != null ||
    usableBarcodeCache?.priceUsedCIB != null;

  if (options.summaryOnly) {
    if (!hasSummary) return null;
    return withPriceSourceTraits({
      priceNew: usableBarcodeCache!.priceNew,
      priceUsed: usableBarcodeCache!.priceUsed,
      priceUsedCIB: usableBarcodeCache!.priceUsedCIB,
      priceLastUpdated: usableBarcodeCache!.priceLastUpdated,
      priceSources: parsePriceProviderSources(usableBarcodeCache!.provider),
      priceObservations: [],
    });
  }

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
    /** Soft aliases (filtered before title-match validation). */
    aliases?: string[] | null;
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
    const primary = item.name?.trim() || item.metadataTitle?.trim() || "";
    const aliasNames = (item.aliases ?? []).filter(
      (alias): alias is string =>
        typeof alias === "string" &&
        !!alias.trim() &&
        (!primary || aliasBelongsInPriceLookup(primary, alias)),
    );
    const itemNames = [item.name, item.metadataTitle, ...aliasNames].filter(
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
  /** When set, reject listings that fail the same identity gate as display. */
  itemNames?: string[];
  shelfName?: string | null;
}): Promise<BarcodePricesResult> {
  const {
    cleanedBarcode,
    shelfType,
    priceOffers,
    provider,
    itemNames = [],
    shelfName,
  } = params;

  const incoming = filterPriceOfferInputsForPersist(
    shelfType,
    shelfName,
    itemNames,
    priceOffers.filter(
      (offer) =>
        offer.source &&
        Number.isInteger(offer.priceCents) &&
        offer.priceCents > 0,
    ),
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

  await persistProviderExternalLinksForBarcodeItems(cleanedBarcode, merged);

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
  itemNames?: string[];
  shelfName?: string | null;
}): Promise<BarcodePricesResult> {
  const {
    itemId,
    metadataId,
    shelfType,
    priceOffers,
    itemNames = [],
    shelfName,
  } = params;
  const scope = metadataId ? { itemId, metadataId } : { itemId };

  const item = await prisma.item.findUnique({
    where: { id: itemId },
    select: {
      barcode: true,
      name: true,
      shelf: { select: { name: true } },
    },
  });

  const incoming = filterPriceOfferInputsForPersist(
    shelfType,
    shelfName ?? item?.shelf?.name,
    itemNames.length > 0 ? itemNames : [item?.name ?? ""],
    priceOffers.filter(
      (offer) =>
        offer.source &&
        Number.isInteger(offer.priceCents) &&
        offer.priceCents > 0,
    ),
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

  if (metadataId) {
    await persistProviderExternalLinksForMetadata(metadataId, {
      itemBarcode: item?.barcode,
      itemTitle: item?.name,
      shelfType,
      priceOffers: merged,
    });
  }

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
    acceptanceNames,
    extraBarcodes = [],
    platformKey,
    releaseDate,
    externalIds,
    providerProductUrls = [],
  } = input;

  const cached = await prisma.barcodeCache.findUnique({
    where: { barcode: cleanedBarcode },
    include: { rawNames: true },
  });

  console.log(
    `[Prices] Fetching fresh prices for barcode ${cleanedBarcode} (shelf type: ${shelfType})`,
  );

  const rawNamesList = cached?.rawNames?.map((rn) => rn.value) || [];
  const match = buildMatchContext({
    shelfType,
    shelfName,
    primaryTitle: primaryName,
    titles: [...extraNames, primaryName, ...rawNamesList],
    acceptanceTitles: acceptanceNames?.length
      ? acceptanceNames
      : [primaryName],
    barcodes: [cleanedBarcode, ...extraBarcodes],
    platformKey,
    releaseDate,
    externalIds,
    providerProductUrls,
    regionHints: rawNamesList,
  });
  const priceOffers = await collectRefreshBarcodePriceOffers(
    toBarcodePriceRefreshContext(match, { expandSearchQueries: true }),
  );

  const persistNames = Array.from(
    new Set(
      [
        primaryName,
        ...extraNames,
        ...(acceptanceNames ?? []),
        ...rawNamesList,
      ]
        .map((name) => name.trim())
        .filter(Boolean),
    ),
  );

  return persistBarcodePrices({
    cleanedBarcode,
    shelfType,
    shelfName,
    itemNames: persistNames,
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
    acceptanceNames,
    extraBarcodes = [],
    platformKey,
    releaseDate,
    externalIds,
    itemId,
    metadataId,
    providerProductUrls = [],
  } = input;

  console.log(
    `[Prices] Fetching title-based prices for item ${itemId} (shelf type: ${shelfType})`,
  );

  const match = buildMatchContext({
    shelfType,
    shelfName,
    primaryTitle: primaryName,
    titles: [...extraNames, primaryName],
    acceptanceTitles: acceptanceNames?.length
      ? acceptanceNames
      : [primaryName],
    barcodes: extraBarcodes,
    platformKey,
    releaseDate,
    externalIds,
    providerProductUrls,
  });
  const priceOffers = await collectRefreshBarcodePriceOffers(
    toBarcodePriceRefreshContext(match, { expandSearchQueries: true }),
  );

  const persistNames = Array.from(
    new Set(
      [primaryName, ...extraNames, ...(acceptanceNames ?? [])]
        .map((name) => name.trim())
        .filter(Boolean),
    ),
  );

  return persistItemPrices({
    itemId,
    metadataId,
    shelfType,
    shelfName,
    itemNames: persistNames,
    priceOffers,
  });
}

export {
  finalizeGamePriceProviders,
  getPriceCacheLifetimeMs,
  hasGameUsedPricing,
  hasReferencePriceOffers,
  isPriceCacheFresh,
  parsePriceProviderSources,
  shouldRefreshPriceCache,
  shouldReturnCachedPrices,
} from "@/core/commerce/pricing/cachePolicy";
export {
  filterObservationsByOutlierTrim,
  filterUsedPricesAboveNew,
  trimPriceOutlierCents,
} from "@/core/commerce/pricing/outlierTrim";
