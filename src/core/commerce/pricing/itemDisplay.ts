import {
  BACKGROUND_WORK_KIND,
  enqueueBackgroundWorkJob,
  type PriceRefreshJobPayload,
} from "@/core/collect/jobs/workQueue";
import { cleanCode } from "@/core/identify/query";
import { isItemMetadataRefreshing } from "@/core/collect/enrichment";
import { shouldRefreshPriceCache } from "@/core/commerce/pricing/resolver";
import {
  isReferencePriceSource,
  providerProductUrlsFromMetadataFacts,
} from "@/core/catalog/catalog";
import { resolveGameMetadataPlatform } from "@/core/enrich/platform";
import { externalIdsFromStoredSources } from "@/core/enrich/scrapePassGate";
import type { MetadataFact } from "@/types/metadataProvider";
import type { MetadataResult } from "@/types/metadataProvider";
import {
  alignBarcodePricesForItemNames,
  getCachedBarcodePrices,
  getCachedItemPrices,
  refreshBarcodePrices,
  refreshItemPrices,
  summarizeShelfItemPrices,
  type BarcodePricesResult,
  type RefreshBarcodePricesInput,
  type RefreshItemPricesInput,
  type ShelfItemPriceFields,
} from "@/core/commerce/pricing/resolver";
import { mergeMetadataPricesIntoResult } from "@/core/commerce/pricing/metadataPriceObservations";
import { repairProviderExternalLinksForItem } from "@/core/enrich/persistProviderExternalLinks";
import { aliasBelongsInPriceLookup } from "@/core/identify/titleUtils";
import { prisma } from "@/lib/db/prisma";

export type ItemPricesContext = {
  id: string;
  barcode?: string | null;
  name: string;
  metadataId?: string | null;
  metadataTitle?: string | null;
  metadataAliases?: string | null;
  metadataReleaseDate?: string | null;
  metadataPlatformKey?: string | null;
  metadataExternalIds?: Record<string, string | null | undefined> | null;
  /** Extra barcodes harvested from metadata (EAN/UPC contributed by providers). */
  metadataBarcodes?: string[] | null;
  metadataFacts?: MetadataFact[];
  metadataRefreshStartedAt?: Date | string | null;
  shelfType: string;
  shelfName: string;
};

const inFlightPriceRefresh = new Map<string, Promise<BarcodePricesResult>>();
const scheduledPriceRefreshKeys = new Set<string>();
/** Avoid hammering marketplace APIs when the item page polls every 2.5s. */
const lastPriceRefreshStartedAt = new Map<string, number>();
const MIN_PRICE_REFRESH_INTERVAL_MS = 5 * 60 * 1000;

export type RefreshItemPricesOptions = {
  /** Bypass the min-interval guard (post-metadata refresh). */
  force?: boolean;
  /** Abort in-flight scrapes (worker price-job timeout). */
  signal?: AbortSignal;
};

function priceRefreshKey(context: ItemPricesContext): string {
  const cleanedBarcode = context.barcode ? cleanCode(context.barcode) : "";
  if (cleanedBarcode) {
    return `barcode:${cleanedBarcode}:${context.shelfType}`;
  }
  return `item:${context.id}:${context.shelfType}`;
}

function shouldDeferPriceRefresh(context: ItemPricesContext): boolean {
  return isItemMetadataRefreshing(context);
}

export function resetPriceRefreshStateForTests(): void {
  inFlightPriceRefresh.clear();
  scheduledPriceRefreshKeys.clear();
  lastPriceRefreshStartedAt.clear();
}

function isWithinPriceRefreshCooldown(key: string): boolean {
  const lastStarted = lastPriceRefreshStartedAt.get(key);
  if (!lastStarted) return false;
  return Date.now() - lastStarted < MIN_PRICE_REFRESH_INTERVAL_MS;
}

