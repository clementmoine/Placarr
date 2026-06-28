import { after } from "next/server";

import { cleanCode } from "@/lib/barcode/query";
import { shouldRefreshPriceCache } from "@/lib/pricing/cachePolicy";
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

const PRICE_REFRESH_CONCURRENCY = 4;

export type ItemPricesContext = {
  id: string;
  barcode?: string | null;
  name: string;
  metadataId?: string | null;
  metadataTitle?: string | null;
  metadataAliases?: string | null;
  shelfType: string;
  shelfName: string;
};

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

function refreshBarcodeInput(
  context: ItemPricesContext,
  cleanedBarcode: string,
): RefreshBarcodePricesInput {
  const itemNames = itemNamesFromContext(context);
  return {
    cleanedBarcode,
    shelfType: context.shelfType,
    shelfName: context.shelfName,
    primaryName: context.name,
    extraNames: itemNames.filter((name) => name !== context.name),
  };
}

function refreshItemInput(context: ItemPricesContext): RefreshItemPricesInput {
  const itemNames = itemNamesFromContext(context);
  return {
    shelfType: context.shelfType,
    shelfName: context.shelfName,
    primaryName: context.name,
    extraNames: itemNames.filter((name) => name !== context.name),
    itemId: context.id,
    metadataId: context.metadataId,
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
): Promise<BarcodePricesResult | null> {
  const cleanedBarcode = context.barcode ? cleanCode(context.barcode) : "";
  if (!cleanedBarcode) {
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
): Promise<BarcodePricesResult> {
  const cleanedBarcode = context.barcode ? cleanCode(context.barcode) : "";
  if (!cleanedBarcode) {
    return refreshItemPrices(refreshItemInput(context));
  }
  return refreshBarcodePrices(refreshBarcodeInput(context, cleanedBarcode));
}

export function scheduleItemPricesRefresh(context: ItemPricesContext): void {
  after(async () => {
    try {
      await refreshItemPricesFromContext(context);
    } catch (error) {
      console.error(
        `[Prices] Background refresh failed for item ${context.id}:`,
        error,
      );
    }
  });
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

    const queue = [...needingRefresh];
    const worker = async () => {
      while (queue.length > 0) {
        const next = queue.shift();
        if (!next) return;
        try {
          await refreshItemPricesFromContext(next);
        } catch (error) {
          console.error(
            `[Prices] Background batch refresh failed for item ${next.id}:`,
            error,
          );
        }
      }
    };

    await Promise.all(
      Array.from(
        { length: Math.min(PRICE_REFRESH_CONCURRENCY, needingRefresh.length) },
        () => worker(),
      ),
    );
  });
}

export type ReadItemPricesOptions = {
  /** When false, missing cache returns null and schedules a background refresh. */
  blockWhenMissing?: boolean;
};

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
  const cached = await readCachedItemPrices(context);

  if (cached) {
    if (shouldRefreshPriceCache(context.shelfType, cached)) {
      scheduleItemPricesRefresh(context);
    }
    return alignPricesForContext(context, cached);
  }

  if (!blockWhenMissing) {
    scheduleItemPricesRefresh(context);
    return null;
  }

  const fresh = await refreshItemPricesFromContext(context);
  return alignPricesForContext(context, fresh);
}

export function itemPricesContextFromRecord(item: {
  id: string;
  name: string;
  barcode?: string | null;
  metadataId?: string | null;
  metadata?: { title?: string | null; aliases?: string | null } | null;
  shelf: { type: string; name: string };
}): ItemPricesContext {
  return {
    id: item.id,
    name: item.name,
    barcode: item.barcode,
    metadataId: item.metadataId,
    metadataTitle: item.metadata?.title,
    metadataAliases: item.metadata?.aliases,
    shelfType: item.shelf.type,
    shelfName: item.shelf.name,
  };
}

export const EMPTY_LIST_ITEM_PRICES = {
  priceNew: null,
  priceUsed: null,
  priceUsedCIB: null,
  priceLastUpdated: null,
} as const;

export type ListItemPriceFields = typeof EMPTY_LIST_ITEM_PRICES;

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
