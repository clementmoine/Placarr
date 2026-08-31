import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const h = vi.hoisted(() => ({
  requireGuestOrHigher: vi.fn(),
  item: {
    create: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    deleteMany: vi.fn(),
  },
  shelf: { findUnique: vi.fn() },
  resolveShelfId: vi.fn(),
  resolveItemId: vi.fn(),
  scheduleBatchItemMetadataRefresh: vi.fn(),
  stampItemMetadataRefresh: vi.fn(),
  transaction: vi.fn(),
  resolveUniquePrintCandidate: vi.fn(),
  supportsPrintSearch: vi.fn(),
  shelfPrintSearchScope: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireGuestOrHigher: h.requireGuestOrHigher,
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    item: h.item,
    shelf: h.shelf,
    $transaction: h.transaction,
  },
}));
vi.mock(
  "@/core/collect/jobs/scheduleMetadataRefresh",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("@/core/collect/jobs/scheduleMetadataRefresh")
      >();
    return {
      ...actual,
      scheduleBatchItemMetadataRefresh: h.scheduleBatchItemMetadataRefresh,
    };
  },
);
vi.mock("@/lib/routing/resolveIds", () => ({
  resolveShelfId: h.resolveShelfId,
  resolveItemId: h.resolveItemId,
}));
vi.mock("@/core/collect/jobs/metadataRefreshSession", () => ({
  stampItemMetadataRefresh: h.stampItemMetadataRefresh,
}));
vi.mock("@/lib/routing/itemSlug", () => ({
  allocateUniqueItemSlug: vi.fn(
    async (_shelfId: string, name: string) => `slug-${name}`,
  ),
}));
vi.mock("@/lib/routing/slugs", () => ({
  slugifyItemName: (value: string) => `slug-${value}`,
}));
vi.mock("@/core/identify/printSearch", () => ({
  resolveUniquePrintCandidate: h.resolveUniquePrintCandidate,
  supportsPrintSearch: h.supportsPrintSearch,
}));
vi.mock("@/lib/collect/shelfPrintSearchScope", () => ({
  shelfPrintSearchScope: h.shelfPrintSearchScope,
}));

import { POST, PATCH, PUT, DELETE } from "./route";

const USER = { user: { id: "u1", role: "user" } };

