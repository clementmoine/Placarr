import type { QueryClient, QueryKey } from "@tanstack/react-query";
import type { Item, Shelf } from "@prisma/client";

type ItemPatch = Partial<Item> & {
  id: Item["id"];
  shelf?: { id?: Shelf["id"] | null } | null;
  metadata?: unknown;
  [key: string]: unknown;
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

function patchItemInData<T>(data: T, patch: ItemPatch): T {
  if (!data) return data;

  if (Array.isArray(data)) {
    let changed = false;
    const next = data.map((entry) => {
      const patched = patchItemInData(entry, patch);
      if (patched !== entry) changed = true;
      return patched;
    });
    return (changed ? next : data) as T;
  }

  if (!isRecord(data)) return data;

  const record = data as Record<string, unknown>;
  let next: Record<string, unknown> | null = null;

  if (record.id === patch.id) {
    next = mergeItemData(record, patch);
  }

  if (Array.isArray(record.items)) {
    const patchedItems = patchItemInData(record.items, patch);
    if (patchedItems !== record.items) {
      next = { ...(next ?? record), items: patchedItems };
    }
  }

  return (next ?? record) as T;
}

function compactShelfIds(values: Array<string | null | undefined>): string[] {
  return Array.from(
    new Set(values.filter((value): value is string => Boolean(value))),
  );
}

function shouldPatchQuery(queryKey: QueryKey) {
  const root = queryKey[0];
  return (
    root === "item" ||
    root === "shelf" ||
    root === "shelves" ||
    root === "recentItems"
  );
}

export function patchCachedItem(queryClient: QueryClient, item: ItemPatch) {
  queryClient.setQueriesData(
    { predicate: (query) => shouldPatchQuery(query.queryKey) },
    (oldData) => patchItemInData(oldData, item),
  );
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

export async function syncItemQueries(
  queryClient: QueryClient,
  item: ItemPatch,
  shelfIds: Array<Shelf["id"] | null | undefined> = [],
) {
  patchCachedItem(queryClient, item);
  await invalidateItemQueries(queryClient, item.id, [
    item.shelfId,
    item.shelf?.id,
    ...shelfIds,
  ]);
}
