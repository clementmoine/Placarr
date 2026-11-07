import { prisma } from "@/lib/db/prisma";
import { METADATA_REFRESH_ORPHAN_GRACE_MS } from "@/core/collect/enrichment";
import {
  hasActiveBackgroundWorkJobForItem,
  cancelBackgroundWorkJobsForItem,
} from "@/core/collect/jobs/workQueue";
import { isAbortError, throwIfAborted } from "@/lib/http/abort";

export type ItemMetadataRefreshSession = {
  generation: number;
  startedAt: Date;
  signal: AbortSignal;
};

type ActiveRefreshSession = ItemMetadataRefreshSession & {
  controller: AbortController;
};

const activeSessions = new Map<string, ActiveRefreshSession>();

/**
 * Persist the in-flight refresh flag (API process). Does not register a local
 * AbortController — the worker adopts the generation when it claims the job.
 */
export async function stampItemMetadataRefresh(
  itemId: string,
): Promise<{ generation: number; startedAt: Date }> {
  cancelItemMetadataRefresh(itemId);

  const startedAt = new Date();
  const updated = await prisma.item.update({
    where: { id: itemId },
    data: {
      metadataRefreshStartedAt: startedAt,
      metadataRefreshGeneration: { increment: 1 },
    },
    select: { metadataRefreshGeneration: true },
  });

  return {
    generation: updated.metadataRefreshGeneration,
    startedAt,
  };
}

/**
 * Test / same-process helper: stamp + local AbortController.
 * Production API paths use `stampItemMetadataRefresh` + worker `adopt*`.
 * @internal
 */
export async function beginItemMetadataRefresh(
  itemId: string,
): Promise<ItemMetadataRefreshSession> {
  const stamped = await stampItemMetadataRefresh(itemId);
  const controller = new AbortController();
  const session: ActiveRefreshSession = {
    generation: stamped.generation,
    startedAt: stamped.startedAt,
    signal: controller.signal,
    controller,
  };
  activeSessions.set(itemId, session);

  return {
    generation: session.generation,
    startedAt: session.startedAt,
    signal: session.signal,
  };
}

/**
 * Worker-only: attach a local AbortController to a refresh already stamped in DB
 * by the API process (generation must still match).
 */
export async function adoptItemMetadataRefreshOnWorker(
  itemId: string,
  generation: number,
): Promise<
  (ItemMetadataRefreshSession & { controller: AbortController }) | null
> {
  const item = await prisma.item.findUnique({
    where: { id: itemId },
    select: {
      metadataRefreshGeneration: true,
      metadataRefreshStartedAt: true,
    },
  });
  if (
    !item?.metadataRefreshStartedAt ||
    item.metadataRefreshGeneration !== generation
  ) {
    return null;
  }

  const previous = activeSessions.get(itemId);
  if (previous) {
    previous.controller.abort();
    activeSessions.delete(itemId);
  }

  const controller = new AbortController();
  const session: ActiveRefreshSession = {
    generation,
    startedAt: item.metadataRefreshStartedAt,
    signal: controller.signal,
    controller,
  };
  activeSessions.set(itemId, session);
  return session;
}

export async function isItemMetadataRefreshCurrent(
  itemId: string,
  generation: number,
): Promise<boolean> {
  const item = await prisma.item.findUnique({
    where: { id: itemId },
    select: { metadataRefreshGeneration: true },
  });
  return item?.metadataRefreshGeneration === generation;
}

export async function finishItemMetadataRefresh(
  itemId: string,
  generation: number,
): Promise<void> {
  const active = activeSessions.get(itemId);
  if (active?.generation === generation) {
    activeSessions.delete(itemId);
  }

  const cleared = await prisma.item.updateMany({
    where: { id: itemId, metadataRefreshGeneration: generation },
    data: { metadataRefreshStartedAt: null },
  });

  if (cleared.count === 0 && !activeSessions.has(itemId)) {
    // Generation mismatch (superseded). Never clear a stamp that still has an
    // open worker job — that would make adopt() fail for mass-refresh queues.
    if (await hasActiveBackgroundWorkJobForItem(itemId)) return;

    const refreshCutoff = new Date(
      Date.now() - METADATA_REFRESH_ORPHAN_GRACE_MS,
    );
    await prisma.item.updateMany({
      where: {
        id: itemId,
        metadataRefreshStartedAt: { lt: refreshCutoff },
      },
      data: { metadataRefreshStartedAt: null },
    });
  }
}

function metadataRefreshElapsedMs(
  startedAt: Date | string,
  now = Date.now(),
): number | null {
  const started = new Date(startedAt).getTime();
  if (Number.isNaN(started)) return null;
  return now - started;
}

