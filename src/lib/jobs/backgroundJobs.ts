import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import {
  ITEM_ENRICH_WINDOW_MS,
  METADATA_REFRESH_MAX_MS,
} from "@/lib/item/enrichment";
import {
  cancelAndClearItemMetadataRefresh,
  getInMemoryMetadataRefreshItemIds,
} from "@/lib/jobs/metadataRefreshSession";

export type BackgroundJobKind = "metadataRefresh" | "metadataEnrich";

export type BackgroundJobRow = {
  id: string;
  name: string;
  slug: string;
  kind: BackgroundJobKind;
  startedAt: Date;
  cancellable: boolean;
  shelf: {
    id: string;
    name: string;
    slug: string;
    type: string;
  };
};

const backgroundJobSelect = {
  id: true,
  name: true,
  slug: true,
  metadataId: true,
  createdAt: true,
  metadataRefreshStartedAt: true,
  shelf: {
    select: {
      id: true,
      name: true,
      slug: true,
      type: true,
    },
  },
} satisfies Prisma.ItemSelect;

type BackgroundJobDbRow = Prisma.ItemGetPayload<{
  select: typeof backgroundJobSelect;
}>;

function activeBackgroundJobsWhere(
  userId: string,
): Prisma.ItemWhereInput {
  const refreshCutoff = new Date(Date.now() - METADATA_REFRESH_MAX_MS);
  const enrichCutoff = new Date(Date.now() - ITEM_ENRICH_WINDOW_MS);

  return {
    userId,
    OR: [
      { metadataRefreshStartedAt: { gte: refreshCutoff } },
      {
        metadataId: null,
        metadataRefreshStartedAt: null,
        createdAt: { gte: enrichCutoff },
      },
    ],
  };
}

function toBackgroundJobRow(
  item: BackgroundJobDbRow,
  inMemoryIds: Set<string>,
): BackgroundJobRow {
  const isRefresh = Boolean(item.metadataRefreshStartedAt);
  const startedAt = isRefresh
    ? item.metadataRefreshStartedAt!
    : item.createdAt;

  return {
    id: item.id,
    name: item.name,
    slug: item.slug,
    kind: isRefresh ? "metadataRefresh" : "metadataEnrich",
    startedAt,
    cancellable: isRefresh || inMemoryIds.has(item.id),
    shelf: item.shelf,
  };
}

export async function listBackgroundJobsForUser(
  userId: string,
): Promise<BackgroundJobRow[]> {
  const inMemoryIds = new Set(getInMemoryMetadataRefreshItemIds());
  const items = await prisma.item.findMany({
    where: activeBackgroundJobsWhere(userId),
    select: backgroundJobSelect,
    orderBy: [{ metadataRefreshStartedAt: "desc" }, { createdAt: "desc" }],
    take: 50,
  });

  return items.map((item) => toBackgroundJobRow(item, inMemoryIds));
}

export async function cancelBackgroundJobForUser(
  userId: string,
  itemId: string,
): Promise<boolean> {
  const item = await prisma.item.findFirst({
    where: { id: itemId, userId },
    select: { id: true },
  });
  if (!item) return false;

  await cancelAndClearItemMetadataRefresh(itemId);
  return true;
}

export async function cancelAllBackgroundJobsForUser(
  userId: string,
): Promise<number> {
  const inMemoryIds = getInMemoryMetadataRefreshItemIds();
  const items = await prisma.item.findMany({
    where: {
      userId,
      OR: [
        { metadataRefreshStartedAt: { not: null } },
        ...(inMemoryIds.length > 0 ? [{ id: { in: inMemoryIds } }] : []),
      ],
    },
    select: { id: true },
  });

  const itemIds = Array.from(
    new Set([...items.map((item) => item.id), ...inMemoryIds]),
  );

  for (const itemId of itemIds) {
    await cancelAndClearItemMetadataRefresh(itemId);
  }

  return itemIds.length;
}
