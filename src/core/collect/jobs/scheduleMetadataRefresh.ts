import type { Type } from "@prisma/client";
import { after } from "next/server";
import path from "path";

import { prisma } from "@/lib/db/prisma";
import { runBackgroundWork } from "@/core/collect/jobs/backgroundWorkQueue";
import {
  beginItemMetadataRefresh,
  finishItemMetadataRefresh,
  isAbortError,
  type ItemMetadataRefreshSession,
} from "@/core/collect/jobs/metadataRefreshSession";
import {
  isCoverResolutionAcceptable,
  readFileImageMetrics,
} from "@/core/enrich/media/imageMetrics";
import { fetchAndStoreMetadata } from "@/core/enrich";
import { resolveGameMetadataPlatform } from "@/core/enrich/platform";
import {
  itemPricesContextFromRecord,
  refreshItemPricesFromContext,
} from "@/core/commerce/pricing/itemDisplay";
import { repairProviderExternalLinksForItem } from "@/core/enrich/persistProviderExternalLinks";

export type ScheduleItemMetadataRefreshInput = {
  itemId: string;
  lookupQuery: string;
  shelfType: Type;
  barcode?: string | null;
  shelfName: string;
  clearRemoteCover?: boolean;
  bypassMetadataCache?: boolean;
  forceRefresh?: boolean;
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

async function prepareItemForMetadataRefresh(
  input: ScheduleItemMetadataRefreshInput,
): Promise<void> {
  if (input.clearRemoteCover) {
    const item = await prisma.item.findUnique({
      where: { id: input.itemId },
      select: { imageUrl: true },
    });
    if (item?.imageUrl?.startsWith("http")) {
      await prisma.item.update({
        where: { id: input.itemId },
        data: { imageUrl: null },
      });
    }
  }

  const itemForCoverReset = await prisma.item.findUnique({
    where: { id: input.itemId },
    select: { imageUrl: true },
  });
  if (itemForCoverReset?.imageUrl?.startsWith("/uploads/")) {
    const metrics = await readFileImageMetrics(
      path.join(process.cwd(), "public", itemForCoverReset.imageUrl),
    );
    if (!isCoverResolutionAcceptable(metrics)) {
      await prisma.item.update({
        where: { id: input.itemId },
        data: { imageUrl: null },
      });
    }
  }
}

async function refreshPricesAfterMetadata(itemId: string): Promise<void> {
  const item = await prisma.item.findUnique({
    where: { id: itemId },
    include: { shelf: true, metadata: true },
  });
  if (!item) return;

  try {
    await repairProviderExternalLinksForItem(itemId);
    await refreshItemPricesFromContext(itemPricesContextFromRecord(item), {
      force: true,
    });
  } catch (error) {
    console.error(
      `[Prices] Post-metadata refresh failed for item ${itemId}:`,
      error,
    );
  }
}

async function runItemMetadataRefresh(
  input: ScheduleItemMetadataRefreshInput,
  session: ItemMetadataRefreshSession,
): Promise<void> {
  await prepareItemForMetadataRefresh(input);
  const platform = resolveGameMetadataPlatform(
    undefined,
    input.shelfName,
    input.shelfType,
  );
  const stored = await fetchAndStoreMetadata(
    input.itemId,
    input.lookupQuery,
    input.shelfType,
    input.barcode || undefined,
    input.forceRefresh ?? true,
    platform,
    input.bypassMetadataCache ?? true,
    true,
    input.shelfName,
    session,
  );
  if (stored) {
    void runBackgroundWork(() => refreshPricesAfterMetadata(input.itemId));
  }
}

async function refreshItemWithSession(
  itemId: string,
  run: (session: ItemMetadataRefreshSession) => Promise<void>,
): Promise<void> {
  const session = await beginItemMetadataRefresh(itemId);
  try {
    await run(session);
  } catch (error) {
    if (!isAbortError(error)) {
      console.error(`[MetadataRefresh] Refresh failed for ${itemId}:`, error);
    }
  } finally {
    await finishItemMetadataRefresh(itemId, session.generation);
  }
}

/** Plex-style : chaque item passe par la file globale d'arrière-plan. */
export function scheduleBatchItemMetadataRefresh(
  items: BatchMetadataRefreshItem[],
  shelf: { type: Type; name: string },
): void {
  if (items.length === 0) return;

  after(async () => {
    await Promise.all(
      items.map((next) =>
        runBackgroundWork(() =>
          refreshItemWithSession(next.itemId, async (session) => {
            const platform = resolveGameMetadataPlatform(
              undefined,
              shelf.name,
              shelf.type,
            );
            const stored = await fetchAndStoreMetadata(
              next.itemId,
              next.lookupQuery,
              shelf.type,
              next.barcode || undefined,
              true,
              platform,
              false,
              true,
              shelf.name,
              session,
            );
            if (stored) {
              void runBackgroundWork(() =>
                refreshPricesAfterMetadata(next.itemId),
              );
            }
          }),
        ),
      ),
    );
  });
}

export function scheduleItemMetadataRefresh(
  input: ScheduleItemMetadataRefreshInput,
  session: ItemMetadataRefreshSession,
): void {
  after(() =>
    runBackgroundWork(async () => {
      try {
        await runItemMetadataRefresh(input, session);
      } catch (error) {
        if (!isAbortError(error)) {
          console.error(
            `[MetadataRefresh] Background refresh failed for ${input.itemId}:`,
            error,
          );
        }
      } finally {
        await finishItemMetadataRefresh(input.itemId, session.generation);
      }
    }),
  );
}

export async function startItemMetadataRefresh(
  input: ScheduleItemMetadataRefreshInput,
): Promise<{ startedAt: Date; generation: number }> {
  const session = await beginItemMetadataRefresh(input.itemId);
  scheduleItemMetadataRefresh(input, session);
  return { startedAt: session.startedAt, generation: session.generation };
}
