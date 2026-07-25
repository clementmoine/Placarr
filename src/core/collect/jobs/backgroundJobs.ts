import type { Prisma } from "@/generated/prisma/browser";

import { prisma } from "@/lib/db/prisma";
import { ITEM_ENRICH_WINDOW_MS } from "@/core/collect/enrichment";
import {
  cancelAndClearItemMetadataRefresh,
  getInMemoryMetadataRefreshItemIds,
  reconcileOrphanedMetadataRefreshesForUser,
} from "@/core/collect/jobs/metadataRefreshSession";
import {
  BACKGROUND_WORK_KIND,
  BACKGROUND_WORK_STATUS,
  cancelBackgroundWorkJobsForUser,
} from "@/core/collect/jobs/workQueue";

export type BackgroundJobKind =
  | "metadataRefresh"
  | "metadataEnrich"
  | "priceRefresh";

export type BackgroundJobRow = {
  id: string;
  name: string;
  slug: string | null;
  kind: BackgroundJobKind;
  startedAt: Date;
  cancellable: boolean;
  shelf: {
    id: string;
    name: string;
    slug: string | null;
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

function activeBackgroundJobsWhere(userId: string): Prisma.ItemWhereInput {
  const enrichCutoff = new Date(Date.now() - ITEM_ENRICH_WINDOW_MS);

  return {
    userId,
    OR: [
      // Stamp stays set for the whole queue wait — no 15m cutoff (mass refresh).
      { metadataRefreshStartedAt: { not: null } },
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
  const startedAt = isRefresh ? item.metadataRefreshStartedAt! : item.createdAt;

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

async function listPriceRefreshJobsForUser(
  userId: string,
): Promise<BackgroundJobRow[]> {
  const jobs = await prisma.backgroundWorkJob.findMany({
    where: {
      userId,
      kind: BACKGROUND_WORK_KIND.priceRefresh,
      status: {
        in: [BACKGROUND_WORK_STATUS.pending, BACKGROUND_WORK_STATUS.running],
      },
    },
    orderBy: [{ createdAt: "asc" }],
    take: 50,
    select: {
      itemId: true,
      createdAt: true,
      lockedAt: true,
    },
  });

  const itemIds = [
    ...new Set(
      jobs
        .map((job) => job.itemId)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  ];
  if (itemIds.length === 0) return [];

  const items = await prisma.item.findMany({
    where: { id: { in: itemIds }, userId },
    select: backgroundJobSelect,
  });
  const byId = new Map(items.map((item) => [item.id, item]));

  const rows: BackgroundJobRow[] = [];
  for (const job of jobs) {
    if (!job.itemId) continue;
    const item = byId.get(job.itemId);
    if (!item) continue;
    rows.push({
      id: item.id,
      name: item.name,
      slug: item.slug,
      kind: "priceRefresh",
      startedAt: job.lockedAt ?? job.createdAt,
      cancellable: true,
      shelf: item.shelf,
    });
  }
  return rows;
}

export async function listBackgroundJobsForUser(
  userId: string,
): Promise<BackgroundJobRow[]> {
  await reconcileOrphanedMetadataRefreshesForUser(userId);

  const inMemoryIds = new Set(getInMemoryMetadataRefreshItemIds());
  const items = await prisma.item.findMany({
    where: activeBackgroundJobsWhere(userId),
    select: backgroundJobSelect,
    orderBy: [{ metadataRefreshStartedAt: "desc" }, { createdAt: "desc" }],
    take: 50,
  });

  const metadataJobs = items.map((item) =>
    toBackgroundJobRow(item, inMemoryIds),
  );
  const metadataIds = new Set(metadataJobs.map((job) => job.id));
  const priceJobs = (await listPriceRefreshJobsForUser(userId)).filter(
    (job) => !metadataIds.has(job.id),
  );

  return [...metadataJobs, ...priceJobs].slice(0, 50);
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
  const workCancelled = await cancelBackgroundWorkJobsForUser(userId);

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

  return workCancelled + itemIds.length;
}
