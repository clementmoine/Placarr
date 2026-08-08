import { randomUUID } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";

import { prisma } from "@/lib/db/prisma";

export const BACKGROUND_WORK_KIND = {
  metadataRefresh: "metadataRefresh",
  priceRefresh: "priceRefresh",
  icollectCatalogSync: "icollectCatalogSync",
  launchboxIndexSync: "launchboxIndexSync",
  nointroIndexSync: "nointroIndexSync",
  foilExtract: "foilExtract",
} as const;

export type BackgroundWorkKind =
  (typeof BACKGROUND_WORK_KIND)[keyof typeof BACKGROUND_WORK_KIND];

/** Interactive enrich path — must not share slots with the catalog crawl. */
export const INTERACTIVE_WORKER_KINDS: readonly BackgroundWorkKind[] = [
  BACKGROUND_WORK_KIND.metadataRefresh,
  BACKGROUND_WORK_KIND.priceRefresh,
  BACKGROUND_WORK_KIND.foilExtract,
];

/** Local index / catalog crawl — dedicated process (`pnpm worker:icollect`). */
export const ICOLLECT_WORKER_KINDS: readonly BackgroundWorkKind[] = [
  BACKGROUND_WORK_KIND.icollectCatalogSync,
  BACKGROUND_WORK_KIND.launchboxIndexSync,
  BACKGROUND_WORK_KIND.nointroIndexSync,
];

const KNOWN_WORKER_KINDS = new Set<string>(Object.values(BACKGROUND_WORK_KIND));

/**
 * Parse `WORKER_KINDS` (comma-separated).
 * - unset / empty → `null` (all kinds — tests / explicit override)
 * - `interactive` → metadata + price + foil extract
 * - `catalog` → catalog sync only
 * - otherwise a comma list of kind ids
 */
export function resolveWorkerKinds(
  raw = process.env.WORKER_KINDS,
): BackgroundWorkKind[] | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  if (trimmed === "*" || trimmed.toLowerCase() === "all") return null;
  if (trimmed.toLowerCase() === "interactive") {
    return [...INTERACTIVE_WORKER_KINDS];
  }
  if (trimmed.toLowerCase() === "catalog") {
    return [...ICOLLECT_WORKER_KINDS];
  }

  const kinds = trimmed
    .split(",")
    .map((part) => part.trim())
    .filter((part): part is BackgroundWorkKind => KNOWN_WORKER_KINDS.has(part));
  // Unknown alias must not silently mean "all kinds".
  return kinds;
}

export const BACKGROUND_WORK_STATUS = {
  pending: "pending",
  running: "running",
  completed: "completed",
  failed: "failed",
  cancelled: "cancelled",
} as const;

export type BackgroundWorkStatus =
  (typeof BACKGROUND_WORK_STATUS)[keyof typeof BACKGROUND_WORK_STATUS];

export type MetadataRefreshJobPayload = {
  itemId: string;
  lookupQuery: string;
  shelfType: string;
  shelfName: string;
  barcode?: string | null;
  clearRemoteCover?: boolean;
  bypassMetadataCache?: boolean;
  forceRefresh?: boolean;
  generation: number;
};

export type PriceRefreshJobPayload = {
  id: string;
  barcode?: string | null;
  name: string;
  metadataId?: string | null;
  metadataTitle?: string | null;
  metadataAliases?: string | null;
  metadataReleaseDate?: string | null;
  metadataPlatformKey?: string | null;
  metadataExternalIds?: Record<string, string | null | undefined> | null;
  metadataBarcodes?: string[] | null;
  metadataFacts?: unknown;
  shelfType: string;
  shelfName: string;
  printKey?: string | null;
  force?: boolean;
};

import type { FoilExtractTarget } from "@/lib/admin/foilExtractRunner";

export type FoilExtractJobPayload = {
  target: FoilExtractTarget;
};

export type BackgroundWorkJobRow = {
  id: string;
  kind: string;
  status: string;
  itemId: string | null;
  userId: string | null;
  payload: Prisma.JsonValue;
  attempts: number;
  lockedAt: Date | null;
  lockedBy: string | null;
  runAfter: Date;
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
  finishedAt: Date | null;
};

async function cancelOpenJobs(options: {
  itemId?: string;
  kind?: BackgroundWorkKind;
  userId?: string;
}): Promise<number> {
  const where: Prisma.BackgroundWorkJobWhereInput = {
    status: {
      in: [BACKGROUND_WORK_STATUS.pending, BACKGROUND_WORK_STATUS.running],
    },
  };
  if (options.itemId) where.itemId = options.itemId;
  if (options.kind) where.kind = options.kind;
  if (options.userId) where.userId = options.userId;

  const result = await prisma.backgroundWorkJob.updateMany({
    where,
    data: {
      status: BACKGROUND_WORK_STATUS.cancelled,
      finishedAt: new Date(),
      lockedAt: null,
      lockedBy: null,
    },
  });
  return result.count;
}

