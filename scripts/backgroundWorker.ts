#!/usr/bin/env npx tsx
/**
 * Out-of-process background worker.
 *
 * Next.js only enqueues rows into `BackgroundWorkJob`; this process claims
 * them (SKIP LOCKED) and runs work off the request event loop.
 *
 * Pools (set `WORKER_KINDS`):
 *   interactive (default) → metadataRefresh + priceRefresh
 *   catalog               → icollectCatalogSync only
 *   all / *               → every kind (legacy / debug)
 *
 *   pnpm worker
 *   pnpm worker:icollect
 *   docker compose -f compose.dev.yml up worker worker-icollect
 */

export {};

try {
  process.loadEnvFile(".env");
} catch {
  // Docker / production often injects env without a local .env file.
}

import { randomUUID } from "node:crypto";

import {
  claimNextBackgroundWorkJob,
  completeBackgroundWorkJob,
  failBackgroundWorkJob,
  isBackgroundWorkJobCancelled,
  recoverStaleRunningBackgroundWorkJobs,
  resolveWorkerKinds,
  INTERACTIVE_WORKER_KINDS,
  type BackgroundWorkKind,
} from "../src/core/collect/jobs/workQueue";
import {
  abandonBackgroundWorkJob,
  isBackgroundWorkAbandonedError,
} from "../src/core/collect/jobs/workJobOutcome";
import { executeBackgroundWorkJob } from "../src/core/collect/jobs/workRunner";

const WORKER_ID = process.env.WORKER_ID || `worker-${randomUUID().slice(0, 8)}`;
const POLL_IDLE_MS = Number.parseInt(process.env.WORKER_POLL_MS || "1000", 10);
const STALE_RECOVER_MS = Number.parseInt(
  process.env.WORKER_STALE_RECOVER_MS || String(15 * 60 * 1000),
  10,
);

/** Default pool: keep iCollect off the interactive enrich worker. */
function resolveClaimKinds(): readonly BackgroundWorkKind[] | null {
  if (process.env.WORKER_KINDS?.trim()) {
    return resolveWorkerKinds(process.env.WORKER_KINDS);
  }
  return INTERACTIVE_WORKER_KINDS;
}

function resolveConcurrency(): number {
  const raw = Number.parseInt(
    process.env.WORKER_CONCURRENCY ||
      process.env.BACKGROUND_IO_CONCURRENCY ||
      process.env.BACKGROUND_WORK_CONCURRENCY ||
      "",
    10,
  );
  // Interactive enrich is I/O-bound (HTTP providers). 6 parallel items drains
  // manga/game backlogs without drowning FlareSolverr (still serial per host).
  if (Number.isFinite(raw) && raw > 0) return raw;
  return 6;
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
    await failBackgroundWorkJob(job.id, error);
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

async function main(): Promise<void> {
  if (claimKinds && claimKinds.length === 0) {
    console.error(
      `[Worker ${WORKER_ID}] WORKER_KINDS matched no known kinds — refusing to start (use interactive, catalog, all, or kind ids)`,
    );
    process.exit(1);
  }

  const concurrency = resolveConcurrency();
  const kindsLabel = claimKinds?.join(",") ?? "all";
  console.info(
    `[Worker ${WORKER_ID}] starting (concurrency=${concurrency}, poll=${POLL_IDLE_MS}ms, kinds=${kindsLabel})`,
  );

  const recoverTimer = setInterval(() => {
    void recoverStaleRunningBackgroundWorkJobs(STALE_RECOVER_MS).then(
      (count) => {
        if (count > 0) {
          console.warn(
            `[Worker ${WORKER_ID}] recovered ${count} stale running job(s)`,
          );
        }
      },
    );
  }, Math.min(STALE_RECOVER_MS, 5 * 60 * 1000));
  if (typeof recoverTimer.unref === "function") recoverTimer.unref();

  await recoverStaleRunningBackgroundWorkJobs(STALE_RECOVER_MS);

  const onStop = (signal: string) => {
    if (stopping) return;
    stopping = true;
    console.info(`[Worker ${WORKER_ID}] shutting down on ${signal}`);
    clearInterval(recoverTimer);
  };
  process.on("SIGINT", () => onStop("SIGINT"));
  process.on("SIGTERM", () => onStop("SIGTERM"));

  await Promise.all(
    Array.from({ length: concurrency }, (_, slot) => runSlot(slot)),
  );
}

main().catch((error) => {
  console.error("[Worker] fatal:", error);
  process.exit(1);
});
