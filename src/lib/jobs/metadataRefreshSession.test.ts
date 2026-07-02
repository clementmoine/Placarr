import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  beginItemMetadataRefresh,
  finishItemMetadataRefresh,
  isItemMetadataRefreshCurrent,
  resetMetadataRefreshSessionsForTests,
} from "./metadataRefreshSession";

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    item: {
      update: vi.fn(),
      updateMany: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/db/prisma";

const mockedUpdate = vi.mocked(prisma.item.update);
const mockedUpdateMany = vi.mocked(prisma.item.updateMany);
const mockedFindUnique = vi.mocked(prisma.item.findUnique);

describe("metadataRefreshSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetMetadataRefreshSessionsForTests();
    mockedUpdateMany.mockResolvedValue({ count: 1 } as never);
  });

  it("aborts the previous in-flight refresh when a new one starts", async () => {
    mockedUpdate
      .mockResolvedValueOnce({ metadataRefreshGeneration: 1 } as never)
      .mockResolvedValueOnce({ metadataRefreshGeneration: 2 } as never);

    const first = await beginItemMetadataRefresh("item-1");
    const second = await beginItemMetadataRefresh("item-1");

    expect(first.generation).toBe(1);
    expect(second.generation).toBe(2);
    expect(first.signal.aborted).toBe(true);
    expect(second.signal.aborted).toBe(false);
  });

  it("tracks whether a generation is still current", async () => {
    mockedUpdate.mockResolvedValueOnce({
      metadataRefreshGeneration: 4,
    } as never);
    mockedFindUnique.mockResolvedValueOnce({
      metadataRefreshGeneration: 4,
    } as never);

    const session = await beginItemMetadataRefresh("item-2");
    await expect(
      isItemMetadataRefreshCurrent("item-2", session.generation),
    ).resolves.toBe(true);
  });

  it("clears the spinner only for the matching generation", async () => {
    mockedUpdate.mockResolvedValueOnce({
      metadataRefreshGeneration: 5,
    } as never);

    const session = await beginItemMetadataRefresh("item-3");
    await finishItemMetadataRefresh("item-3", session.generation);

    expect(mockedUpdateMany).toHaveBeenCalledWith({
      where: { id: "item-3", metadataRefreshGeneration: 5 },
      data: { metadataRefreshStartedAt: null },
    });
  });
});