function withBody(
  body: unknown,
  method: "POST" | "PATCH" | "PUT" | "DELETE" = "POST",
) {
  return new NextRequest("http://localhost/api/items/batch", {
    method,
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  for (const fn of [
    h.requireGuestOrHigher,
    h.item.create,
    h.item.findMany,
    h.item.update,
    h.item.updateMany,
    h.item.deleteMany,
    h.shelf.findUnique,
    h.resolveShelfId,
    h.resolveItemId,
    h.scheduleBatchItemMetadataRefresh,
    h.stampItemMetadataRefresh,
    h.transaction,
    h.resolveUniquePrintCandidate,
    h.supportsPrintSearch,
    h.shelfPrintSearchScope,
  ]) {
    fn.mockReset();
  }
  h.requireGuestOrHigher.mockResolvedValue(USER);
  h.resolveShelfId.mockImplementation(async (id: string) => id);
  h.supportsPrintSearch.mockReturnValue(false);
  h.resolveUniquePrintCandidate.mockResolvedValue(null);
  h.shelfPrintSearchScope.mockResolvedValue({});
  h.item.findMany.mockResolvedValue([]);
  h.shelf.findUnique.mockResolvedValue({
    type: "books",
    userId: "u1",
    name: "Mangas",
  });
});

describe("POST /api/items/batch", () => {
  it("creates every volume and queues background metadata refresh", async () => {
    h.transaction.mockImplementation(async (ops: Promise<unknown>[]) =>
      Promise.all(ops),
    );
    h.item.create
      .mockResolvedValueOnce({ id: "i1", name: "Naruto Tome 01" })
      .mockResolvedValueOnce({ id: "i2", name: "Naruto Tome 02" });

    const res = await POST(
      withBody({
        shelfId: "shelf-1",
        names: ["Naruto Tome 01", "Naruto Tome 02"],
        condition: "used",
      }),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ count: 2 });
    expect(h.item.create).toHaveBeenCalledTimes(2);
    expect(h.scheduleBatchItemMetadataRefresh).toHaveBeenCalledWith(
      [
        { itemId: "i1", lookupQuery: "Naruto Tome 01" },
        { itemId: "i2", lookupQuery: "Naruto Tome 02" },
      ],
      { type: "books", userId: "u1", name: "Mangas" },
    );
  });

  it("resolves TCG collector codes to catalog title + printKey", async () => {
    h.shelf.findUnique.mockResolvedValue({
      type: "tcg",
      userId: "u1",
      name: "Lorcana",
    });
    h.supportsPrintSearch.mockReturnValue(true);
    h.shelfPrintSearchScope.mockResolvedValue({
      providerId: "lorcanajson",
      language: "fr",
    });
    h.resolveUniquePrintCandidate.mockResolvedValue({
      printKey: "lorcana:1-1",
      title: "Ariel - Sur une mission",
      reference: "Premier Chapitre · 1",
    });
    h.transaction.mockImplementation(async (ops: Promise<unknown>[]) =>
      Promise.all(ops),
    );
    h.item.create.mockResolvedValueOnce({
      id: "i1",
      name: "Ariel - Sur une mission",
    });

    const res = await POST(
      withBody({
        shelfId: "shelf-tcg",
        names: ["TFC#001"],
        condition: "used",
      }),
    );

    expect(res.status).toBe(200);
    expect(h.shelfPrintSearchScope).toHaveBeenCalledWith({
      type: "tcg",
      shelfName: "Lorcana",
      owned: [],
    });
    expect(h.resolveUniquePrintCandidate).toHaveBeenCalledWith("TFC#001", "tcg", {
      providerId: "lorcanajson",
      language: "fr",
    });
    expect(h.item.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: "Ariel - Sur une mission",
          printKey: "lorcana:1-1",
        }),
      }),
    );
    expect(h.scheduleBatchItemMetadataRefresh).toHaveBeenCalledWith(
      [{ itemId: "i1", lookupQuery: "Ariel - Sur une mission" }],
      { type: "tcg", userId: "u1", name: "Lorcana" },
    );
  });

  it("falls back outside the shelf catalogue when the scoped lookup misses", async () => {
    h.shelf.findUnique.mockResolvedValue({
      type: "tcg",
      userId: "u1",
      name: "Naruto Ultra Challenge",
    });
    h.supportsPrintSearch.mockReturnValue(true);
    h.shelfPrintSearchScope.mockResolvedValue({
      providerId: "narutoultra",
      language: "fr",
    });
    h.resolveUniquePrintCandidate
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        printKey: "lorcana:1-7",
        title: "Stitch - Rock Star",
        reference: "Premier Chapitre · 7",
      });
    h.transaction.mockImplementation(async (ops: Promise<unknown>[]) =>
      Promise.all(ops),
    );
    h.item.create.mockResolvedValueOnce({
      id: "i1",
      name: "Stitch - Rock Star",
    });

    const res = await POST(
      withBody({
        shelfId: "shelf-uc",
        names: ["stitch"],
      }),
    );

    expect(res.status).toBe(200);
    expect(h.resolveUniquePrintCandidate).toHaveBeenNthCalledWith(
      1,
      "stitch",
      "tcg",
      { providerId: "narutoultra", language: "fr" },
    );
    expect(h.resolveUniquePrintCandidate).toHaveBeenNthCalledWith(
      2,
      "stitch",
      "tcg",
    );
    expect(h.item.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: "Stitch - Rock Star",
          printKey: "lorcana:1-7",
        }),
      }),
    );
  });

  it("rejects empty batches", async () => {
    const res = await POST(
      withBody({
        shelfId: "shelf-1",
        names: [],
      }),
    );

    expect(res.status).toBe(400);
  });

  it("blocks guests", async () => {
    h.requireGuestOrHigher.mockResolvedValue(
      NextResponse.json({ error: "x" }, { status: 403 }),
    );

    const res = await POST(
      withBody({
        shelfId: "shelf-1",
        names: ["Naruto Tome 01"],
      }),
    );

    expect(res.status).toBe(403);
  });
});

