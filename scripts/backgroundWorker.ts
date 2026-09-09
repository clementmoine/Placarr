#!/usr/bin/env npx tsx
/**
 * Out-of-process background worker.
 *
 * Next.js only enqueues rows into `BackgroundWorkJob`; this process claims
 * them (SKIP LOCKED) and runs work off the request event loop.
 *
 * Pools (set `WORKER_KINDS`):
 *   interactive (default) → metadataRefresh + priceRefresh + foilExtract
 *   catalog               → icollectCatalogSync only
 *   all / *               → every kind (legacy / debug)
 *
 *   pnpm worker
 *   pnpm worker:icollect
 *   docker compose -f compose.dev.yml up worker worker-icollect
 */

import "dotenv/config";

import { randomUUID } from "node:crypto";

import {
  claimNextBackgroundWorkJob,
  completeBackgroundWorkJob,
  DEFAULT_STALE_RUNNING_MS,
  failBackgroundWorkJob,
  isBackgroundWorkJobCancelled,
  recoverStaleRunningBackgroundWorkJobs,
  releaseRunningJobsForWorker,
  resolveWorkerKinds,
  INTERACTIVE_WORKER_KINDS,
  type BackgroundWorkKind,
} from "../src/core/collect/jobs/workQueue";
import {
  abandonBackgroundWorkJob,
  isBackgroundWorkAbandonedError,
} from "../src/core/collect/jobs/workJobOutcome";
import { executeBackgroundWorkJob } from "../src/core/collect/jobs/workRunner";
import { resolveInteractiveWorkerConcurrency } from "../src/core/collect/jobs/workerConcurrency";

const WORKER_ID = process.env.WORKER_ID || `worker-${randomUUID().slice(0, 8)}`;
const POLL_IDLE_MS = Number.parseInt(process.env.WORKER_POLL_MS || "1000", 10);
/**
 * Non-foil stale window. Foil uses a shorter heartbeat window inside
 * `recoverStaleRunningBackgroundWorkJobs` (see FOIL_STALE_RUNNING_MS).
 */
const STALE_RECOVER_MS = Number.parseInt(
  process.env.WORKER_STALE_RECOVER_MS || String(DEFAULT_STALE_RUNNING_MS),
  10,
);
/** How often to sweep zombie running locks (foil orphans especially). */
const STALE_SWEEP_MS = Number.parseInt(
  process.env.WORKER_STALE_SWEEP_MS || String(60 * 1000),
  10,
);

/** Default pool: keep iCollect off the interactive enrich worker. */
function resolveClaimKinds(): readonly BackgroundWorkKind[] | null {
  if (process.env.WORKER_KINDS?.trim()) {
    return resolveWorkerKinds(process.env.WORKER_KINDS);
  }
  return INTERACTIVE_WORKER_KINDS;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let stopping = false;
const claimKinds = resolveClaimKinds();

async function processOneJob(): Promise<boolean> {
  const job = await claimNextBackgroundWorkJob(WORKER_ID, claimKinds);
  if (!job) return false;

  console.info(`[Worker ${WORKER_ID}] claimed ${job.kind} ${job.id}`, {
    itemId: job.itemId,
    attempts: job.attempts,
  });

  try {
    if (await isBackgroundWorkJobCancelled(job.id)) {
      console.info(`[Worker ${WORKER_ID}] skipped cancelled job ${job.id}`);
      return true;
    }
    await executeBackgroundWorkJob(job);
    if (await isBackgroundWorkJobCancelled(job.id)) {
      return true;
    }
    await completeBackgroundWorkJob(job.id);
    console.info(`[Worker ${WORKER_ID}] completed ${job.id}`);
  } catch (error) {
    if (isBackgroundWorkAbandonedError(error)) {
      await abandonBackgroundWorkJob(job.id, error.message);
      console.info(
        `[Worker ${WORKER_ID}] abandoned ${job.id} (${error.reason})`,
      );
      return true;
    }
    console.error(`[Worker ${WORKER_ID}] failed ${job.id}:`, error);
    await failBackgroundWorkJob(job.id, error, {
      // Foil CDN scrape is expensive — do not auto-retry three times.
      maxAttempts: job.kind === "foilExtract" ? job.attempts : undefined,
    });
  }
  return true;
}

async function runSlot(slot: number): Promise<void> {
  while (!stopping) {
    try {
      const worked = await processOneJob();
      if (!worked) await sleep(POLL_IDLE_MS);
    } catch (error) {
      console.error(`[Worker ${WORKER_ID}] slot ${slot} error:`, error);
      await sleep(POLL_IDLE_MS);
    }
  }
}

async function sweepStaleLocks(): Promise<void> {
  const { requeued, abandoned } =
    await recoverStaleRunningBackgroundWorkJobs(STALE_RECOVER_MS);
  if (requeued > 0 || abandoned > 0) {
    console.warn(
      `[Worker ${WORKER_ID}] stale recovery: requeued=${requeued} abandoned=${abandoned}`,
    );
  }
}

async function main(): Promise<void> {
  if (claimKinds && claimKinds.length === 0) {
    console.error(
      `[Worker ${WORKER_ID}] WORKER_KINDS matched no known kinds — refusing to start (use interactive, catalog, all, or kind ids)`,
    );
    process.exit(1);
  }

  const { concurrency, cappedForFlare } = resolveInteractiveWorkerConcurrency();
  const kindsLabel = claimKinds?.join(",") ?? "all";
  console.info(
    `[Worker ${WORKER_ID}] starting (concurrency=${concurrency}, poll=${POLL_IDLE_MS}ms, kinds=${kindsLabel})`,
  );
  if (cappedForFlare) {
    console.warn(
      `[Worker ${WORKER_ID}] capped concurrency for FlareSolverr (serial browser). Set WORKER_CONCURRENCY_FORCE=1 to override.`,
    );
  }

  const recoverTimer = setInterval(() => {
    void sweepStaleLocks();
  }, STALE_SWEEP_MS);
  if (typeof recoverTimer.unref === "function") recoverTimer.unref();

  await sweepStaleLocks();

  const { ICOLLECT_WORKER_KINDS } =
    await import("../src/core/collect/jobs/workQueue");
  const runsCatalogueAutoSync =
    !claimKinds ||
    claimKinds.some((kind) =>
      (ICOLLECT_WORKER_KINDS as readonly string[]).includes(kind),
    );
  if (runsCatalogueAutoSync) {
    const { startCatalogueAutoSyncLoop } =
      await import("../src/lib/admin/catalogueAutoSync");
    startCatalogueAutoSyncLoop();
  }

  let shuttingDown: Promise<void> | null = null;
  const shutdown = async (signal: string) => {
    if (stopping) return shuttingDown ?? Promise.resolve();
    stopping = true;
    console.info(`[Worker ${WORKER_ID}] shutting down on ${signal}`);
    clearInterval(recoverTimer);
    const count = await releaseRunningJobsForWorker(WORKER_ID);
    if (count > 0) {
      console.info(
        `[Worker ${WORKER_ID}] released ${count} running job(s) back to pending`,
      );
    }
  };
  process.on("SIGINT", () => {
    shuttingDown = shutdown("SIGINT").finally(() => process.exit(0));
  });
  process.on("SIGTERM", () => {
    shuttingDown = shutdown("SIGTERM").finally(() => process.exit(0));
  });

  await Promise.all(
    Array.from({ length: concurrency }, (_, slot) => runSlot(slot)),
  );
}

main().catch((error) => {
  console.error("[Worker] fatal:", error);
  process.exit(1);
});
