import type { Type } from "@/generated/prisma/browser";

import { prisma } from "@/lib/db/prisma";
import {
  stampItemMetadataRefresh,
  type ItemMetadataRefreshSession,
} from "@/core/collect/jobs/metadataRefreshSession";
import {
  BACKGROUND_WORK_KIND,
  enqueueBackgroundWorkJob,
  type MetadataRefreshJobPayload,
} from "@/core/collect/jobs/workQueue";

export type ScheduleItemMetadataRefreshInput = {
  itemId: string;
  lookupQuery: string;
  shelfType: Type;
  barcode?: string | null;
  shelfName: string;
  clearRemoteCover?: boolean;
  bypassMetadataCache?: boolean;
  forceRefresh?: boolean;
  userId?: string | null;
};

export type BatchMetadataRefreshItem = {
  itemId: string;
  lookupQuery: string;
  barcode?: string | null;
};

export function shelfMoveMetadataResetData(
  item: {
    imageUrl: string | null;
    backgroundImageUrl: string | null;
  },
  incoming: Record<string, unknown> = {},
): {
  metadataId: null;
  imageUrl?: null;
  backgroundImageUrl?: null;
} {
  const patch: {
    metadataId: null;
    imageUrl?: null;
    backgroundImageUrl?: null;
  } = { metadataId: null };

  if (!("imageUrl" in incoming) && item.imageUrl?.startsWith("http")) {
    patch.imageUrl = null;
  }
  if (
    !("backgroundImageUrl" in incoming) &&
    item.backgroundImageUrl?.startsWith("http")
  ) {
    patch.backgroundImageUrl = null;
  }

  return patch;
}

async function resolveUserIdForItem(
  itemId: string,
  explicit?: string | null,
): Promise<string | null> {
  if (explicit) return explicit;
  const item = await prisma.item.findUnique({
    where: { id: itemId },
    select: { userId: true },
  });
  return item?.userId ?? null;
}

function toMetadataRefreshPayload(
  input: ScheduleItemMetadataRefreshInput,
  generation: number,
): MetadataRefreshJobPayload {
  return {
    itemId: input.itemId,
    lookupQuery: input.lookupQuery,
    shelfType: input.shelfType,
    shelfName: input.shelfName,
    barcode: input.barcode,
    clearRemoteCover: input.clearRemoteCover,
    bypassMetadataCache: input.bypassMetadataCache,
    forceRefresh: input.forceRefresh,
    generation,
  };
}

/** Enqueue for the out-of-process worker — never runs enrich inside Next. */
export async function enqueueItemMetadataRefresh(
  input: ScheduleItemMetadataRefreshInput,
  session: Pick<ItemMetadataRefreshSession, "generation">,
): Promise<void> {
  const userId = await resolveUserIdForItem(input.itemId, input.userId);
  await enqueueBackgroundWorkJob({
    kind: BACKGROUND_WORK_KIND.metadataRefresh,
    itemId: input.itemId,
    userId,
    replaceOpenForItem: true,
    payload: toMetadataRefreshPayload(input, session.generation),
  });
}

/**
 * Enqueue after the caller stamped `metadataRefreshStartedAt`.
 * Prefer `startItemMetadataRefresh` / awaited enqueue from request handlers.
 */
export function scheduleItemMetadataRefresh(
  input: ScheduleItemMetadataRefreshInput,
  session: Pick<ItemMetadataRefreshSession, "generation">,
): void {
  void enqueueItemMetadataRefresh(input, session).catch((error) => {
    console.error(
      `[MetadataRefresh] Failed to enqueue refresh for ${input.itemId}:`,
      error,
    );
  });
}

/** Plex-style : chaque item est stampé puis enfilé (génération toujours neuve). */
export function scheduleBatchItemMetadataRefresh(
  items: BatchMetadataRefreshItem[],
  shelf: { type: Type; name: string },
): void {
  if (items.length === 0) return;

  void (async () => {
    for (const next of items) {
      try {
        const existing = await prisma.item.findUnique({
          where: { id: next.itemId },
          select: { userId: true },
        });
        // Always stamp: reusing a generation lets a superseded worker finish()
        // clear the flag of the replacement job.
        const session = await stampItemMetadataRefresh(next.itemId);
        await enqueueItemMetadataRefresh(
          {
            itemId: next.itemId,
            lookupQuery: next.lookupQuery,
            barcode: next.barcode,
            shelfType: shelf.type,
            shelfName: shelf.name,
            bypassMetadataCache: false,
            forceRefresh: true,
            userId: existing?.userId,
          },
          session,
        );
      } catch (error) {
        console.error(
          `[MetadataRefresh] Failed to enqueue batch refresh for ${next.itemId}:`,
          error,
        );
      }
    }
  })();
}

export async function startItemMetadataRefresh(
  input: ScheduleItemMetadataRefreshInput,
): Promise<{ startedAt: Date; generation: number }> {
  const session = await stampItemMetadataRefresh(input.itemId);
  try {
    await enqueueItemMetadataRefresh(input, session);
  } catch (error) {
    await prisma.item.updateMany({
      where: {
        id: input.itemId,
        metadataRefreshGeneration: session.generation,
      },
      data: { metadataRefreshStartedAt: null },
    });
    throw error;
  }
  return { startedAt: session.startedAt, generation: session.generation };
}
