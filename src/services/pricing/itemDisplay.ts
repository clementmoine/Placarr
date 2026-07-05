import { after } from "next/server";

import { runBackgroundWork } from "@/lib/jobs/backgroundWorkQueue";
import { cleanCode } from "@/lib/barcode/query";
import { isItemMetadataRefreshing } from "@/lib/item/enrichment";
import { shouldRefreshPriceCache } from "@/lib/pricing/cachePolicy";
import { providerProductUrlsFromMetadataFacts } from "@/services/provider/registry";
import { metadataPriceFallback } from "@/lib/pricing/metadataPriceFallback";
import type { MetadataFact } from "@/types/metadataProvider";
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
} from "@/services/pricing/resolver";
import { repairProviderExternalLinksForItem } from "@/services/metadata/persistProviderExternalLinks";

export type ItemPricesContext = {
  id: string;
  barcode?: string | null;
  name: string;
  metadataId?: string | null;
  metadataTitle?: string | null;
  metadataAliases?: string | null;
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

/** Item + metadata title only — avoids alias noise when validating price listings. */
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
): RefreshBarcodePricesInput {
  const itemNames = primaryItemNamesFromContext(context);
  return {
    cleanedBarcode,
    shelfType: context.shelfType,
    shelfName: context.shelfName,
    primaryName: context.name,
    extraNames: itemNames.filter((name) => name !== context.name),
    providerProductUrls: priceRefreshProviderProductUrls(context),
  };
}

function refreshItemInput(context: ItemPricesContext): RefreshItemPricesInput {
  const itemNames = primaryItemNamesFromContext(context);
  return {
    shelfType: context.shelfType,
    shelfName: context.shelfName,
    primaryName: context.name,
    extraNames: itemNames.filter((name) => name !== context.name),
    itemId: context.id,
    metadataId: context.metadataId,
    providerProductUrls: priceRefreshProviderProductUrls(context),
  };
}

function alignPricesForContext(
  context: ItemPricesContext,
  prices: BarcodePricesResult | null,
): BarcodePricesResult | null {
  if (!prices) return null;
  return alignBarcodePricesForItemNames(
    context.shelfType,
    primaryItemNamesFromContext(context),
    prices,
    context.shelfName,
  );
}

async function readCachedItemPrices(
  context: ItemPricesContext,
  options: { summaryOnly?: boolean } = {},
): Promise<BarcodePricesResult | null> {
  const cleanedBarcode = context.barcode ? cleanCode(context.barcode) : "";
  if (!cleanedBarcode) {
    if (options.summaryOnly) return null;
    return getCachedItemPrices(context.shelfType, {
      itemId: context.id,
      metadataId: context.metadataId,
      itemNames: primaryItemNamesFromContext(context),
      shelfName: context.shelfName,
    });
  }

  return getCachedBarcodePrices(cleanedBarcode, context.shelfType, {
    itemId: context.id,
    metadataId: context.metadataId,
    itemNames: primaryItemNamesFromContext(context),
    shelfName: context.shelfName,
    summaryOnly: options.summaryOnly,
  });
}

export async function itemPricesNeedRefresh(
  context: ItemPricesContext,
): Promise<boolean> {
  const cached = await readCachedItemPrices(context);
  if (!cached) return true;
  return shouldRefreshPriceCache(context.shelfType, cached);
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
      return refreshItemPrices(refreshItemInput(context));
    }
    return refreshBarcodePrices(refreshBarcodeInput(context, cleanedBarcode));
  })();

  inFlightPriceRefresh.set(key, promise);
  try {
    return await promise;
  } finally {
    inFlightPriceRefresh.delete(key);
  }
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

  after(() =>
    runBackgroundWork(async () => {
      try {
        await refreshItemPricesFromContext(context);
      } catch (error) {
        console.error(
          `[Prices] Background refresh failed for item ${context.id}:`,
          error,
        );
      } finally {
        scheduledPriceRefreshKeys.delete(key);
      }
    }),
  );
}

export function scheduleItemPricesRefreshBatch(
  contexts: ItemPricesContext[],
  options?: { onlyWhenEmpty?: boolean },
): void {
  if (contexts.length === 0) return;

  after(async () => {
    const needingRefresh: ItemPricesContext[] = [];
    const shouldRefresh = options?.onlyWhenEmpty
      ? itemPricesCacheIsEmpty
      : itemPricesNeedRefresh;

    for (const context of contexts) {
      if (await shouldRefresh(context)) {
        needingRefresh.push(context);
      }
    }
    if (needingRefresh.length === 0) return;

    await Promise.all(
      needingRefresh.map((next) =>
        runBackgroundWork(async () => {
          try {
            await refreshItemPricesFromContext(next);
          } catch (error) {
            console.error(
              `[Prices] Background batch refresh failed for item ${next.id}:`,
              error,
            );
          }
        }),
      ),
    );
  });
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
 * available, refresh in the background when stale, and only block on a cold
 * cache when `blockWhenMissing` is true (detail view).
 */
export async function readItemPrices(
  context: ItemPricesContext,
  options: ReadItemPricesOptions = {},
): Promise<BarcodePricesResult | null> {
  const blockWhenMissing = options.blockWhenMissing ?? true;
  const deferNetwork = shouldDeferPriceRefresh(context);
  const cached = await readCachedItemPrices(context, {
    summaryOnly: deferNetwork,
  });

  if (cached) {
    if (shouldRefreshPriceCache(context.shelfType, cached) && !deferNetwork) {
      scheduleItemPricesRefresh(context);
    }
    return withMetadataPriceFallback(
      context,
      alignPricesForContext(context, cached),
    );
  }

  if (!blockWhenMissing) {
    if (!deferNetwork) {
      scheduleItemPricesRefresh(context);
    }
    return withMetadataPriceFallback(context, null);
  }

  if (deferNetwork) {
    return withMetadataPriceFallback(context, null);
  }

  const fresh = await refreshItemPricesFromContext(context);
  return withMetadataPriceFallback(
    context,
    alignPricesForContext(context, fresh),
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
  } | null;
  shelf: { type: string; name: string };
}): ItemPricesContext {
  return {
    id: item.id,
    name: item.name,
    barcode: item.barcode,
    metadataId: item.metadataId,
    metadataTitle: item.metadata?.title,
    metadataAliases: item.metadata?.aliases,
    metadataFacts: parseMetadataFacts(item.metadata?.facts),
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
  priceLastUpdated: Date | string | null;
};

type ListItemPriceRecord = {
  id: string;
  barcode?: string | null;
  name: string;
  metadataId?: string | null;
  metadata?: { title?: string | null; aliases?: string | null } | null;
  shelf: { type: string; name: string };
};

/** Batch price summaries for cross-shelf item grids (items page, home recents). */
export async function summarizeListItemPrices(
  items: ListItemPriceRecord[],
): Promise<Map<string, ListItemPriceFields>> {
  if (items.length === 0) return new Map();

  scheduleItemPricesRefreshBatch(items.map(itemPricesContextFromRecord), {
    onlyWhenEmpty: true,
  });

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
    group.items.push({
      id: item.id,
      barcode: item.barcode,
      name: item.name,
      metadataTitle: item.metadata?.title ?? null,
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
