import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  shelfMoveMetadataResetData,
  startItemMetadataRefresh,
} from "./scheduleMetadataRefresh";
import { resetMetadataRefreshSessionsForTests } from "./metadataRefreshSession";

const h = vi.hoisted(() => ({
  enqueueBackgroundWorkJob: vi.fn(),
  stampItemMetadataRefresh: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    item: {
      update: vi.fn(),
      updateMany: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("@/core/collect/jobs/workQueue", () => ({
  BACKGROUND_WORK_KIND: {
    metadataRefresh: "metadataRefresh",
    priceRefresh: "priceRefresh",
  },
  enqueueBackgroundWorkJob: h.enqueueBackgroundWorkJob,
}));

vi.mock("./metadataRefreshSession", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("./metadataRefreshSession")>();
  return {
    ...actual,
    stampItemMetadataRefresh: h.stampItemMetadataRefresh,
  };
});

import { prisma } from "@/lib/db/prisma";

const mockedFindUnique = vi.mocked(prisma.item.findUnique);

describe("scheduleItemMetadataRefresh", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetMetadataRefreshSessionsForTests();
    h.enqueueBackgroundWorkJob.mockResolvedValue({ id: "job-1" });
    h.stampItemMetadataRefresh.mockResolvedValue({
      generation: 1,
      startedAt: new Date("2026-06-27T12:00:00.000Z"),
    });
    mockedFindUnique.mockResolvedValue({ userId: "u1" } as never);
  });

  it("stamps refresh then enqueues a worker job without running enrich", async () => {
    const result = await startItemMetadataRefresh({
      itemId: "item-1",
      lookupQuery: "Test Book",
      shelfType: "books",
      shelfName: "Livres",
    });

    expect(result.startedAt).toBeInstanceOf(Date);
    expect(result.generation).toBe(1);
    expect(h.stampItemMetadataRefresh).toHaveBeenCalledWith("item-1");
    await vi.waitFor(() => {
      expect(h.enqueueBackgroundWorkJob).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: "metadataRefresh",
          itemId: "item-1",
          userId: "u1",
          replaceOpenForItem: true,
          payload: expect.objectContaining({
            itemId: "item-1",
            lookupQuery: "Test Book",
            generation: 1,
          }),
        }),
      );
    });
  });

  it("clears the stamp when enqueue fails", async () => {
    h.enqueueBackgroundWorkJob.mockRejectedValueOnce(new Error("db down"));
    const mockedUpdateMany = vi.mocked(prisma.item.updateMany);
    mockedUpdateMany.mockResolvedValue({ count: 1 } as never);

    await expect(
      startItemMetadataRefresh({
        itemId: "item-fail",
        lookupQuery: "Book",
        shelfType: "books",
        shelfName: "Livres",
      }),
    ).rejects.toThrow("db down");

    expect(mockedUpdateMany).toHaveBeenCalledWith({
      where: {
        id: "item-fail",
        metadataRefreshGeneration: 1,
      },
      data: { metadataRefreshStartedAt: null },
    });
  });
});

describe("scheduleBatchItemMetadataRefresh", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.enqueueBackgroundWorkJob.mockResolvedValue({ id: "job-1" });
    h.stampItemMetadataRefresh
      .mockResolvedValueOnce({
        generation: 2,
        startedAt: new Date("2026-06-27T12:00:00.000Z"),
      })
      .mockResolvedValueOnce({
        generation: 3,
        startedAt: new Date("2026-06-27T12:00:01.000Z"),
      });
    mockedFindUnique.mockResolvedValue({ userId: "u1" } as never);
  });

  it("always stamps a new generation even when a refresh flag is already set", async () => {
    const { scheduleBatchItemMetadataRefresh } =
      await import("./scheduleMetadataRefresh");
    scheduleBatchItemMetadataRefresh(
      [
        { itemId: "item-a", lookupQuery: "A" },
        { itemId: "item-b", lookupQuery: "B" },
      ],
      { type: "books", name: "Livres" },
    );

    await vi.waitFor(() => {
      expect(h.stampItemMetadataRefresh).toHaveBeenCalledTimes(2);
      expect(h.enqueueBackgroundWorkJob).toHaveBeenCalledTimes(2);
    });
    expect(h.stampItemMetadataRefresh).toHaveBeenCalledWith("item-a");
    expect(h.stampItemMetadataRefresh).toHaveBeenCalledWith("item-b");
  });
});

describe("shelfMoveMetadataResetData", () => {
  it("clears metadata link and remote covers on shelf move", () => {
    expect(
      shelfMoveMetadataResetData({
        imageUrl: "https://example.com/cover.jpg",
        backgroundImageUrl: "https://example.com/bg.jpg",
      }),
    ).toEqual({
      metadataId: null,
      imageUrl: null,
      backgroundImageUrl: null,
    });
  });

  it("keeps user-provided covers when they are part of the update", () => {
    expect(
      shelfMoveMetadataResetData(
        {
          imageUrl: "https://example.com/cover.jpg",
          backgroundImageUrl: null,
        },
        { imageUrl: "/uploads/custom.jpg" },
      ),
    ).toEqual({
      metadataId: null,
    });
  });
});
