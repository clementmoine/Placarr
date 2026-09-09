import type { QueryClient, QueryKey } from "@tanstack/react-query";
import type { Item, Shelf } from "@/generated/prisma/browser";

import {
  itemMatchesSearchQuery,
  itemSearchHaystacks,
} from "@/core/collect/search";
import { METADATA_REFRESH_STAMP_PRESERVE_MS } from "@/core/collect/enrichment";
import { upsertBackgroundJobInCache } from "@/lib/api/backgroundJobs";

type ItemPatch = Partial<
  Omit<
    Item,
    "metadataRefreshStartedAt" | "createdAt" | "updatedAt" | "priceLastUpdated"
  >
> & {
  id: Item["id"];
  /** ISO strings from JSON caches are fine — Prisma model uses Date. */
  metadataRefreshStartedAt?: Date | string | null;
  createdAt?: Date | string;
  updatedAt?: Date | string;
  priceLastUpdated?: Date | string | null;
  shelf?: { id?: Shelf["id"] | null; slug?: string | null } | null;
  metadata?: {
    title?: string | null;
    aliases?: string[] | string | null;
    sourceQuery?: string | null;
    facts?: Array<{ kind?: string; value?: string | null }> | string | null;
    authors?: Array<{ name?: string | null }> | null;
  } | null;
  [key: string]: unknown;
};

