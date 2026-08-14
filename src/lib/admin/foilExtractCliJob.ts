/**
 * Register a CLI foil extract as a running `BackgroundWorkJob` so the app
 * header menu can show / cancel it (same surface as admin-enqueued extracts).
 *
 * The interactive worker will not claim another foil while this lock is fresh.
 */
import {
  BACKGROUND_WORK_KIND,
  BACKGROUND_WORK_STATUS,
  completeBackgroundWorkJob,
  failBackgroundWorkJob,
  isBackgroundWorkJobCancelled,
  touchBackgroundWorkJobLock,
  type BackgroundWorkJobRow,
} from "@/core/collect/jobs/workQueue";
import { prisma } from "@/lib/db/prisma";
import {
  beginFoilExtractLog,
  appendFoilExtractLog,
} from "@/lib/admin/foilExtractLog";
import type { FoilExtractTarget } from "@/lib/admin/foilExtractRunner";

const HEARTBEAT_MS = 60_000;
const CANCEL_POLL_MS = 2_000;

export type CliFoilJobHandle = {
  jobId: string;
  signal: AbortSignal;
};

/**
 * Create a `running` foilExtract row (replaces any open foil job), heartbeat
 * until `run` settles, then complete / fail / leave cancelled.
 *
 * If the database is unreachable, logs a warning and runs without registration.
 */
export async function withCliFoilExtractJob<T>(
  target: FoilExtractTarget,
  run: (ctx: CliFoilJobHandle) => Promise<T>,
  options?: { disabled?: boolean },
): Promise<T> {
  if (options?.disabled) {
    const controller = new AbortController();
    return run({ jobId: "local", signal: controller.signal });
  }

  let job: BackgroundWorkJobRow;
  try {
    job = await adoptCliFoilExtractJob(target);
  } catch (error) {
    console.warn(
      `[foilExtract] could not register background job (${String(error)}) — continuing without UI tracking`,
    );
    const controller = new AbortController();
    return run({ jobId: "local", signal: controller.signal });
  }

  console.log(
    `[foilExtract] registered jobId=${job.id} target=${target} (visible in background jobs)`,
  );
  await beginFoilExtractLog(target, [
    `jobId=${job.id}`,
    "status=running",
    "source=cli",
    `pid=${process.pid}`,
  ]);

  const controller = new AbortController();
  const heartbeat = setInterval(() => {
    void touchBackgroundWorkJobLock(job.id);
  }, HEARTBEAT_MS);
  if (typeof heartbeat.unref === "function") heartbeat.unref();
  void touchBackgroundWorkJobLock(job.id);

  const cancelPoll = setInterval(() => {
    void isBackgroundWorkJobCancelled(job.id).then((cancelled) => {
      if (cancelled && !controller.signal.aborted) {
        controller.abort();
        void appendFoilExtractLog(target, "cancelled from UI");
      }
    });
  }, CANCEL_POLL_MS);
  if (typeof cancelPoll.unref === "function") cancelPoll.unref();

  try {
    const result = await run({ jobId: job.id, signal: controller.signal });
    if (
      controller.signal.aborted ||
      (await isBackgroundWorkJobCancelled(job.id))
    ) {
      return result;
    }
    await completeBackgroundWorkJob(job.id);
    await appendFoilExtractLog(target, "── done (cli)");
    return result;
  } catch (error) {
    if (
      controller.signal.aborted ||
      (await isBackgroundWorkJobCancelled(job.id))
    ) {
      throw error;
    }
    const message = error instanceof Error ? error.message : String(error);
    await failBackgroundWorkJob(job.id, message);
    await appendFoilExtractLog(target, `── failed: ${message}`);
    throw error;
  } finally {
    clearInterval(heartbeat);
    clearInterval(cancelPoll);
  }
}

/** Insert a running foil job owned by this CLI process. */
export async function adoptCliFoilExtractJob(
  target: FoilExtractTarget,
): Promise<BackgroundWorkJobRow> {
  const lockedBy = `cli:${process.pid}`;
  // Singleton gate: drop other open foil rows so the menu shows this one.
  await prisma.backgroundWorkJob.updateMany({
    where: {
      kind: BACKGROUND_WORK_KIND.foilExtract,
      status: {
        in: [BACKGROUND_WORK_STATUS.pending, BACKGROUND_WORK_STATUS.running],
      },
    },
    data: {
      status: BACKGROUND_WORK_STATUS.cancelled,
      finishedAt: new Date(),
      lockedAt: null,
      lockedBy: null,
      error: "Superseded by CLI foil extract",
    },
  });

  return prisma.backgroundWorkJob.create({
    data: {
      kind: BACKGROUND_WORK_KIND.foilExtract,
      status: BACKGROUND_WORK_STATUS.running,
      userId: null,
      payload: { target, source: "cli", pid: process.pid },
      runAfter: new Date(),
      lockedAt: new Date(),
      lockedBy,
      attempts: 1,
    },
  });
}