export function parseMetadataAliases(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === "string")
      : [];
  } catch (error) {
    console.warn("[Prices] Failed to parse metadata aliases:", error);
    return [];
  }
}

export function itemNamesFromContext(context: ItemPricesContext): string[] {
  const aliases = parseMetadataAliases(context.metadataAliases);
  return [context.name, context.metadataTitle, ...aliases].filter(
    (name): name is string => !!name && name.trim().length > 0,
  );
}

/**
 * Price-provider lookup titles: keep same-product / regional aliases, drop
 * spinoffs and one-sided extensions ("FIFA 2002: Road to…", "… Major League
 * Soccer") so marketplace/PriceCharting search is not poisoned.
 */
export function priceLookupNamesFromContext(
  context: ItemPricesContext,
): string[] {
  const primary = context.name?.trim();
  const names = itemNamesFromContext(context);
  if (!primary) return names;
  return names.filter(
    (name) => name === primary || aliasBelongsInPriceLookup(primary, name),
  );
}

/** Item + metadata title only (no aliases). */
export function primaryItemNamesFromContext(
  context: ItemPricesContext,
): string[] {
  return [context.name, context.metadataTitle].filter(
    (name): name is string => !!name && name.trim().length > 0,
  );
}

function priceRefreshProviderProductUrls(
  context: ItemPricesContext,
): ReturnType<typeof providerProductUrlsFromMetadataFacts> {
  return providerProductUrlsFromMetadataFacts(context.metadataFacts);
}

function refreshBarcodeInput(
  context: ItemPricesContext,
  cleanedBarcode: string,
  signal?: AbortSignal,
): RefreshBarcodePricesInput {
  // Filtered aliases for both seek and accept/align — regional + edition
  // variants (Enter Electro, Remastered) must validate marketplace hits.
  const lookupNames = priceLookupNamesFromContext(context);
  return {
    cleanedBarcode,
    shelfType: context.shelfType,
    shelfName: context.shelfName,
    primaryName: context.name,
    extraNames: lookupNames.filter((name) => name !== context.name),
    acceptanceNames: lookupNames,
    extraBarcodes: context.metadataBarcodes ?? undefined,
    platformKey: context.metadataPlatformKey,
    releaseDate: context.metadataReleaseDate,
    externalIds: context.metadataExternalIds ?? undefined,
    providerProductUrls: priceRefreshProviderProductUrls(context),
    ...(signal ? { signal } : {}),
  };
}

function refreshItemInput(
  context: ItemPricesContext,
  signal?: AbortSignal,
): RefreshItemPricesInput {
  const lookupNames = priceLookupNamesFromContext(context);
  return {
    shelfType: context.shelfType,
    shelfName: context.shelfName,
    primaryName: context.name,
    extraNames: lookupNames.filter((name) => name !== context.name),
    acceptanceNames: lookupNames,
    extraBarcodes: context.metadataBarcodes ?? undefined,
    platformKey: context.metadataPlatformKey,
    releaseDate: context.metadataReleaseDate,
    externalIds: context.metadataExternalIds ?? undefined,
    itemId: context.id,
    metadataId: context.metadataId,
    providerProductUrls: priceRefreshProviderProductUrls(context),
    ...(signal ? { signal } : {}),
  };
}

function alignPricesForContext(
  context: ItemPricesContext,
  prices: BarcodePricesResult | null,
): BarcodePricesResult | null {
  if (!prices) return null;
  return alignBarcodePricesForItemNames(
    context.shelfType,
    priceLookupNamesFromContext(context),
    prices,
    context.shelfName,
  );
}

