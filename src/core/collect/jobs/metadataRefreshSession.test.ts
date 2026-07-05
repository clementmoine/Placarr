import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  METADATA_REFRESH_MAX_MS,
  METADATA_REFRESH_ORPHAN_GRACE_MS,
} from "@/core/collect/enrichment";

import {
  beginItemMetadataRefresh,
  finishItemMetadataRefresh,
  isItemMetadataRefreshCurrent,
  reconcileMetadataRefreshFlag,
  reconcileOrphanedMetadataRefreshesForUser,
  resetMetadataRefreshSessionsForTests,
  shouldReconcileMetadataRefreshFlag,
} from "./metadataRefreshSession";

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    item: {
      update: vi.fn(),
      updateMany: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/db/prisma";

const mockedUpdate = vi.mocked(prisma.item.update);
const mockedUpdateMany = vi.mocked(prisma.item.updateMany);
const mockedFindUnique = vi.mocked(prisma.item.findUnique);
const mockedFindMany = vi.mocked(prisma.item.findMany);

describe("metadataRefreshSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
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

  describe("orphan guard", () => {
    const startedAt = new Date("2026-07-04T10:00:00.000Z");

    it("flags orphan refreshes once the grace window elapsed", () => {
      const now = startedAt.getTime() + METADATA_REFRESH_ORPHAN_GRACE_MS;
      expect(
        shouldReconcileMetadataRefreshFlag("orphan-1", startedAt, now),
      ).toBe(true);
    });

    it("keeps recent orphan flags during the grace window", () => {
      const now = startedAt.getTime() + METADATA_REFRESH_ORPHAN_GRACE_MS - 1;
      expect(
        shouldReconcileMetadataRefreshFlag("orphan-1", startedAt, now),
      ).toBe(false);
    });

    it("keeps active sessions until the hard max duration", async () => {
      mockedUpdate.mockResolvedValueOnce({
        metadataRefreshGeneration: 7,
      } as never);

      await beginItemMetadataRefresh("active-1");
      const beforeMax =
        startedAt.getTime() + METADATA_REFRESH_ORPHAN_GRACE_MS + 60_000;
      expect(
        shouldReconcileMetadataRefreshFlag("active-1", startedAt, beforeMax),
      ).toBe(false);

      const atMax = startedAt.getTime() + METADATA_REFRESH_MAX_MS;
      expect(
        shouldReconcileMetadataRefreshFlag("active-1", startedAt, atMax),
      ).toBe(true);
    });

    it("clears orphan flags from the database", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(
        startedAt.getTime() + METADATA_REFRESH_ORPHAN_GRACE_MS + 1_000,
      );

      const cleared = await reconcileMetadataRefreshFlag("orphan-2", startedAt);

      expect(cleared).toBe(true);
      expect(mockedUpdateMany).toHaveBeenCalledWith({
        where: { id: "orphan-2", metadataRefreshStartedAt: startedAt },
        data: { metadataRefreshStartedAt: null },
      });
      vi.useRealTimers();
    });

    it("sweeps all orphan flags for one user", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(
        startedAt.getTime() + METADATA_REFRESH_ORPHAN_GRACE_MS + 1_000,
      );
      mockedFindMany.mockResolvedValueOnce([
        { id: "orphan-a", metadataRefreshStartedAt: startedAt },
        { id: "orphan-b", metadataRefreshStartedAt: startedAt },
      ] as never);

      const reconciled = await reconcileOrphanedMetadataRefreshesForUser("u1");

      expect(reconciled).toBe(2);
      expect(mockedFindMany).toHaveBeenCalledWith({
        where: { userId: "u1", metadataRefreshStartedAt: { not: null } },
        select: { id: true, metadataRefreshStartedAt: true },
      });
      vi.useRealTimers();
    });
  });
});
