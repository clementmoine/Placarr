import type { QueryClient, QueryKey } from "@tanstack/react-query";
import type { Item, Shelf } from "@prisma/client";

import {
  itemMatchesSearchQuery,
  itemSearchHaystacks,
} from "@/lib/item/search";

type ItemPatch = Partial<Item> & {
  id: Item["id"];
  shelf?: { id?: Shelf["id"] | null } | null;
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
  return items.some(
    (entry) => isRecord(entry) && entry.id === itemId,
  );
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
    const shelfId = queryKey[1];
    const targetShelfId = shelfIdForPatch(patch);
    if (typeof shelfId !== "string" || shelfId !== targetShelfId) return false;
    return itemMatchesSearch(patch, querySearchTerm(queryKey));
  }
  return false;
}

function bumpShelfItemCount(record: Record<string, unknown>): Record<string, unknown> {
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
      shouldInsertItemIntoQuery(queryKey, patch, options) &&
      !itemExistsInList(record.items, patch.id)
    ) {
      next = {
        ...(next ?? record),
        items: [patch as Record<string, unknown>, ...record.items],
      };
    } else {
      const patchedItems = patchItemInData(record.items, patch, queryKey, options);
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
  const matches =
    record.shelfId === patch.id || nestedShelf?.id === patch.id;
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

export function patchCachedShelf(
  queryClient: QueryClient,
  shelf: ShelfPatch,
) {
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
    ...uniqueShelfIds.flatMap((shelfId) => [
      queryClient.invalidateQueries({ queryKey: ["shelf", shelfId] }),
      queryClient.invalidateQueries({
        queryKey: ["shelf", shelfId, "items", itemId],
      }),
      queryClient.invalidateQueries({
        queryKey: ["shelf", shelfId, "items", itemId, "prices"],
      }),
    ]),
  ]);
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
}