async function readCachedItemPrices(
  context: ItemPricesContext,
  options: { summaryOnly?: boolean } = {},
): Promise<BarcodePricesResult | null> {
  const cleanedBarcode = context.barcode ? cleanCode(context.barcode) : "";
  const itemNames = priceLookupNamesFromContext(context);
  if (!cleanedBarcode) {
    // Item-scoped cache is DB-only — still serve it during metadata refresh.
    return getCachedItemPrices(context.shelfType, {
      itemId: context.id,
      metadataId: context.metadataId,
      itemNames,
      shelfName: context.shelfName,
    });
  }

  return getCachedBarcodePrices(cleanedBarcode, context.shelfType, {
    itemId: context.id,
    metadataId: context.metadataId,
    itemNames,
    shelfName: context.shelfName,
    summaryOnly: options.summaryOnly,
  });
}

function normalizeProviderProductUrl(url: string): string {
  try {
    const parsed = new URL(url.trim());
    parsed.hash = "";
    parsed.search = "";
    return parsed.toString().replace(/\/$/, "").toLowerCase();
  } catch {
    return url.trim().replace(/\/$/, "").toLowerCase();
  }
}

/**
 * True when metadata already pins a catalog fiche URL but cached reference
 * offers point at a different product (e.g. generic PS2 Slim vs Pink).
 * Soft TTL refresh would leave the wrong cents until the cache aged out.
 */
export function cachedReferencePricesMissApprovedFiches(
  context: ItemPricesContext,
  cached: BarcodePricesResult,
): boolean {
  const approvedUrls = [
    ...new Set(
      providerProductUrlsFromMetadataFacts(context.metadataFacts)
        .map((ref) => normalizeProviderProductUrl(ref.url))
        .filter(Boolean),
    ),
  ];
  if (approvedUrls.length === 0) return false;

  const cachedReferenceUrls = new Set(
    (cached.priceObservations ?? [])
      .filter(
        (offer) =>
          offer.source &&
          isReferencePriceSource(offer.source) &&
          offer.sourceUrl?.trim(),
      )
      .map((offer) => normalizeProviderProductUrl(offer.sourceUrl!)),
  );
  if (cachedReferenceUrls.size === 0) return true;

  return approvedUrls.some((url) => !cachedReferenceUrls.has(url));
}

export async function itemPricesNeedRefresh(
  context: ItemPricesContext,
): Promise<boolean> {
  const cached = await readCachedItemPrices(context);
  if (!cached) return true;
  if (shouldRefreshPriceCache(context.shelfType, cached)) return true;
  return cachedReferencePricesMissApprovedFiches(context, cached);
}

/** Soft TTL vs forced pin-mismatch — callers enqueue force when pin drifted. */
export async function itemPricesRefreshForceReason(
  context: ItemPricesContext,
): Promise<"missing" | "stale" | "approved-fiche-mismatch" | null> {
  const cached = await readCachedItemPrices(context);
  if (!cached) return "missing";
  if (shouldRefreshPriceCache(context.shelfType, cached)) return "stale";
  if (cachedReferencePricesMissApprovedFiches(context, cached)) {
    return "approved-fiche-mismatch";
  }
  return null;
}

export async function itemPricesCacheIsEmpty(
  context: ItemPricesContext,
): Promise<boolean> {
  const cached = await readCachedItemPrices(context);
  if (!cached) return true;
  return (
    cached.priceNew == null &&
    cached.priceUsed == null &&
    cached.priceUsedCIB == null
  );
}