/**
 * True when a persisted refresh flag should be cleared by the orphan guard.
 * Pass `hasActiveWork` when a local session or out-of-process worker owns the item.
 *
 * Open DB jobs (pending/running) must NOT be cancelled from stamp age: mass
 * refresh stamps every item at enqueue time, so a 15‑minute max would wipe the
 * whole queue while most items are still waiting. Stale *running* jobs are
 * recovered by `recoverStaleRunningBackgroundWorkJobs` on the worker.
 */
export function shouldReconcileMetadataRefreshFlag(
  itemId: string,
  startedAt: Date | string | null | undefined,
  now = Date.now(),
  hasActiveWork = activeSessions.has(itemId),
): boolean {
  if (!startedAt) return false;
  const elapsedMs = metadataRefreshElapsedMs(startedAt, now);
  if (elapsedMs === null) return false;

  if (hasActiveWork) {
    return false;
  }
  return elapsedMs >= METADATA_REFRESH_ORPHAN_GRACE_MS;
}

async function clearPersistedMetadataRefreshFlag(
  itemId: string,
  startedAt: Date,
): Promise<boolean> {
  const cleared = await prisma.item.updateMany({
    where: { id: itemId, metadataRefreshStartedAt: startedAt },
    data: { metadataRefreshStartedAt: null },
  });
  return cleared.count > 0;
}

/**
 * Clears zombie refresh flags: DB says in-flight but no worker owns the item.
 * Does not cancel open BackgroundWorkJob rows — those are owned by the worker.
 */
export async function reconcileMetadataRefreshFlag(
  itemId: string,
  startedAt: Date | string | null | undefined,
): Promise<boolean> {
  const hasActiveWork =
    activeSessions.has(itemId) ||
    (await hasActiveBackgroundWorkJobForItem(itemId));

  if (
    !startedAt ||
    !shouldReconcileMetadataRefreshFlag(
      itemId,
      startedAt,
      Date.now(),
      hasActiveWork,
    )
  ) {
    return false;
  }

  const started = new Date(startedAt);
  const elapsedMs = metadataRefreshElapsedMs(started);
  const hadActiveSession = activeSessions.has(itemId);
  if (hadActiveSession) {
    cancelItemMetadataRefresh(itemId);
  }

  // Orphan stamp only (no open job). Do not cancel queue jobs here.
  const cleared = await clearPersistedMetadataRefreshFlag(itemId, started);
  if (cleared) {
    console.warn("[MetadataRefresh] Reconciled stale refresh flag", {
      itemId,
      elapsedMs,
      hadActiveSession,
      hasActiveWork,
      reason: "orphan",
    });
  }
  return cleared;
}

/** Clears refresh flags left behind when a worker died mid-run. */
export async function clearStaleMetadataRefreshStartedAtIfNeeded(
  itemId: string,
  startedAt: Date | null | undefined,
): Promise<void> {
  await reconcileMetadataRefreshFlag(itemId, startedAt);
}

/** Sweep all in-flight refresh flags for one user (background-jobs poll). */
export async function reconcileOrphanedMetadataRefreshesForUser(
  userId: string,
): Promise<number> {
  const items = await prisma.item.findMany({
    where: { userId, metadataRefreshStartedAt: { not: null } },
    select: { id: true, metadataRefreshStartedAt: true },
  });

  let reconciled = 0;
  for (const item of items) {
    if (
      await reconcileMetadataRefreshFlag(item.id, item.metadataRefreshStartedAt)
    ) {
      reconciled++;
    }
  }
  return reconciled;
}

export async function assertRefreshCanPersist(
  itemId: string,
  session: Pick<ItemMetadataRefreshSession, "generation" | "signal">,
): Promise<boolean> {
  throwIfAborted(session.signal);
  return isItemMetadataRefreshCurrent(itemId, session.generation);
}

export function cancelItemMetadataRefresh(itemId: string): void {
  const active = activeSessions.get(itemId);
  if (!active) return;
  active.controller.abort();
  activeSessions.delete(itemId);
}

export function getInMemoryMetadataRefreshItemIds(): string[] {
  return [...activeSessions.keys()];
}

export async function cancelAndClearItemMetadataRefresh(
  itemId: string,
): Promise<void> {
  cancelItemMetadataRefresh(itemId);
  await cancelBackgroundWorkJobsForItem(itemId);
  await prisma.item.updateMany({
    where: { id: itemId },
    data: { metadataRefreshStartedAt: null },
  });
}

export async function cancelAllMetadataRefreshesForItems(
  itemIds: string[],
): Promise<number> {
  let cancelled = 0;
  for (const itemId of itemIds) {
    const hadSession = activeSessions.has(itemId);
    await cancelAndClearItemMetadataRefresh(itemId);
    if (hadSession) cancelled++;
  }
  return cancelled;
}

export function resetMetadataRefreshSessionsForTests(): void {
  for (const session of activeSessions.values()) {
    session.controller.abort();
  }
  activeSessions.clear();
}

export { isAbortError };
