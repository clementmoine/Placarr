import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  BACKGROUND_WORK_KIND,
  BACKGROUND_WORK_STATUS,
  cancelBackgroundWorkJobsForItem,
  claimNextBackgroundWorkJob,
  completeBackgroundWorkJob,
  enqueueBackgroundWorkJob,
  failBackgroundWorkJob,
  hasActiveBackgroundWorkJobForItem,
  recoverStaleRunningBackgroundWorkJobs,
  releaseRunningJobsForWorker,
  resolveWorkerKinds,
  touchBackgroundWorkJobLock,
} from "./workQueue";

const h = vi.hoisted(() => ({
  create: vi.fn(),
  updateMany: vi.fn(),
  update: vi.fn(),
  findFirst: vi.fn(),
  findUnique: vi.fn(),
  findMany: vi.fn(),
  queryRaw: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    backgroundWorkJob: {
      create: h.create,
      updateMany: h.updateMany,
      update: h.update,
      findFirst: h.findFirst,
      findUnique: h.findUnique,
      findMany: h.findMany,
    },
    $queryRaw: h.queryRaw,
  },
}));

describe("workQueue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.create.mockResolvedValue({
      id: "job-1",
      kind: BACKGROUND_WORK_KIND.metadataRefresh,
      status: BACKGROUND_WORK_STATUS.pending,
    });
    h.updateMany.mockResolvedValue({ count: 1 });
    h.findFirst.mockResolvedValue(null);
    h.findUnique.mockResolvedValue({ attempts: 1, status: "running" });
    h.findMany.mockResolvedValue([]);
    h.queryRaw.mockResolvedValue([]);
  });

  it("cancels open jobs for the item then inserts a pending row", async () => {
    await enqueueBackgroundWorkJob({
      kind: BACKGROUND_WORK_KIND.metadataRefresh,
      itemId: "item-1",
      userId: "u1",
      replaceOpenForItem: true,
      payload: {
        itemId: "item-1",
        lookupQuery: "Book",
        shelfType: "books",
        shelfName: "Livres",
        generation: 2,
      },
    });

    expect(h.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          itemId: "item-1",
          kind: BACKGROUND_WORK_KIND.metadataRefresh,
        }),
      }),
    );
    expect(h.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ itemId: "item-1" }),
        data: expect.objectContaining({
          status: BACKGROUND_WORK_STATUS.cancelled,
        }),
      }),
    );
    expect(h.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          kind: BACKGROUND_WORK_KIND.metadataRefresh,
          status: BACKGROUND_WORK_STATUS.pending,
          itemId: "item-1",
          userId: "u1",
        }),
      }),
    );
  });

  it("preserves FIFO createdAt when replacing an open item job", async () => {
    const originalCreatedAt = new Date("2026-07-19T10:00:00.000Z");
    h.findFirst.mockResolvedValueOnce({ createdAt: originalCreatedAt });

    await enqueueBackgroundWorkJob({
      kind: BACKGROUND_WORK_KIND.priceRefresh,
      itemId: "item-1",
      replaceOpenForItem: true,
      payload: {
        id: "item-1",
        name: "Voodoo Vince",
        shelfType: "games",
        shelfName: "Xbox",
      },
    });

    expect(h.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          createdAt: originalCreatedAt,
        }),
      }),
    );
  });

  it("claims the next pending job via SKIP LOCKED", async () => {
    h.queryRaw.mockResolvedValueOnce([
      {
        id: "job-2",
        kind: BACKGROUND_WORK_KIND.priceRefresh,
        status: BACKGROUND_WORK_STATUS.running,
      },
    ]);

    const job = await claimNextBackgroundWorkJob("worker-a");
    expect(job?.id).toBe("job-2");
    expect(h.queryRaw).toHaveBeenCalled();
  });

  it("claims with an interactive kind filter for pool isolation", async () => {
    h.queryRaw.mockResolvedValueOnce([]);
    await claimNextBackgroundWorkJob("worker-a", [
      BACKGROUND_WORK_KIND.metadataRefresh,
      BACKGROUND_WORK_KIND.priceRefresh,
    ]);
    expect(h.queryRaw).toHaveBeenCalled();
  });

  it("resolves WORKER_KINDS aliases", () => {
    expect(resolveWorkerKinds("interactive")).toEqual([
      BACKGROUND_WORK_KIND.metadataRefresh,
      BACKGROUND_WORK_KIND.priceRefresh,
      BACKGROUND_WORK_KIND.catalogueExtract,
      BACKGROUND_WORK_KIND.apkStoreFetch,
    ]);
    expect(resolveWorkerKinds("catalog")).toEqual([
      BACKGROUND_WORK_KIND.icollectCatalogSync,
      BACKGROUND_WORK_KIND.launchboxIndexSync,
      BACKGROUND_WORK_KIND.nointroIndexSync,
      BACKGROUND_WORK_KIND.catalogProviderSync,
    ]);
    expect(resolveWorkerKinds("all")).toBeNull();
    expect(resolveWorkerKinds(undefined)).toBeNull();
    expect(resolveWorkerKinds("icollect")).toEqual([]);
  });

  it("reports active jobs for orphan reconcile", async () => {
    h.findFirst.mockResolvedValueOnce({ id: "job-3" });
    await expect(hasActiveBackgroundWorkJobForItem("item-9")).resolves.toBe(
      true,
    );
  });

  it("cancels open jobs for an item", async () => {
    await cancelBackgroundWorkJobsForItem("item-1");
    expect(h.updateMany).toHaveBeenCalled();
  });

  it("completes a running job", async () => {
    await completeBackgroundWorkJob("job-1");
    expect(h.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "job-1",
          status: BACKGROUND_WORK_STATUS.running,
        },
        data: expect.objectContaining({
          status: BACKGROUND_WORK_STATUS.completed,
          lockedBy: null,
        }),
      }),
    );
    const updateArg = h.updateMany.mock.calls[0]?.[0] as {
      data: Record<string, unknown>;
    };
    // Keep lockedAt so locked→finished duration remains measurable.
    expect(updateArg.data).not.toHaveProperty("lockedAt");
  });

  it("retries a failed job when attempts remain", async () => {
    h.findUnique.mockResolvedValueOnce({ attempts: 1, status: "running" });
    await failBackgroundWorkJob("job-1", new Error("boom"));
    expect(h.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: BACKGROUND_WORK_STATUS.pending,
          error: "boom",
        }),
      }),
    );
  });

  it("marks a job failed after max attempts", async () => {
    h.findUnique.mockResolvedValueOnce({ attempts: 3, status: "running" });
    await failBackgroundWorkJob("job-1", new Error("boom"));
    const failUpdate = h.update.mock.calls[0]?.[0] as {
      data: Record<string, unknown>;
    };
    expect(failUpdate.data).not.toHaveProperty("lockedAt");
    expect(h.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: BACKGROUND_WORK_STATUS.failed,
        }),
      }),
    );
  });

  it("touches a running lock for foil heartbeat", async () => {
    h.updateMany.mockResolvedValueOnce({ count: 1 });
    await expect(touchBackgroundWorkJobLock("job-1")).resolves.toBe(true);
    expect(h.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "job-1",
          status: BACKGROUND_WORK_STATUS.running,
        },
        data: expect.objectContaining({
          lockedAt: expect.any(Date),
        }),
      }),
    );
  });

  it("releases this worker's running jobs on shutdown", async () => {
    h.updateMany.mockResolvedValueOnce({ count: 2 });
    await expect(releaseRunningJobsForWorker("worker-a")).resolves.toBe(2);
    expect(h.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: BACKGROUND_WORK_STATUS.running,
          lockedBy: "worker-a",
        },
        data: expect.objectContaining({
          status: BACKGROUND_WORK_STATUS.pending,
          lockedBy: null,
        }),
      }),
    );
  });

  it("requeues a stale foil lock until max attempts, then abandons", async () => {
    h.findMany.mockResolvedValueOnce([
      {
        id: "foil-1",
        kind: BACKGROUND_WORK_KIND.catalogueExtract,
        attempts: 1,
      },
      {
        id: "foil-2",
        kind: BACKGROUND_WORK_KIND.catalogueExtract,
        attempts: 5,
      },
      { id: "meta-1", kind: BACKGROUND_WORK_KIND.metadataRefresh, attempts: 1 },
    ]);
    h.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 1 });

    const result = await recoverStaleRunningBackgroundWorkJobs(60_000);
    expect(result).toEqual({ requeued: 2, abandoned: 1 });

    const abandonedCall = h.updateMany.mock.calls.find((call) => {
      const data = (call[0] as { data: { status: string } }).data;
      return data.status === BACKGROUND_WORK_STATUS.failed;
    });
    expect(abandonedCall?.[0]).toEqual(
      expect.objectContaining({
        where: expect.objectContaining({ id: "foil-2" }),
        data: expect.objectContaining({
          status: BACKGROUND_WORK_STATUS.failed,
          error: expect.stringContaining("Abandoned stale foil"),
        }),
      }),
    );
  });
});