export async function refreshItemPricesFromContext(
  context: ItemPricesContext,
  options: RefreshItemPricesOptions = {},
): Promise<BarcodePricesResult> {
  const key = priceRefreshKey(context);
  const inFlight = inFlightPriceRefresh.get(key);
  if (inFlight) return inFlight;

  async function repairExternalLinksWhenPossible() {
    if (!context.metadataId) return;
    try {
      await repairProviderExternalLinksForItem(context.id);
    } catch (error) {
      console.warn(
        `[Prices] External-link repair failed for item ${context.id}:`,
        error,
      );
    }
  }

  if (!options.force && isWithinPriceRefreshCooldown(key)) {
    const cached = await readCachedItemPrices(context);
    if (cached) {
      await repairExternalLinksWhenPossible();
      return alignPricesForContext(context, cached) ?? cached;
    }
  }

  lastPriceRefreshStartedAt.set(key, Date.now());

  const promise = (async () => {
    if (context.metadataId) {
      try {
        await repairProviderExternalLinksForItem(context.id);
      } catch (error) {
        console.warn(
          `[Prices] External-link repair failed for item ${context.id}:`,
          error,
        );
      }
    }
    const cleanedBarcode = context.barcode ? cleanCode(context.barcode) : "";
    if (!cleanedBarcode) {
      return refreshItemPrices(refreshItemInput(context, options.signal));
    }
    return refreshBarcodePrices(
      refreshBarcodeInput(context, cleanedBarcode, options.signal),
    );
  })();

  inFlightPriceRefresh.set(key, promise);
  try {
    return await promise;
  } finally {
    inFlightPriceRefresh.delete(key);
  }
}

function toPriceRefreshPayload(
  context: ItemPricesContext,
  options?: RefreshItemPricesOptions,
): PriceRefreshJobPayload {
  return {
    id: context.id,
    barcode: context.barcode,
    name: context.name,
    metadataId: context.metadataId,
    metadataTitle: context.metadataTitle,
    metadataAliases: context.metadataAliases,
    metadataReleaseDate: context.metadataReleaseDate,
    metadataPlatformKey: context.metadataPlatformKey,
    metadataExternalIds: context.metadataExternalIds,
    metadataBarcodes: context.metadataBarcodes,
    metadataFacts: context.metadataFacts,
    shelfType: context.shelfType,
    shelfName: context.shelfName,
    force: options?.force,
  };
}

async function enqueueItemPricesRefresh(
  context: ItemPricesContext,
  options?: RefreshItemPricesOptions,
): Promise<void> {
  const item = await prisma.item.findUnique({
    where: { id: context.id },
    select: { userId: true },
  });

  await enqueueBackgroundWorkJob({
    kind: BACKGROUND_WORK_KIND.priceRefresh,
    itemId: context.id,
    userId: item?.userId ?? null,
    replaceOpenForItem: true,
    payload: toPriceRefreshPayload(context, options) as never,
  });
}

export function scheduleItemPricesRefresh(context: ItemPricesContext): void {
  if (shouldDeferPriceRefresh(context)) return;

  const key = priceRefreshKey(context);
  if (
    isWithinPriceRefreshCooldown(key) ||
    inFlightPriceRefresh.has(key) ||
    scheduledPriceRefreshKeys.has(key)
  ) {
    return;
  }
  scheduledPriceRefreshKeys.add(key);

  void enqueueItemPricesRefresh(context)
    .catch((error) => {
      console.error(
        `[Prices] Failed to enqueue refresh for item ${context.id}:`,
        error,
      );
    })
    .finally(() => {
      scheduledPriceRefreshKeys.delete(key);
    });
}

export function scheduleItemPricesRefreshBatch(
  contexts: ItemPricesContext[],
  options?: { onlyWhenEmpty?: boolean },
): void {
  if (contexts.length === 0) return;

  void (async () => {
    const shouldRefresh = options?.onlyWhenEmpty
      ? itemPricesCacheIsEmpty
      : itemPricesNeedRefresh;

    for (const context of contexts) {
      try {
        if (!(await shouldRefresh(context))) continue;
        await enqueueItemPricesRefresh(context);
      } catch (error) {
        console.error(
          `[Prices] Failed to enqueue batch refresh for item ${context.id}:`,
          error,
        );
      }
    }
  })();
}

export type ReadItemPricesOptions = {
  /** When false, missing cache returns null and schedules a background refresh. */
  blockWhenMissing?: boolean;
};

function hasPriceSummary(
  prices: BarcodePricesResult | null | undefined,
): boolean {
  if (!prices) return false;
  return (
    prices.priceNew != null ||
    prices.priceUsed != null ||
    prices.priceUsedCIB != null
  );
}

