import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  item: {
    findMany: vi.fn(),
    update: vi.fn(),
  },
  $transaction: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: prismaMock }));

import {
  allocateUniqueItemSlug,
  isLegacyNumericDuplicateSlug,
  reconcileDuplicateItemSlugsOnShelf,
} from "./itemSlug";

describe("isLegacyNumericDuplicateSlug", () => {
  it("flags a second copy that inherited a numeric suffix", () => {
    expect(
      isLegacyNumericDuplicateSlug({
        name: "Need for Speed Most Wanted",
        slug: "need-for-speed-most-wanted-2",
      }),
    ).toBe(true);
  });

  it("keeps a real sequel title slug intact", () => {
    expect(
      isLegacyNumericDuplicateSlug({
        name: "Need for Speed Most Wanted 2",
        slug: "need-for-speed-most-wanted-2",
      }),
    ).toBe(false);
  });
});

describe("allocateUniqueItemSlug", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the base slug when the shelf is free", async () => {
    prismaMock.item.findMany.mockResolvedValue([]);

    await expect(
      allocateUniqueItemSlug("shelf-1", "Need for Speed Most Wanted"),
    ).resolves.toBe("need-for-speed-most-wanted");
  });

  it("suffixes the second copy with -copy-N, not a bare -2", async () => {
    prismaMock.item.findMany.mockResolvedValue([
      { slug: "need-for-speed-most-wanted" },
    ]);

    await expect(
      allocateUniqueItemSlug("shelf-1", "Need for Speed Most Wanted"),
    ).resolves.toBe("need-for-speed-most-wanted-copy-2");
  });

  it("does not steal the slug of a real sequel on the shelf", async () => {
    prismaMock.item.findMany.mockResolvedValue([
      { slug: "need-for-speed-most-wanted-2" },
    ]);

    await expect(
      allocateUniqueItemSlug("shelf-1", "Need for Speed Most Wanted"),
    ).resolves.toBe("need-for-speed-most-wanted");
  });

  it("honours reserved slugs within the same batch", async () => {
    prismaMock.item.findMany.mockResolvedValue([]);

    const reserved = new Set(["need-for-speed-most-wanted"]);
    await expect(
      allocateUniqueItemSlug("shelf-1", "Need for Speed Most Wanted", {
        reserved,
      }),
    ).resolves.toBe("need-for-speed-most-wanted-copy-2");
  });
});

describe("reconcileDuplicateItemSlugsOnShelf", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.$transaction.mockImplementation(async (ops: unknown[]) => {
      for (const op of ops) await op;
    });
    prismaMock.item.update.mockResolvedValue({});
  });

  it("keeps the oldest copy canonical and suffixes later duplicates", async () => {
    prismaMock.item.findMany.mockResolvedValue([
      {
        id: "item-1",
        name: "Need for Speed Most Wanted",
        slug: "need-for-speed-most-wanted",
        createdAt: new Date("2026-01-01"),
      },
      {
        id: "item-2",
        name: "Need for Speed Most Wanted",
        slug: "need-for-speed-most-wanted",
        createdAt: new Date("2026-02-01"),
      },
    ]);

    await expect(reconcileDuplicateItemSlugsOnShelf("shelf-1")).resolves.toBe(
      1,
    );
    expect(prismaMock.item.update).toHaveBeenCalledWith({
      where: { id: "item-2" },
      data: { slug: "need-for-speed-most-wanted-copy-2" },
    });
  });

  it("migrates legacy numeric duplicate slugs without touching sequel titles", async () => {
    prismaMock.item.findMany.mockResolvedValue([
      {
        id: "item-1",
        name: "Need for Speed Most Wanted",
        slug: "need-for-speed-most-wanted",
        createdAt: new Date("2026-01-01"),
      },
      {
        id: "item-2",
        name: "Need for Speed Most Wanted",
        slug: "need-for-speed-most-wanted-2",
        createdAt: new Date("2026-02-01"),
      },
      {
        id: "item-3",
        name: "Need for Speed Most Wanted 2",
        slug: "need-for-speed-most-wanted-2",
        createdAt: new Date("2026-03-01"),
      },
    ]);

    await expect(reconcileDuplicateItemSlugsOnShelf("shelf-1")).resolves.toBe(
      1,
    );
    expect(prismaMock.item.update).toHaveBeenCalledWith({
      where: { id: "item-2" },
      data: { slug: "need-for-speed-most-wanted-copy-2" },
    });
    expect(prismaMock.item.update).not.toHaveBeenCalledWith({
      where: { id: "item-3" },
      data: expect.anything(),
    });
  });
});