type PatchCachedItemOptions = {
  isCreate?: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function mergeItemData(existing: Record<string, unknown>, patch: ItemPatch) {
  return {
    ...existing,
    ...patch,
    shelf: patch.shelf === undefined ? existing.shelf : patch.shelf,
    metadata: patch.metadata === undefined ? existing.metadata : patch.metadata,
  };
}

function shelfIdForPatch(patch: ItemPatch): string | null {
  return patch.shelfId ?? patch.shelf?.id ?? null;
}

function isItemArray(data: unknown[]): boolean {
  if (data.length === 0) return true;
  const first = data[0];
  return isRecord(first) && typeof first.id === "string" && "shelfId" in first;
}

function itemExistsInList(items: unknown[], itemId: string): boolean {
  return items.some((entry) => isRecord(entry) && entry.id === itemId);
}

function querySearchTerm(queryKey: QueryKey): string {
  const root = queryKey[0];
  if (root === "shelf") {
    return typeof queryKey[2] === "string" ? queryKey[2] : "";
  }
  if (root === "shelves" || root === "searchItems") {
    return typeof queryKey[1] === "string" ? queryKey[1] : "";
  }
  return "";
}

function itemMatchesSearch(patch: ItemPatch, search: string): boolean {
  if (!search.trim()) return true;
  return itemMatchesSearchQuery(itemSearchHaystacks(patch), search);
}

function shouldInsertItemIntoQuery(
  queryKey: QueryKey,
  patch: ItemPatch,
  options: PatchCachedItemOptions,
): boolean {
  if (!options.isCreate) return false;

  const root = queryKey[0];
  if (root === "recentItems") return true;
  if (root === "searchItems") {
    return itemMatchesSearch(patch, querySearchTerm(queryKey));
  }
  if (root === "shelf") {
    const shelfKey = queryKey[1];
    if (typeof shelfKey !== "string") return false;
    // queryKey[1] is often the URL slug; patch.shelfId is the cuid. Match either.
    if (!shelfKeyMatchesPatch(shelfKey, patch)) return false;
    return itemMatchesSearch(patch, querySearchTerm(queryKey));
  }
  return false;
}

/** URL shelf segment may be cuid, persisted slug, or slugify(name). */
function shelfKeyMatchesPatch(shelfKey: string, patch: ItemPatch): boolean {
  const targetShelfId = shelfIdForPatch(patch);
  if (shelfKey === targetShelfId) return true;
  const shelf = isRecord(patch.shelf) ? patch.shelf : null;
  if (!shelf) return false;
  if (typeof shelf.id === "string" && shelfKey === shelf.id) return true;
  if (typeof shelf.slug === "string" && shelfKey === shelf.slug) return true;
  return false;
}

/**
 * Insert into a shelf detail payload when the cached shelf cuid matches the
 * item — even if the React Query key used the URL slug.
 */
function shouldInsertItemIntoShelfRecord(
  queryKey: QueryKey,
  patch: ItemPatch,
  options: PatchCachedItemOptions,
  shelfRecordId: string,
): boolean {
  if (!options.isCreate) return false;
  const targetShelfId = shelfIdForPatch(patch);
  if (!targetShelfId || shelfRecordId !== targetShelfId) return false;
  return itemMatchesSearch(patch, querySearchTerm(queryKey));
}

function bumpShelfItemCount(
  record: Record<string, unknown>,
): Record<string, unknown> {
  const count = record._count;
  if (!isRecord(count) || typeof count.items !== "number") {
    return record;
  }
  return {
    ...record,
    _count: {
      ...count,
      items: count.items + 1,
    },
  };
}

function patchItemInData<T>(
  data: T,
  patch: ItemPatch,
  queryKey: QueryKey,
  options: PatchCachedItemOptions,
): T {
  if (!data) return data;

  if (Array.isArray(data)) {
    if (
      isItemArray(data) &&
      shouldInsertItemIntoQuery(queryKey, patch, options) &&
      !itemExistsInList(data, patch.id)
    ) {
      return [patch as Record<string, unknown>, ...data] as T;
    }

    let changed = false;
    const next = data.map((entry) => {
      const patched = patchItemInData(entry, patch, queryKey, options);
      if (patched !== entry) changed = true;
      return patched;
    });
    return (changed ? next : data) as T;
  }

  if (!isRecord(data)) return data;

  const record = data as Record<string, unknown>;
  let next: Record<string, unknown> | null = null;
  const targetShelfId = shelfIdForPatch(patch);

  if (record.id === patch.id) {
    next = mergeItemData(record, patch);
  }

  if (
    Array.isArray(record.items) &&
    targetShelfId &&
    record.id === targetShelfId
  ) {
    if (
      shouldInsertItemIntoShelfRecord(
        queryKey,
        patch,
        options,
        String(record.id),
      ) &&
      !itemExistsInList(record.items, patch.id)
    ) {
      next = {
        ...(next ?? record),
        items: [patch as Record<string, unknown>, ...record.items],
      };
    } else {
      const patchedItems = patchItemInData(
        record.items,
        patch,
        queryKey,
        options,
      );
      if (patchedItems !== record.items) {
        next = { ...(next ?? record), items: patchedItems };
      }
    }
  }

  if (
    options.isCreate &&
    queryKey[0] === "shelves" &&
    targetShelfId &&
    record.id === targetShelfId &&
    !Array.isArray(record.items)
  ) {
    next = bumpShelfItemCount(next ?? record);
  }

  return (next ?? record) as T;
}

function compactShelfIds(values: Array<string | null | undefined>): string[] {
  return Array.from(
    new Set(values.filter((value): value is string => Boolean(value))),
  );
}

type ShelfPatch = Partial<Shelf> & { id: Shelf["id"] };

const SHELF_QUERY_ROOTS = new Set([
  "shelf",
  "shelves",
  "recentItems",
  "searchItems",
  "collectionItems",
]);

function shouldPatchShelfQuery(queryKey: QueryKey): boolean {
  return SHELF_QUERY_ROOTS.has(String(queryKey[0]));
}

function shelfFieldsOnly(patch: ShelfPatch): ShelfPatch {
  const { items: _items, ...fields } = patch as ShelfPatch & {
    items?: unknown;
  };
  return fields;
}

function isShelfListEntry(record: Record<string, unknown>): boolean {
  return !("shelfId" in record);
}

function patchShelfOnItem(
  record: Record<string, unknown>,
  patch: ShelfPatch,
): Record<string, unknown> | null {
  const nestedShelf = isRecord(record.shelf) ? record.shelf : null;
  const matches = record.shelfId === patch.id || nestedShelf?.id === patch.id;
  if (!matches) return null;

  return {
    ...record,
    shelf: nestedShelf ? { ...nestedShelf, ...patch } : record.shelf,
  };
}

function patchShelfInData<T>(data: T, patch: ShelfPatch): T {
  if (!data) return data;

  if (Array.isArray(data)) {
    if (data.length === 0) return data;

    let changed = false;
    const next = data.map((entry) => {
      if (!isRecord(entry)) return entry;

      if (entry.id === patch.id && isShelfListEntry(entry)) {
        changed = true;
        return { ...entry, ...patch };
      }

      const patchedItem = patchShelfOnItem(entry, patch);
      if (patchedItem) {
        changed = true;
        return patchedItem;
      }

      return entry;
    });

    return (changed ? next : data) as T;
  }

  if (!isRecord(data)) return data;

  const record = data as Record<string, unknown>;

  if (record.id === patch.id && Array.isArray(record.items)) {
    return { ...record, ...patch, items: record.items } as T;
  }

  if (record.id === patch.id) {
    return { ...record, ...patch } as T;
  }

  const patchedItem = patchShelfOnItem(record, patch);
  if (patchedItem) return patchedItem as T;

  return data;
}

export function patchCachedShelf(queryClient: QueryClient, shelf: ShelfPatch) {
  const patch = shelfFieldsOnly(shelf);

  for (const query of queryClient.getQueryCache().findAll({
    predicate: (entry) => shouldPatchShelfQuery(entry.queryKey),
  })) {
    queryClient.setQueryData(query.queryKey, (oldData) =>
      patchShelfInData(oldData, patch),
    );
  }
}

export async function syncShelfQueries(
  queryClient: QueryClient,
  shelf: ShelfPatch,
) {
  patchCachedShelf(queryClient, shelf);
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["shelf", shelf.id] }),
    queryClient.invalidateQueries({ queryKey: ["shelves"] }),
  ]);
}