export async function enqueueBackgroundWorkJob(input: {
  kind: BackgroundWorkKind;
  payload: Prisma.InputJsonValue;
  itemId?: string | null;
  userId?: string | null;
  /** Replace any open job of the same kind for this item. */
  replaceOpenForItem?: boolean;
  /** Replace any open job of this kind (e.g. singleton sync ticks). */
  replaceOpenForKind?: boolean;
}): Promise<BackgroundWorkJobRow> {
  /**
   * Preserve FIFO `createdAt` when replacing. Cancel+recreate with a fresh
   * timestamp pushed viewed items to the back of a long price queue on every
   * page reload.
   */
  let preserveCreatedAt: Date | undefined;
  if (input.replaceOpenForItem && input.itemId) {
    const earliest = await prisma.backgroundWorkJob.findFirst({
      where: {
        itemId: input.itemId,
        kind: input.kind,
        status: {
          in: [BACKGROUND_WORK_STATUS.pending, BACKGROUND_WORK_STATUS.running],
        },
      },
      orderBy: { createdAt: "asc" },
      select: { createdAt: true },
    });
    preserveCreatedAt = earliest?.createdAt;
    await cancelOpenJobs({ itemId: input.itemId, kind: input.kind });
  } else if (input.replaceOpenForKind) {
    await cancelOpenJobs({ kind: input.kind });
  }

  return prisma.backgroundWorkJob.create({
    data: {
      kind: input.kind,
      status: BACKGROUND_WORK_STATUS.pending,
      itemId: input.itemId ?? null,
      userId: input.userId ?? null,
      payload: input.payload,
      runAfter: new Date(),
      ...(preserveCreatedAt ? { createdAt: preserveCreatedAt } : {}),
    },
  });
}

export async function cancelBackgroundWorkJobsForItem(
  itemId: string,
): Promise<number> {
  return cancelOpenJobs({ itemId });
}

export async function cancelBackgroundWorkJobById(
  jobId: string,
  userId?: string | null,
): Promise<boolean> {
  const where: Prisma.BackgroundWorkJobWhereInput = {
    id: jobId,
    status: {
      in: [BACKGROUND_WORK_STATUS.pending, BACKGROUND_WORK_STATUS.running],
    },
  };
  if (userId) where.userId = userId;

  const result = await prisma.backgroundWorkJob.updateMany({
    where,
    data: {
      status: BACKGROUND_WORK_STATUS.cancelled,
      finishedAt: new Date(),
      lockedAt: null,
      lockedBy: null,
    },
  });
  return result.count > 0;
}

export async function cancelBackgroundWorkJobsForUser(
  userId: string,
): Promise<number> {
  return cancelOpenJobs({ userId });
}

export async function hasActiveBackgroundWorkJobForItem(
  itemId: string,
): Promise<boolean> {
  const job = await prisma.backgroundWorkJob.findFirst({
    where: {
      itemId,
      status: {
        in: [BACKGROUND_WORK_STATUS.pending, BACKGROUND_WORK_STATUS.running],
      },
    },
    select: { id: true },
  });
  return Boolean(job);
}

/**
 * Claim the next pending job (Postgres `FOR UPDATE SKIP LOCKED`).
 * Returns null when the queue is empty.
 *
 * @param kinds When set, only claim jobs of these kinds (pool isolation).
 */
