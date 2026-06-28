import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const h = vi.hoisted(() => ({
  requireGuestOrHigher: vi.fn(),
  item: { create: vi.fn(), findMany: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  shelf: { findUnique: vi.fn() },
  resolveShelfId: vi.fn(),
  resolveItemId: vi.fn(),
  scheduleBatchItemMetadataRefresh: vi.fn(),
  transaction: vi.fn(),
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
vi.mock("@/lib/jobs/scheduleMetadataRefresh", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/jobs/scheduleMetadataRefresh")>();
  return {
    ...actual,
    scheduleBatchItemMetadataRefresh: h.scheduleBatchItemMetadataRefresh,
  };
});
vi.mock("@/lib/routing/resolveIds", () => ({
  resolveShelfId: h.resolveShelfId,
  resolveItemId: h.resolveItemId,
}));
vi.mock("@/lib/routing/slugs", () => ({
  slugifyItemName: (value: string) => `slug-${value}`,
}));

import { POST, PATCH, PUT } from "./route";

const USER = { user: { id: "u1", role: "user" } };

function withBody(body: unknown, method: "POST" | "PATCH" | "PUT" = "POST") {
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
    h.shelf.findUnique,
    h.resolveShelfId,
    h.resolveItemId,
    h.scheduleBatchItemMetadataRefresh,
    h.transaction,
  ]) {
    fn.mockReset();
  }
  h.requireGuestOrHigher.mockResolvedValue(USER);
  h.resolveShelfId.mockImplementation(async (id: string) => id);
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
      metadataId: null,
      imageUrl: null,
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
    expect(h.scheduleBatchItemMetadataRefresh).toHaveBeenCalledWith(
      [{ itemId: "i1", lookupQuery: "Marvel's Spider-Man 2", barcode: "123" }],
      { type: "games", name: "PlayStation 5" },
    );
  });
});
