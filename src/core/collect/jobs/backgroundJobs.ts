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
  cancelBackgroundWorkJobById,
  cancelBackgroundWorkJobsForUser,
} from "@/core/collect/jobs/workQueue";
import {
  catalogueExtractLabel,
  normalizeCatalogueExtractTarget,
  type CatalogueExtractTarget,
} from "@/lib/admin/catalogueExtractRunner";

export type BackgroundJobKind =
  | "metadataRefresh"
  | "metadataEnrich"
  | "priceRefresh"
  | "foilExtract"
  | "apkStoreFetch"
  | "icollectCatalogSync"
  | "launchboxIndexSync"
  | "nointroIndexSync"
  | "catalogProviderSync";

export type BackgroundJobRow = {
  id: string;
  name: string;
  slug: string | null;
  kind: BackgroundJobKind;
  startedAt: Date;
  cancellable: boolean;
  /** Foil extract pack target — drives per-pack loading / logs in admin. */
  foilTarget?: CatalogueExtractTarget | null;
  shelf: {
    id: string;
    name: string;
    slug: string | null;
    type: string;
  } | null;
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

async function listCatalogIndexJobsForUser(
  userId: string,
): Promise<BackgroundJobRow[]> {
  const kinds = [
    BACKGROUND_WORK_KIND.icollectCatalogSync,
    BACKGROUND_WORK_KIND.launchboxIndexSync,
    BACKGROUND_WORK_KIND.nointroIndexSync,
    BACKGROUND_WORK_KIND.catalogProviderSync,
    BACKGROUND_WORK_KIND.apkStoreFetch,
  ] as const;

  const jobs = await prisma.backgroundWorkJob.findMany({
    where: {
      kind: { in: [...kinds] },
      status: {
        in: [BACKGROUND_WORK_STATUS.pending, BACKGROUND_WORK_STATUS.running],
      },
      OR: [{ userId }, { userId: null }],
    },
    orderBy: [{ createdAt: "asc" }],
    take: 40,
    select: {
      id: true,
      kind: true,
      payload: true,
      createdAt: true,
      lockedAt: true,
    },
  });

  const labels: Record<
    Exclude<(typeof kinds)[number], "catalogProviderSync" | "apkStoreFetch">,
    string
  > = {
    [BACKGROUND_WORK_KIND.icollectCatalogSync]: "iCollect catalog",
    [BACKGROUND_WORK_KIND.launchboxIndexSync]: "LaunchBox index",
    [BACKGROUND_WORK_KIND.nointroIndexSync]: "No-Intro index",
  };

  return jobs.map((job) => {
    if (job.kind === BACKGROUND_WORK_KIND.apkStoreFetch) {
      const pack =
        typeof (job.payload as { pack?: unknown })?.pack === "string"
          ? (job.payload as { pack: string }).pack
          : "apk";
      return {
        id: job.id,
        name: pack,
        slug: null,
        kind: "apkStoreFetch" as const,
        startedAt: job.lockedAt ?? job.createdAt,
        cancellable: true,
        shelf: null,
      };
    }
    if (job.kind === BACKGROUND_WORK_KIND.catalogProviderSync) {
      // Pas de registry ici : ce poll tourne souvent dans Next, et les lignes
      // sont de toute façon regroupées en « Données fournisseurs ».
      const providerId =
        typeof (job.payload as { providerId?: unknown })?.providerId ===
        "string"
          ? (job.payload as { providerId: string }).providerId
          : "catalogue";
      return {
        id: job.id,
        name: providerId,
        slug: null,
        kind: "catalogProviderSync" as const,
        startedAt: job.lockedAt ?? job.createdAt,
        cancellable: true,
        shelf: null,
      };
    }
    return {
      id: job.id,
      name: labels[job.kind as keyof typeof labels] ?? job.kind,
      slug: null,
      kind: job.kind as BackgroundJobKind,
      startedAt: job.lockedAt ?? job.createdAt,
      cancellable: true,
      shelf: null,
    };
  });
}

async function listCatalogueExtractJobsForUser(
  userId: string,
): Promise<BackgroundJobRow[]> {
  const jobs = await prisma.backgroundWorkJob.findMany({
    where: {
      kind: BACKGROUND_WORK_KIND.catalogueExtract,
      status: {
        in: [BACKGROUND_WORK_STATUS.pending, BACKGROUND_WORK_STATUS.running],
      },
      // Admin-enqueued jobs carry userId; CLI registers with null (system-wide).
      OR: [{ userId }, { userId: null }],
    },
    orderBy: [{ createdAt: "asc" }],
    take: 10,
    select: {
      id: true,
      payload: true,
      createdAt: true,
      lockedAt: true,
    },
  });

  return jobs.flatMap((job) => {
    const payload = job.payload as { target?: unknown };
    const target = normalizeCatalogueExtractTarget(payload?.target);
    if (!target) return [];
    return [
      {
        id: job.id,
        name: catalogueExtractLabel(target),
        slug: null,
        kind: "foilExtract" as const,
        startedAt: job.lockedAt ?? job.createdAt,
        cancellable: true,
        foilTarget: target,
        shelf: null,
      },
    ];
  });
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
  const foilJobs = await listCatalogueExtractJobsForUser(userId);
  const catalogJobs = await listCatalogIndexJobsForUser(userId);

  return [...foilJobs, ...catalogJobs, ...metadataJobs, ...priceJobs].slice(
    0,
    50,
  );
}

export async function cancelBackgroundJobForUser(
  userId: string,
  id: string,
): Promise<boolean> {
  const item = await prisma.item.findFirst({
    where: { id, userId },
    select: { id: true },
  });
  if (item) {
    await cancelAndClearItemMetadataRefresh(item.id);
    return true;
  }

  if (await cancelBackgroundWorkJobById(id, userId)) return true;
  // Catalog index syncs are often system-wide (null userId).
  return cancelBackgroundWorkJobById(id);
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