export async function claimNextBackgroundWorkJob(
  workerId: string = randomUUID(),
  kinds: readonly BackgroundWorkKind[] | null = null,
): Promise<BackgroundWorkJobRow | null> {
  // Empty array = misconfigured pool (never claim). null = all kinds.
  if (kinds && kinds.length === 0) {
    return null;
  }
  const kindsFilter =
    kinds && kinds.length > 0
      ? Prisma.sql`AND candidate."kind" IN (${Prisma.join(kinds)})`
      : Prisma.empty;

  const rows = await prisma.$queryRaw<BackgroundWorkJobRow[]>`
    UPDATE "BackgroundWorkJob" AS job
    SET
      "status" = ${BACKGROUND_WORK_STATUS.running},
      "lockedAt" = NOW(),
      "lockedBy" = ${workerId},
      "attempts" = job."attempts" + 1,
      "updatedAt" = NOW()
    WHERE job."id" = (
      SELECT candidate."id"
      FROM "BackgroundWorkJob" AS candidate
      WHERE candidate."status" = ${BACKGROUND_WORK_STATUS.pending}
        AND candidate."runAfter" <= NOW()
        ${kindsFilter}
        AND (
          -- Never starve interactive metadata behind the iCollect catalog crawl.
          candidate."kind" <> ${BACKGROUND_WORK_KIND.icollectCatalogSync}
          OR NOT EXISTS (
            SELECT 1
            FROM "BackgroundWorkJob" AS waiting_meta
            WHERE waiting_meta."status" = ${BACKGROUND_WORK_STATUS.pending}
              AND waiting_meta."kind" = ${BACKGROUND_WORK_KIND.metadataRefresh}
              AND waiting_meta."runAfter" <= NOW()
          )
        )
        AND (
          -- Leave worker capacity for metadata when a refresh is waiting.
          candidate."kind" <> ${BACKGROUND_WORK_KIND.priceRefresh}
          OR NOT EXISTS (
            SELECT 1
            FROM "BackgroundWorkJob" AS waiting_meta
            WHERE waiting_meta."status" = ${BACKGROUND_WORK_STATUS.pending}
              AND waiting_meta."kind" = ${BACKGROUND_WORK_KIND.metadataRefresh}
              AND waiting_meta."runAfter" <= NOW()
          )
          OR (
            SELECT COUNT(*)::int
            FROM "BackgroundWorkJob" AS running_price
            WHERE running_price."status" = ${BACKGROUND_WORK_STATUS.running}
              AND running_price."kind" = ${BACKGROUND_WORK_KIND.priceRefresh}
          ) < 1
        )
        AND (
          -- At most one long foil extract at a time (CDN scrape).
          candidate."kind" <> ${BACKGROUND_WORK_KIND.foilExtract}
          OR (
            SELECT COUNT(*)::int
            FROM "BackgroundWorkJob" AS running_foil
            WHERE running_foil."status" = ${BACKGROUND_WORK_STATUS.running}
              AND running_foil."kind" = ${BACKGROUND_WORK_KIND.foilExtract}
          ) < 1
        )
      ORDER BY
        CASE candidate."kind"
          WHEN ${BACKGROUND_WORK_KIND.metadataRefresh} THEN 0
          WHEN ${BACKGROUND_WORK_KIND.icollectCatalogSync} THEN 2
          WHEN ${BACKGROUND_WORK_KIND.foilExtract} THEN 3
          ELSE 1
        END ASC,
        candidate."createdAt" ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    RETURNING
      job."id",
      job."kind",
      job."status",
      job."itemId",
      job."userId",
      job."payload",
      job."attempts",
      job."lockedAt",
      job."lockedBy",
      job."runAfter",
      job."error",
      job."createdAt",
      job."updatedAt",
      job."finishedAt"
  `;

  return rows[0] ?? null;
}

export async function isBackgroundWorkJobCancelled(
  jobId: string,
): Promise<boolean> {
  const job = await prisma.backgroundWorkJob.findUnique({
    where: { id: jobId },
    select: { status: true },
  });
  return job?.status === BACKGROUND_WORK_STATUS.cancelled;
}

export async function completeBackgroundWorkJob(jobId: string): Promise<void> {
  await prisma.backgroundWorkJob.updateMany({
    where: {
      id: jobId,
      status: BACKGROUND_WORK_STATUS.running,
    },
    data: {
      status: BACKGROUND_WORK_STATUS.completed,
      finishedAt: new Date(),
      // Keep lockedAt so we can measure real work duration (locked→finished).
      lockedBy: null,
      error: null,
    },
  });
}

export async function failBackgroundWorkJob(
  jobId: string,
  error: unknown,
  options: { retryDelayMs?: number; maxAttempts?: number } = {},
): Promise<void> {
  const maxAttempts = options.maxAttempts ?? 3;
  const retryDelayMs = options.retryDelayMs ?? 15_000;
  const job = await prisma.backgroundWorkJob.findUnique({
    where: { id: jobId },
    select: { attempts: true, status: true },
  });
  if (!job || job.status === BACKGROUND_WORK_STATUS.cancelled) return;

  const message =
    error instanceof Error ? error.message.slice(0, 2000) : String(error);

  if (job.attempts < maxAttempts) {
    await prisma.backgroundWorkJob.update({
      where: { id: jobId },
      data: {
        status: BACKGROUND_WORK_STATUS.pending,
        lockedAt: null,
        lockedBy: null,
        error: message,
        runAfter: new Date(Date.now() + retryDelayMs),
      },
    });
    return;
  }

  await prisma.backgroundWorkJob.update({
    where: { id: jobId },
    data: {
      status: BACKGROUND_WORK_STATUS.failed,
      finishedAt: new Date(),
      // Keep lockedAt for duration metrics; clear owner so reclaim is unambiguous.
      lockedBy: null,
      error: message,
    },
  });
}