function shouldPatchQuery(queryKey: QueryKey) {
  const root = queryKey[0];
  return (
    root === "item" ||
    root === "shelf" ||
    root === "shelves" ||
    root === "recentItems" ||
    root === "searchItems"
  );
}

export function patchCachedItem(
  queryClient: QueryClient,
  item: ItemPatch,
  options: PatchCachedItemOptions = {},
) {
  for (const query of queryClient.getQueryCache().findAll({
    predicate: (entry) => shouldPatchQuery(entry.queryKey),
  })) {
    queryClient.setQueryData(query.queryKey, (oldData) =>
      patchItemInData(oldData, item, query.queryKey, options),
    );
  }
}

export async function invalidateItemQueries(
  queryClient: QueryClient,
  itemId: Item["id"],
  shelfIds: Array<Shelf["id"] | null | undefined> = [],
) {
  const uniqueShelfIds = compactShelfIds(shelfIds);

  await Promise.all([
    queryClient.invalidateQueries({
      predicate: (query) => query.queryKey.includes(itemId),
    }),
    queryClient.invalidateQueries({ queryKey: ["shelves"] }),
    queryClient.invalidateQueries({ queryKey: ["recentItems"] }),
    queryClient.invalidateQueries({ queryKey: ["searchItems"] }),
    queryClient.invalidateQueries({ queryKey: ["collectionItems"] }),
    invalidateShelfQueries(queryClient, uniqueShelfIds),
    ...uniqueShelfIds.flatMap((shelfId) => [
      queryClient.invalidateQueries({
        queryKey: ["shelf", shelfId, "items", itemId],
      }),
      queryClient.invalidateQueries({
        queryKey: ["shelf", shelfId, "items", itemId, "prices"],
      }),
    ]),
  ]);
}

/**
 * Shelf pages key queries by URL slug (`["shelf", "consoles", q]`), while APIs
 * return cuids. Invalidate by matching the key *or* the cached shelf id/slug.
 */
export function invalidateShelfQueries(
  queryClient: QueryClient,
  shelfIds: Array<Shelf["id"] | null | undefined> = [],
) {
  const uniqueShelfIds = compactShelfIds(shelfIds);
  if (uniqueShelfIds.length === 0) {
    return queryClient.invalidateQueries({ queryKey: ["shelf"] });
  }

  return queryClient.invalidateQueries({
    predicate: (query) => {
      if (query.queryKey[0] !== "shelf") return false;
      const key = query.queryKey[1];
      if (typeof key === "string" && uniqueShelfIds.includes(key)) {
        return true;
      }
      const data = query.state.data;
      if (!isRecord(data)) return false;
      if (typeof data.id === "string" && uniqueShelfIds.includes(data.id)) {
        return true;
      }
      if (typeof data.slug === "string" && uniqueShelfIds.includes(data.slug)) {
        return true;
      }
      return false;
    },
  });
}

export async function refetchItemQueries(
  queryClient: QueryClient,
  itemId: Item["id"],
  shelfIds: Array<Shelf["id"] | null | undefined> = [],
) {
  const uniqueShelfIds = compactShelfIds(shelfIds);
  await invalidateItemQueries(queryClient, itemId, shelfIds);
  await Promise.all([
    queryClient.refetchQueries({ queryKey: ["item", itemId] }),
    ...uniqueShelfIds.map((shelfId) =>
      queryClient.refetchQueries({
        queryKey: ["shelf", shelfId, "items", itemId],
      }),
    ),
  ]);
}