describe("PATCH /api/items/batch", () => {
  it("moves items to the target shelf", async () => {
    h.resolveItemId.mockImplementation(async (id: string) => id);
    h.shelf.findUnique.mockResolvedValue({
      id: "ps5",
      userId: "u1",
      type: "games",
      name: "PlayStation 5",
    });
    h.item.findMany.mockResolvedValue([
      {
        id: "i1",
        userId: "u1",
        shelfId: "ps4",
        name: "Spider-Man 2",
        barcode: "123",
        imageUrl: "https://example.com/cover.jpg",
        backgroundImageUrl: null,
      },
      {
        id: "i2",
        userId: "u1",
        shelfId: "ps4",
        name: "Horizon",
        barcode: null,
        imageUrl: null,
        backgroundImageUrl: null,
      },
    ]);
    h.transaction.mockImplementation(async (ops: Promise<unknown>[]) =>
      Promise.all(ops),
    );
    h.item.update.mockResolvedValue({});

    const res = await PATCH(
      withBody(
        {
          itemIds: ["i1", "i2"],
          targetShelfId: "ps5",
          sourceShelfId: "ps4",
        },
        "PATCH",
      ),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      count: 2,
      targetShelfId: "ps5",
      sourceShelfIds: ["ps4"],
    });
    expect(h.item.update).toHaveBeenCalledTimes(2);
    expect(h.item.update.mock.calls[0][0].data).toMatchObject({
      shelfId: "ps5",
      slug: "slug-Spider-Man 2",
      metadataId: null,
      imageUrl: null,
    });
    expect(h.item.update.mock.calls[1][0].data).toMatchObject({
      shelfId: "ps5",
      slug: "slug-Horizon",
    });
    expect(h.scheduleBatchItemMetadataRefresh).toHaveBeenCalledWith(
      [
        { itemId: "i1", lookupQuery: "Spider-Man 2", barcode: "123" },
        { itemId: "i2", lookupQuery: "Horizon", barcode: null },
      ],
      { type: "games", name: "PlayStation 5" },
    );
  });

  it("rejects empty item lists", async () => {
    const res = await PATCH(
      withBody(
        {
          itemIds: [],
          targetShelfId: "ps5",
        },
        "PATCH",
      ),
    );

    expect(res.status).toBe(400);
  });
});

describe("PUT /api/items/batch", () => {
  it("queues metadata refresh for selected items", async () => {
    h.resolveItemId.mockImplementation(async (id: string) => id);
    h.item.findMany.mockResolvedValue([
      {
        id: "i1",
        userId: "u1",
        shelfId: "ps5",
        name: "Spider-Man 2",
        barcode: "123",
        imageUrl: null,
        backgroundImageUrl: null,
        metadata: { title: "Marvel's Spider-Man 2" },
        shelf: { type: "games", name: "PlayStation 5" },
      },
    ]);
    h.item.updateMany.mockResolvedValue({ count: 1 });
    h.stampItemMetadataRefresh.mockResolvedValue({
      generation: 1,
      startedAt: new Date(),
    });

    const res = await PUT(
      withBody(
        {
          itemIds: ["i1"],
          sourceShelfId: "ps5",
        },
        "PUT",
      ),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ count: 1 });
    expect(h.stampItemMetadataRefresh).toHaveBeenCalledWith("i1");
    expect(h.scheduleBatchItemMetadataRefresh).toHaveBeenCalledWith(
      [{ itemId: "i1", lookupQuery: "Marvel's Spider-Man 2", barcode: "123" }],
      { type: "games", name: "PlayStation 5" },
    );
  });
});

describe("DELETE /api/items/batch", () => {
  it("deletes selected items", async () => {
    h.resolveItemId.mockImplementation(async (id: string) => id);
    h.item.findMany.mockResolvedValue([
      {
        id: "i1",
        userId: "u1",
        shelfId: "shelf-1",
        name: "Tome 01",
        barcode: null,
        imageUrl: null,
        backgroundImageUrl: null,
        metadata: null,
        shelf: { type: "books", name: "Mangas" },
      },
      {
        id: "i2",
        userId: "u1",
        shelfId: "shelf-1",
        name: "Tome 02",
        barcode: null,
        imageUrl: null,
        backgroundImageUrl: null,
        metadata: null,
        shelf: { type: "books", name: "Mangas" },
      },
    ]);
    h.item.deleteMany.mockResolvedValue({ count: 2 });

    const res = await DELETE(
      withBody(
        {
          itemIds: ["i1", "i2"],
          sourceShelfId: "shelf-1",
        },
        "DELETE",
      ),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      count: 2,
      sourceShelfIds: ["shelf-1"],
    });
    expect(h.item.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ["i1", "i2"] } },
    });
  });

  it("rejects empty item lists", async () => {
    const res = await DELETE(
      withBody(
        {
          itemIds: [],
          sourceShelfId: "shelf-1",
        },
        "DELETE",
      ),
    );

    expect(res.status).toBe(400);
  });

  it("blocks guests", async () => {
    h.requireGuestOrHigher.mockResolvedValue({
      user: { id: "g1", role: "guest" },
    });

    const res = await DELETE(
      withBody(
        {
          itemIds: ["i1"],
          sourceShelfId: "shelf-1",
        },
        "DELETE",
      ),
    );

    expect(res.status).toBe(403);
  });
});
