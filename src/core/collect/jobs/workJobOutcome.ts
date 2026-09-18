import { BACKGROUND_WORK_STATUS } from "@/core/collect/jobs/workQueue";
import { prisma } from "@/lib/db/prisma";

/** Job was claimed but must not run (cancelled / superseded generation). */
export class BackgroundWorkAbandonedError extends Error {
  readonly reason: "cancelled" | "superseded";

  constructor(reason: "cancelled" | "superseded", message?: string) {
    super(message ?? `Background work ${reason}`);
    this.name = "BackgroundWorkAbandonedError";
    this.reason = reason;
  }
}

export function isBackgroundWorkAbandonedError(
  error: unknown,
): error is BackgroundWorkAbandonedError {
  return error instanceof BackgroundWorkAbandonedError;
}

/** Mark a claimed job as cancelled without retry (superseded / already cancelled). */
export async function abandonBackgroundWorkJob(
  jobId: string,
  reason: string,
): Promise<void> {
  await prisma.backgroundWorkJob.updateMany({
    where: {
      id: jobId,
      status: {
        in: [BACKGROUND_WORK_STATUS.pending, BACKGROUND_WORK_STATUS.running],
      },
    },
    data: {
      status: BACKGROUND_WORK_STATUS.cancelled,
      finishedAt: new Date(),
      lockedAt: null,
      lockedBy: null,
      error: reason.slice(0, 2000),
    },
  });
}