/** Keep a long-running job's lock fresh so stale recovery does not steal it. */
export async function touchBackgroundWorkJobLock(
  jobId: string,
): Promise<boolean> {
  const result = await prisma.backgroundWorkJob.updateMany({
    where: {
      id: jobId,
      status: BACKGROUND_WORK_STATUS.running,
    },
    data: {
      lockedAt: new Date(),
      updatedAt: new Date(),
    },
  });
  return result.count > 0;
}

/**
 * Re-queue this worker's running jobs (SIGINT / crash path).
 * Without this, foil extracts stay `running` forever and block the one-at-a-time gate.
 */
export async function releaseRunningJobsForWorker(
  workerId: string,
): Promise<number> {
  const result = await prisma.backgroundWorkJob.updateMany({
    where: {
      status: BACKGROUND_WORK_STATUS.running,
      lockedBy: workerId,
    },
    data: {
      status: BACKGROUND_WORK_STATUS.pending,
      lockedAt: null,
      lockedBy: null,
      runAfter: new Date(),
      error: "Released on worker shutdown — will retry",
      updatedAt: new Date(),
    },
  });
  return result.count;
}

/** Default stale window for jobs that do not heartbeat. */
export const DEFAULT_STALE_RUNNING_MS = 30 * 60 * 1000;
/**
 * Foil extracts heartbeat every ~60s. No touch for this long ⇒ zombie lock
 * (worker died mid-spawn, or claim without execute).
 */
export const FOIL_STALE_RUNNING_MS = 5 * 60 * 1000;
/** After this many claims that went stale, abandon instead of infinite requeue. */
export const FOIL_STALE_MAX_ATTEMPTS = 2;

export type StaleRecoveryResult = {
  requeued: number;
  abandoned: number;
};

/**
 * Re-queue (or abandon) jobs stuck in `running` after a worker crash / orphan lock.
 *
 * Foil uses a short heartbeat window and is abandoned after
 * {@link FOIL_STALE_MAX_ATTEMPTS} stale recoveries so zombies cannot block the
 * single-foil gate forever.
 */
export async function recoverStaleRunningBackgroundWorkJobs(
  staleAfterMs = DEFAULT_STALE_RUNNING_MS,
  options?: {
    foilStaleAfterMs?: number;
    foilMaxAttempts?: number;
  },
): Promise<StaleRecoveryResult> {
  const foilStaleMs = options?.foilStaleAfterMs ?? FOIL_STALE_RUNNING_MS;
  const foilMaxAttempts = options?.foilMaxAttempts ?? FOIL_STALE_MAX_ATTEMPTS;
  const now = Date.now();
  const generalCutoff = new Date(now - staleAfterMs);
  const foilCutoff = new Date(now - foilStaleMs);

  const stale = await prisma.backgroundWorkJob.findMany({
    where: {
      status: BACKGROUND_WORK_STATUS.running,
      OR: [
        {
          kind: BACKGROUND_WORK_KIND.foilExtract,
          lockedAt: { lt: foilCutoff },
        },
        {
          kind: { not: BACKGROUND_WORK_KIND.foilExtract },
          lockedAt: { lt: generalCutoff },
        },
      ],
    },
    select: { id: true, kind: true, attempts: true },
  });

  let requeued = 0;
  let abandoned = 0;

  for (const job of stale) {
    const isFoil = job.kind === BACKGROUND_WORK_KIND.foilExtract;
    if (isFoil && job.attempts >= foilMaxAttempts) {
      const result = await prisma.backgroundWorkJob.updateMany({
        where: {
          id: job.id,
          status: BACKGROUND_WORK_STATUS.running,
        },
        data: {
          status: BACKGROUND_WORK_STATUS.failed,
          finishedAt: new Date(),
          lockedBy: null,
          error:
            "Abandoned stale foil extract (no heartbeat — worker died or never ran)",
          updatedAt: new Date(),
        },
      });
      abandoned += result.count;
      continue;
    }

    const result = await prisma.backgroundWorkJob.updateMany({
      where: {
        id: job.id,
        status: BACKGROUND_WORK_STATUS.running,
      },
      data: {
        status: BACKGROUND_WORK_STATUS.pending,
        lockedAt: null,
        lockedBy: null,
        runAfter: new Date(),
        error: isFoil
          ? "Recovered stale foil extract — will retry"
          : "Recovered stale running job after worker timeout",
        updatedAt: new Date(),
      },
    });
    requeued += result.count;
  }

  return { requeued, abandoned };
}