export async function syncItemQueries(
  queryClient: QueryClient,
  item: ItemPatch,
  shelfIds: Array<Shelf["id"] | null | undefined> = [],
  options: PatchCachedItemOptions = {},
) {
  patchCachedItem(queryClient, item, options);
  await invalidateItemQueries(queryClient, item.id, [
    item.shelfId,
    item.shelf?.id,
    ...shelfIds,
  ]);

  // Create (async enrich) or manual refresh: surface the header job list now,
  // don't wait for the idle poll that only runs once count > 0.
  if (options.isCreate || item.metadataRefreshStartedAt) {
    const shelf = item.shelf as
      | {
          id?: string | null;
          name?: string | null;
          slug?: string | null;
          type?: string | null;
        }
      | null
      | undefined;
    const shelfId = shelf?.id ?? item.shelfId ?? null;
    if (
      typeof item.name === "string" &&
      shelfId &&
      shelf?.name &&
      shelf?.type
    ) {
      upsertBackgroundJobInCache(queryClient, {
        id: item.id,
        name: item.name,
        slug: typeof item.slug === "string" ? item.slug : "",
        kind: item.metadataRefreshStartedAt
          ? "metadataRefresh"
          : "metadataEnrich",
        startedAt: item.metadataRefreshStartedAt
          ? new Date(
              item.metadataRefreshStartedAt as string | Date,
            ).toISOString()
          : new Date(
              (item.createdAt as string | Date | undefined) ?? Date.now(),
            ).toISOString(),
        cancellable: Boolean(item.metadataRefreshStartedAt),
        shelf: {
          id: shelfId,
          name: shelf.name,
          slug: shelf.slug ?? "",
          type: shelf.type,
        },
      });
    }
    void queryClient.invalidateQueries({ queryKey: ["backgroundJobs"] });
  }
}

/**
 * Shelf/list API payloads include cover attachments only (not full galleries).
 * When an item already has persisted metadata, treat shelf-cache snapshots as
 * incomplete for gallery UI until `/api/items?id=…` refetches.
 */
export function shelfListItemMissingAttachments(
  item:
    | {
        metadataId?: string | null;
        metadata?: { attachments?: unknown[] | null } | null;
      }
    | null
    | undefined,
): boolean {
  if (!item?.metadataId) return false;
  return (item.metadata?.attachments?.length ?? 0) === 0;
}

/**
 * Drop client-side refresh stamps for items that are no longer in the live
 * background-jobs list (DB flag already cleared). Skips stamps still inside the
 * optimistic race window so a concurrent GET cannot wipe a just-started refresh.
 */
export function clearFinishedMetadataRefreshStamps(
  queryClient: QueryClient,
  activeJobItemIds: ReadonlySet<string>,
) {
  const clearIfFinished = <T extends Record<string, unknown>>(entry: T): T => {
    const itemId = entry.id;
    const stamp = entry.metadataRefreshStartedAt;
    if (typeof itemId !== "string" || !stamp) return entry;
    if (activeJobItemIds.has(itemId)) return entry;
    const started = new Date(stamp as string | Date).getTime();
    if (
      !Number.isNaN(started) &&
      Date.now() - started < METADATA_REFRESH_STAMP_PRESERVE_MS
    ) {
      return entry;
    }
    return { ...entry, metadataRefreshStartedAt: null };
  };

  queryClient.setQueriesData(
    {
      predicate: (query) =>
        query.queryKey[0] === "shelf" && query.queryKey[2] === "items",
    },
    (current) => {
      if (!isRecord(current) || typeof current.id !== "string") return current;
      return clearIfFinished(current);
    },
  );

  queryClient.setQueriesData({ queryKey: ["item"] }, (current) => {
    if (!isRecord(current) || typeof current.id !== "string") return current;
    return clearIfFinished(current);
  });

  queryClient.setQueriesData(
    {
      predicate: (query) =>
        query.queryKey[0] === "shelf" && query.queryKey.length === 2,
    },
    (current) => {
      if (!isRecord(current) || !Array.isArray(current.items)) return current;
      let changed = false;
      const items = current.items.map((entry) => {
        if (!isRecord(entry)) return entry;
        const next = clearIfFinished(entry);
        if (next !== entry) changed = true;
        return next;
      });
      return changed ? { ...current, items } : current;
    },
  );
}
