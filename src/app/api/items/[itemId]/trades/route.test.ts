import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const h = vi.hoisted(() => ({
  requireGuestOrHigher: vi.fn(),
  resolveItemId: vi.fn(),
  item: { findUnique: vi.fn() },
  itemTradeLink: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    upsert: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
  },
}));

vi.mock("@/lib/auth", () => ({
  requireGuestOrHigher: h.requireGuestOrHigher,
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    item: h.item,
    itemTradeLink: h.itemTradeLink,
  },
}));
vi.mock("@/lib/routing/resolveIds", () => ({
  resolveItemId: h.resolveItemId,
}));

import { GET, POST, DELETE } from "./route";

const USER = { user: { id: "u1", role: "user" } };

function req(
  method: "GET" | "POST" | "DELETE",
  body?: unknown,
  search = "",
) {
  return new NextRequest(`http://localhost/api/items/a/trades${search}`, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers:
      body === undefined ? undefined : { "content-type": "application/json" },
  });
}

const params = Promise.resolve({ itemId: "a" });

describe("/api/items/[itemId]/trades", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.requireGuestOrHigher.mockResolvedValue(USER);
    h.resolveItemId.mockImplementation(async (id: string) => id);
    h.item.findUnique.mockResolvedValue({
      id: "a",
      userId: "u1",
      shelfId: "s1",
      name: "Naruto",
    });
  });

  it("GET lists counterparts from both sides", async () => {
    h.itemTradeLink.findMany.mockResolvedValue([
      {
        id: "l1",
        note: null,
        createdAt: new Date("2026-01-01"),
        itemOutId: "a",
        itemInId: "b",
        itemOut: { id: "a", name: "Naruto", slug: "naruto", shelfId: "s1" },
        itemIn: { id: "b", name: "Luffy", slug: "luffy", shelfId: "s1" },
      },
    ]);
    const res = await GET(req("GET"), { params });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.links).toEqual([
      expect.objectContaining({
        role: "out",
        counterpart: expect.objectContaining({ name: "Luffy" }),
      }),
    ]);
  });

  it("POST upserts an out→in link", async () => {
    h.item.findUnique
      .mockResolvedValueOnce({
        id: "a",
        userId: "u1",
        shelfId: "s1",
        name: "Naruto",
      })
      .mockResolvedValueOnce({
        id: "b",
        name: "Luffy",
        slug: "luffy",
        shelfId: "s1",
      })
      .mockResolvedValueOnce({ id: "b", userId: "u1" });
    h.itemTradeLink.upsert.mockResolvedValue({
      id: "l1",
      note: null,
      createdAt: new Date(),
      itemOutId: "a",
      itemInId: "b",
      itemOut: { id: "a", name: "Naruto", slug: "naruto", shelfId: "s1" },
      itemIn: { id: "b", name: "Luffy", slug: "luffy", shelfId: "s1" },
    });

    const res = await POST(req("POST", { counterpartItemId: "b" }), {
      params,
    });
    expect(res.status).toBe(201);
    expect(h.itemTradeLink.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          itemOutId: "a",
          itemInId: "b",
        }),
      }),
    );
  });

  it("DELETE removes by linkId", async () => {
    h.itemTradeLink.findUnique.mockResolvedValue({
      id: "l1",
      itemOutId: "a",
      itemInId: "b",
    });
    h.itemTradeLink.delete.mockResolvedValue({});
    const res = await DELETE(req("DELETE", { linkId: "l1" }), { params });
    expect(res.status).toBe(200);
    expect(h.itemTradeLink.delete).toHaveBeenCalledWith({
      where: { id: "l1" },
    });
  });

  it("blocks guests on POST", async () => {
    h.requireGuestOrHigher.mockResolvedValue(
      NextResponse.json({ error: "x" }, { status: 403 }),
    );
    const res = await POST(req("POST", { counterpartItemId: "b" }), {
      params,
    });
    expect(res.status).toBe(403);
  });
});