function finalizeItemPrices(
  context: ItemPricesContext,
  prices: BarcodePricesResult | null,
): BarcodePricesResult | null {
  return mergeMetadataPricesIntoResult({
    shelfType: context.shelfType,
    shelfName: context.shelfName,
    itemNames: priceLookupNamesFromContext(context),
    metadataFacts: context.metadataFacts,
    prices,
  });
}

function withMetadataPriceFallback(
  context: ItemPricesContext,
  prices: BarcodePricesResult | null,
): BarcodePricesResult | null {
  if (hasPriceSummary(prices)) return prices;
  const fallback = metadataPriceFallback(context.metadataFacts);
  if (!fallback) return prices;
  return alignPricesForContext(context, fallback);
}

/**
 * Stale-while-revalidate read used by item APIs: return cached prices when
 * available, refresh via the worker when stale/missing. Set `blockWhenMissing`
 * only for explicit sync paths (tests / admin) — never on interactive Next APIs.
 */
export async function readItemPrices(
  context: ItemPricesContext,
  options: ReadItemPricesOptions = {},
): Promise<BarcodePricesResult | null> {
  const blockWhenMissing = options.blockWhenMissing ?? false;
  const deferNetwork = shouldDeferPriceRefresh(context);
  const cached = await readCachedItemPrices(context, {
    summaryOnly: deferNetwork,
  });

  if (cached) {
    if (shouldRefreshPriceCache(context.shelfType, cached) && !deferNetwork) {
      scheduleItemPricesRefresh(context);
    }
    return finalizeItemPrices(
      context,
      withMetadataPriceFallback(
        context,
        alignPricesForContext(context, cached),
      ),
    );
  }

  if (!blockWhenMissing) {
    if (!deferNetwork) {
      scheduleItemPricesRefresh(context);
    }
    return finalizeItemPrices(
      context,
      withMetadataPriceFallback(context, null),
    );
  }

  if (deferNetwork) {
    return finalizeItemPrices(
      context,
      withMetadataPriceFallback(context, null),
    );
  }

  const fresh = await refreshItemPricesFromContext(context);
  return finalizeItemPrices(
    context,
    withMetadataPriceFallback(context, alignPricesForContext(context, fresh)),
  );
}

export function parseMetadataFacts(
  raw: string | null | undefined,
): MetadataFact[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter(
          (fact): fact is MetadataFact =>
            !!fact &&
            typeof fact === "object" &&
            typeof fact.kind === "string" &&
            typeof fact.value === "string",
        )
      : [];
  } catch {
    return [];
  }
}

export function itemPricesContextFromRecord(item: {
  id: string;
  name: string;
  barcode?: string | null;
  metadataId?: string | null;
  metadataRefreshStartedAt?: Date | string | null;
  metadata?: {
    title?: string | null;
    aliases?: string | null;
    facts?: string | null;
    releaseDate?: string | null;
  } | null;
  shelf: { type: string; name: string };
}): ItemPricesContext {
  const metadataFacts = parseMetadataFacts(item.metadata?.facts);
  const externalIds = externalIdsFromStoredSources({ facts: metadataFacts });
  return {
    id: item.id,
    name: item.name,
    barcode: item.barcode,
    metadataId: item.metadataId,
    metadataTitle: item.metadata?.title,
    metadataAliases: item.metadata?.aliases,
    metadataReleaseDate: item.metadata?.releaseDate ?? null,
    metadataPlatformKey:
      resolveGameMetadataPlatform(null, item.shelf.name, item.shelf.type) ??
      null,
    metadataExternalIds:
      Object.keys(externalIds).length > 0 ? externalIds : null,
    metadataFacts,
    metadataRefreshStartedAt: item.metadataRefreshStartedAt,
    shelfType: item.shelf.type,
    shelfName: item.shelf.name,
  };
}

export const EMPTY_LIST_ITEM_PRICES = {
  priceNew: null,
  priceUsed: null,
  priceUsedCIB: null,
  priceLastUpdated: null,
};

