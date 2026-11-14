import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  findMany: vi.fn(),
  findUnique: vi.fn(),
  stamp: vi.fn(),
  enqueue: vi.fn(),
}));

vi.mock("@/core/catalog/catalog", () => ({
  getCatalogProviderModule: (id: string) => {
    if (id === "lorcanatcg") {
      return { printGames: ["lorcana"] };
    }
    if (id === "empty") return { printGames: [] };
    return null;
  },
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    item: {
      findMany: h.findMany,
      findUnique: h.findUnique,
    },
  },
}));

vi.mock("@/core/collect/jobs/metadataRefreshSession", () => ({
  stampItemMetadataRefresh: h.stamp,
}));

vi.mock("@/core/collect/jobs/scheduleMetadataRefresh", () => ({
  enqueueItemMetadataRefresh: h.enqueue,
}));

import {
  enqueuePrintCatalogPropagate,
  printKeyPrefixesForProvider,
} from "./printCatalogPropagate";

describe("printKeyPrefixesForProvider", () => {
  it("maps printGames to printKey prefixes", () => {
    expect(printKeyPrefixesForProvider("lorcanatcg")).toEqual(["lorcana:"]);
  });

  it("returns empty when the module has no printGames", () => {
    expect(printKeyPrefixesForProvider("empty")).toEqual([]);
    expect(printKeyPrefixesForProvider("missing")).toEqual([]);
  });
});

describe("enqueuePrintCatalogPropagate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.stamp.mockResolvedValue({ generation: 1 });
    h.enqueue.mockResolvedValue(undefined);
    h.findUnique.mockResolvedValue({ userId: "u1" });
  });

  it("soft-enqueues auto covers without preserveUserCover", async () => {
    h.findMany.mockResolvedValueOnce([
      {
        id: "item-1",
        name: "Elsa",
        barcode: null,
        userId: "u1",
        shelf: { type: "cards", name: "Lorcana" },
      },
    ]);
    h.findUnique.mockResolvedValue({ userId: "u1", coverMode: "auto" });

    const n = await enqueuePrintCatalogPropagate({ providerId: "lorcanatcg" });
    expect(n).toBe(1);
    expect(h.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        itemId: "item-1",
        clearRemoteCover: false,
        preserveUserCover: false,
        forceRefresh: false,
      }),
      { generation: 1 },
    );
  });

  it("preserves cover when Affiche is pinned", async () => {
    h.findMany.mockResolvedValueOnce([
      {
        id: "item-2",
        name: "Elsa",
        barcode: null,
        userId: "u1",
        shelf: { type: "cards", name: "Lorcana" },
      },
    ]);
    h.findUnique.mockResolvedValue({ userId: "u1", coverMode: "pinned" });

    await enqueuePrintCatalogPropagate({ providerId: "lorcanatcg" });
    expect(h.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        itemId: "item-2",
        preserveUserCover: true,
      }),
      { generation: 1 },
    );
  });

  it("returns 0 when no printGames match", async () => {
    expect(await enqueuePrintCatalogPropagate({ providerId: "empty" })).toBe(0);
    expect(h.findMany).not.toHaveBeenCalled();
  });
});
