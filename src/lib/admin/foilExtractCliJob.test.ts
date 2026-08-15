import { describe, expect, it, vi, beforeEach } from "vitest";

const updateMany = vi.fn();
const create = vi.fn();

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    backgroundWorkJob: {
      updateMany: (...args: unknown[]) => updateMany(...args),
      create: (...args: unknown[]) => create(...args),
    },
  },
}));

vi.mock("@/core/collect/jobs/workQueue", () => ({
  BACKGROUND_WORK_KIND: { catalogueExtract: "foilExtract" },
  BACKGROUND_WORK_STATUS: {
    pending: "pending",
    running: "running",
    cancelled: "cancelled",
    completed: "completed",
    failed: "failed",
  },
  completeBackgroundWorkJob: vi.fn(),
  failBackgroundWorkJob: vi.fn(),
  isBackgroundWorkJobCancelled: vi.fn().mockResolvedValue(false),
  touchBackgroundWorkJobLock: vi.fn(),
}));

vi.mock("@/lib/admin/catalogueExtractLog", () => ({
  beginCatalogueExtractLog: vi.fn(),
  appendCatalogueExtractLog: vi.fn(),
}));

describe("foilExtractCliJob", () => {
  beforeEach(() => {
    updateMany.mockReset();
    create.mockReset();
    updateMany.mockResolvedValue({ count: 0 });
    create.mockResolvedValue({
      id: "job-cli-1",
      kind: "foilExtract",
      status: "running",
    });
  });

  it("adopts a running foil job owned by the CLI pid", async () => {
    const { adoptCliFoilExtractJob } = await import("./foilExtractCliJob");
    const job = await adoptCliFoilExtractJob("pokemon");
    expect(job.id).toBe("job-cli-1");
    expect(updateMany).toHaveBeenCalled();
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          kind: "foilExtract",
          status: "running",
          userId: null,
          payload: expect.objectContaining({
            target: "pokemon",
            source: "cli",
          }),
          lockedBy: expect.stringMatching(/^cli:/),
        }),
      }),
    );
  });
});
