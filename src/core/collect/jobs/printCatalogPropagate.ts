/**
 * After a corpus Sync densifies prints, fan-out soft metadata refresh to shelf
 * items that share those `printKey` games — without clearing user crops/covers.
 *
 * P1 backlog: re-sync item via printKey when the catalogue advances.
 */
import type { Type } from "@/generated/prisma/browser";

import { getCatalogProviderModule } from "@/core/catalog/catalog";
import {
  enqueueItemMetadataRefresh,
  type BatchMetadataRefreshItem,
} from "@/core/collect/jobs/scheduleMetadataRefresh";
import { stampItemMetadataRefresh } from "@/core/collect/jobs/metadataRefreshSession";
import { prisma } from "@/lib/db/prisma";

/** Soft cap so a huge Sync cannot stampede the worker. */
export const PRINT_CATALOG_PROPAGATE_LIMIT = 500;

export function printKeyPrefixesForProvider(
  providerId: string,
): readonly string[] {
  const mdl = getCatalogProviderModule(providerId);
  const games = mdl?.printGames ?? [];
  return games
    .map((game) => game.trim().toLowerCase())
    .filter(Boolean)
    .map((game) => `${game}:`);
}

/**
 * Enqueue soft metadata refresh for shelf items whose printKey belongs to the
 * synced catalogue's print games. Returns how many items were enqueued.
 */
export async function enqueuePrintCatalogPropagate(input: {
  providerId: string;
  limit?: number;
}): Promise<number> {
  const prefixes = printKeyPrefixesForProvider(input.providerId);
  if (prefixes.length === 0) return 0;
  const limit = Math.max(
    1,
    Math.min(input.limit ?? PRINT_CATALOG_PROPAGATE_LIMIT, 2000),
  );

  const or = prefixes.map((prefix) => ({
    printKey: { startsWith: prefix },
  }));

  const items = await prisma.item.findMany({
    where: {
      OR: or,
      printKey: { not: null },
    },
    select: {
      id: true,
      name: true,
      barcode: true,
      userId: true,
      shelf: { select: { type: true, name: true } },
    },
    orderBy: { updatedAt: "asc" },
    take: limit,
  });

  if (items.length === 0) return 0;

  const byShelf = new Map<
    string,
    { shelf: { type: Type; name: string }; rows: BatchMetadataRefreshItem[] }
  >();
  for (const item of items) {
    const key = `${item.shelf.type}|${item.shelf.name}`;
    let bucket = byShelf.get(key);
    if (!bucket) {
      bucket = {
        shelf: { type: item.shelf.type, name: item.shelf.name },
        rows: [],
      };
      byShelf.set(key, bucket);
    }
    bucket.rows.push({
      itemId: item.id,
      lookupQuery: item.name,
      barcode: item.barcode,
    });
  }

  let enqueued = 0;
  for (const bucket of byShelf.values()) {
    for (const next of bucket.rows) {
      try {
        const existing = await prisma.item.findUnique({
          where: { id: next.itemId },
          select: { userId: true },
        });
        const session = await stampItemMetadataRefresh(next.itemId);
        await enqueueItemMetadataRefresh(
          {
            itemId: next.itemId,
            lookupQuery: next.lookupQuery,
            barcode: next.barcode,
            shelfType: bucket.shelf.type,
            shelfName: bucket.shelf.name,
            // Soft: densify from corpus — never clear user crops / remote pin.
            clearRemoteCover: false,
            bypassMetadataCache: false,
            forceRefresh: false,
            userId: existing?.userId,
          },
          session,
        );
        enqueued += 1;
      } catch (error) {
        console.error(
          `[printCatalogPropagate] failed for ${next.itemId}:`,
          error,
        );
      }
    }
  }
  return enqueued;
}