export type ListItemPriceFields = {
  priceNew: number | null;
  priceUsed: number | null;
  priceUsedCIB: number | null;
  priceEstimated?: number | null;
  priceLastUpdated: Date | string | null;
};

/** Shelf grid prices: batch cache + metadata fallback (parity with item detail). */
export function shelfGridItemPriceFields(
  context: ItemPricesContext,
  batch: ShelfItemPriceFields | ListItemPriceFields | null | undefined,
): ListItemPriceFields {
  const batchResult: BarcodePricesResult | null = batch
    ? {
        priceNew: batch.priceNew,
        priceUsed: batch.priceUsed,
        priceUsedCIB: batch.priceUsedCIB,
        priceLastUpdated:
          typeof batch.priceLastUpdated === "string"
            ? new Date(batch.priceLastUpdated)
            : batch.priceLastUpdated,
        priceSources: [],
        priceSourceDisplayNames: [],
        isReferencePriceOnly: false,
        priceObservations: [],
      }
    : null;

  const finalized = finalizeItemPrices(
    context,
    withMetadataPriceFallback(
      context,
      alignPricesForContext(context, batchResult),
    ),
  );

  if (!finalized) return { ...EMPTY_LIST_ITEM_PRICES };

  return {
    priceNew: finalized.priceNew,
    priceUsed: finalized.priceUsed,
    priceUsedCIB: finalized.priceUsedCIB,
    priceEstimated: finalized.priceEstimated ?? null,
    priceLastUpdated: finalized.priceLastUpdated,
  };
}

export function itemPricesContextFromPresentedShelfItem(
  item: {
    id: string;
    name: string;
    barcode?: string | null;
    metadataId?: string | null;
    metadataRefreshStartedAt?: Date | string | null;
    metadata?: MetadataResult | null;
  },
  shelf: { type: string; name: string },
): ItemPricesContext {
  const aliases = item.metadata?.aliases;
  const metadataFacts = item.metadata?.facts ?? [];
  const fromResult = item.metadata?.externalIds ?? {};
  const fromFacts = externalIdsFromStoredSources({ facts: metadataFacts });
  const externalIds = { ...fromFacts, ...fromResult };
  const metadataBarcode = item.metadata?.barcode
    ? cleanCode(item.metadata.barcode)
    : "";
  const itemBarcode = item.barcode ? cleanCode(item.barcode) : "";
  const metadataBarcodes =
    metadataBarcode && metadataBarcode !== itemBarcode
      ? [metadataBarcode]
      : null;

  return {
    id: item.id,
    name: item.name,
    barcode: item.barcode,
    metadataId: item.metadataId,
    metadataTitle: item.metadata?.title,
    metadataAliases: aliases?.length ? JSON.stringify(aliases) : null,
    metadataReleaseDate: item.metadata?.releaseDate ?? null,
    metadataPlatformKey:
      item.metadata?.platformKey ??
      resolveGameMetadataPlatform(null, shelf.name, shelf.type) ??
      null,
    metadataExternalIds:
      Object.keys(externalIds).length > 0 ? externalIds : null,
    metadataBarcodes,
    metadataFacts,
    metadataRefreshStartedAt: item.metadataRefreshStartedAt,
    shelfType: shelf.type,
    shelfName: shelf.name,
  };
}

type ListItemPriceRecord = {
  id: string;
  barcode?: string | null;
  name: string;
  metadataId?: string | null;
  metadata?: {
    title?: string | null;
    aliases?: string | string[] | null;
  } | null;
  shelf: { type: string; name: string };
};

/**
 * Batch price summaries for cross-shelf item grids (items page, home recents).
 * Read-only: do not enqueue price refreshes here — a full collection load can
 * be 1k+ rows and would flood the worker / external scrapers (and stall Next).
 * Item detail still schedules via {@link readItemPrices}.
 */
