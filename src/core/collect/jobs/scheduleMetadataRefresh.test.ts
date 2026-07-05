import { after } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  scheduleItemMetadataRefresh,
  shelfMoveMetadataResetData,
  startItemMetadataRefresh,
} from "./scheduleMetadataRefresh";
import { resetMetadataRefreshSessionsForTests } from "./metadataRefreshSession";

vi.mock("next/server", () => ({
  after: vi.fn(),
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

vi.mock("@/core/enrich", () => ({
  fetchAndStoreMetadata: vi.fn().mockResolvedValue({ id: "meta-1" }),
}));

import { prisma } from "@/lib/db/prisma";
import { fetchAndStoreMetadata } from "@/core/enrich";

const mockedUpdate = vi.mocked(prisma.item.update);
const mockedUpdateMany = vi.mocked(prisma.item.updateMany);
const mockedFindUnique = vi.mocked(prisma.item.findUnique);
const mockedFetchAndStore = vi.mocked(fetchAndStoreMetadata);
const mockedAfter = vi.mocked(after);

function mockRefreshSession(generation = 1) {
  const startedAt = new Date("2026-06-27T12:00:00.000Z");
  mockedUpdate.mockResolvedValueOnce({
    metadataRefreshGeneration: generation,
  } as never);
  return {
    generation,
    startedAt,
    signal: new AbortController().signal,
  };
}

describe("scheduleItemMetadataRefresh", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetMetadataRefreshSessionsForTests();
    mockedUpdate.mockResolvedValue({ metadataRefreshGeneration: 1 } as never);
    mockedUpdateMany.mockResolvedValue({ count: 1 } as never);
    mockedFindUnique.mockResolvedValue({ imageUrl: null } as never);
  });

  it("marks refresh started then schedules background work", async () => {
    const result = await startItemMetadataRefresh({
      itemId: "item-1",
      lookupQuery: "Test Book",
      shelfType: "books",
      shelfName: "Livres",
    });

    expect(result.startedAt).toBeInstanceOf(Date);
    expect(result.generation).toBe(1);
    expect(mockedUpdate).toHaveBeenCalledWith({
      where: { id: "item-1" },
      data: {
        metadataRefreshStartedAt: result.startedAt,
        metadataRefreshGeneration: { increment: 1 },
      },
      select: { metadataRefreshGeneration: true },
    });
    expect(mockedAfter).toHaveBeenCalledTimes(1);
    expect(mockedFetchAndStore).not.toHaveBeenCalled();
  });

  it("schedules background work without blocking the caller", () => {
    const session = mockRefreshSession(3);
    scheduleItemMetadataRefresh(
      {
        itemId: "item-3",
        lookupQuery: "Another Book",
        shelfType: "books",
        shelfName: "Livres",
      },
      session,
    );

    expect(mockedAfter).toHaveBeenCalledTimes(1);
    expect(mockedFetchAndStore).not.toHaveBeenCalled();
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