/**
 * Every pack's extract shares the kind `foilExtract`. An unrestricted "replace
 * the open job of this kind" therefore cancelled a running Lorcana pass because
 * a Pokémon one was queued five seconds later — the Lorcana work was finished
 * and only its status was lost.
 */
describe("replacing an open job of the same kind", () => {
  beforeEach(() => {
    h.updateMany.mockReset();
    h.updateMany.mockResolvedValue({ count: 0 });
    h.create.mockReset();
    h.create.mockResolvedValue({ id: "job" });
  });

  it("only cancels jobs aimed at the same payload target", async () => {
    await enqueueBackgroundWorkJob({
      kind: BACKGROUND_WORK_KIND.catalogueExtract,
      payload: { target: "pokemon", scope: "catalogue" },
      replaceOpenForKind: true,
      replaceOpenPayloadMatch: { path: ["target"], equals: "pokemon" },
    });
    const where = h.updateMany.mock.calls[0]?.[0]?.where;
    expect(where.kind).toBe(BACKGROUND_WORK_KIND.catalogueExtract);
    // A neighbour pack's run must survive.
    expect(where.payload).toEqual({ path: ["target"], equals: "pokemon" });
  });

  it("still sweeps the whole kind when no target is given", async () => {
    // Singleton ticks (catalog index sync) rely on this.
    await enqueueBackgroundWorkJob({
      kind: BACKGROUND_WORK_KIND.catalogueExtract,
      payload: {},
      replaceOpenForKind: true,
    });
    expect(h.updateMany.mock.calls[0]?.[0]?.where?.payload).toBeUndefined();
  });
});