export async function summarizeListItemPrices(
  items: ListItemPriceRecord[],
): Promise<Map<string, ListItemPriceFields>> {
  if (items.length === 0) return new Map();

  const byShelf = new Map<
    string,
    {
      shelfType: string;
      shelfName: string;
      items: Array<{
        id: string;
        barcode?: string | null;
        name?: string | null;
        metadataTitle?: string | null;
        aliases?: string[] | null;
      }>;
    }
  >();
  for (const item of items) {
    const key = `${item.shelf.type}\0${item.shelf.name}`;
    const group = byShelf.get(key) ?? {
      shelfType: item.shelf.type,
      shelfName: item.shelf.name,
      items: [],
    };
    const aliases = Array.isArray(item.metadata?.aliases)
      ? item.metadata.aliases
      : parseMetadataAliases(
          typeof item.metadata?.aliases === "string"
            ? item.metadata.aliases
            : null,
        );
    group.items.push({
      id: item.id,
      barcode: item.barcode,
      name: item.name,
      metadataTitle: item.metadata?.title ?? null,
      aliases,
    });
    byShelf.set(key, group);
  }

  const priceByItemId = new Map<string, ListItemPriceFields>();
  for (const { shelfType, shelfName, items: group } of byShelf.values()) {
    const prices = await summarizeShelfItemPrices(shelfType, group, shelfName);
    for (const [id, fields] of prices) {
      priceByItemId.set(id, fields);
    }
  }

  return priceByItemId;
}

// ── coalesced from src/core/commerce/pricing/metadataPriceFallback.ts ──
function parseEuroCents(value?: string | null): number | null {
  if (!value?.trim()) return null;
  const match = value.match(/([0-9]+(?:[.,][0-9]{1,2})?)/);
  if (!match) return null;
  const amount = Number.parseFloat(match[1].replace(",", "."));
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return Math.round(amount * 100);
}

function factConditionBucket(fact: MetadataFact): "new" | "used" | null {
  if (fact.kind === "observed-price") return "new";

  const label = `${fact.label ?? ""} ${fact.value ?? ""}`.toLowerCase();
  if (/\b(neuf|new)\b/.test(label)) return "new";
  if (/\b(occasion|used|marketplace)\b/.test(label)) return "used";
  if (fact.kind === "price") return "used";
  return null;
}

function minCents(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.min(...values);
}

export function priceSummaryFromMetadataFacts(
  facts: MetadataFact[] | undefined,
): Pick<BarcodePricesResult, "priceNew" | "priceUsed" | "priceUsedCIB"> | null {
  if (!facts?.length) return null;

  const newPrices: number[] = [];
  const usedPrices: number[] = [];

  for (const fact of facts) {
    if (
      fact.kind !== "price" &&
      fact.kind !== "observed-price" &&
      fact.kind !== "estimated-value"
    ) {
      continue;
    }

    const cents = parseEuroCents(fact.value);
    if (cents == null) continue;
    if (/\s+à\s+/i.test(fact.value)) continue;
    if (/^estimation$/i.test((fact.label ?? "").trim())) continue;

    const bucket = factConditionBucket(fact);
    if (bucket === "new") newPrices.push(cents);
    if (bucket === "used") usedPrices.push(cents);
  }

  const priceNew = minCents(newPrices);
  const priceUsed = minCents(usedPrices);

  if (priceNew == null && priceUsed == null) return null;

  return {
    priceNew,
    priceUsed,
    priceUsedCIB: null,
  };
}

export function metadataPriceFallback(
  facts: MetadataFact[] | undefined,
): BarcodePricesResult | null {
  const summary = priceSummaryFromMetadataFacts(facts);
  if (!summary) return null;

  return {
    ...summary,
    priceLastUpdated: null,
    priceSources: [],
    priceSourceDisplayNames: [],
    isReferencePriceOnly: false,
    priceObservations: [],
  };
}
