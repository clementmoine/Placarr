import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const h = vi.hoisted(() => ({
  requireGuestOrHigher: vi.fn(),
  summarizeShelfItemPrices: vi.fn(),
  shelf: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  item: { findMany: vi.fn() },
  barcodeCache: { findMany: vi.fn() },
}));

vi.mock("@/services/pricing/resolver", () => ({
  summarizeShelfItemPrices: h.summarizeShelfItemPrices,
}));

vi.mock("@/lib/auth", () => ({
  requireGuestOrHigher: h.requireGuestOrHigher,
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: { shelf: h.shelf, item: h.item, barcodeCache: h.barcodeCache },
}));
vi.mock("@/lib/item/present", () => ({
  itemListMetadataInclude: { select: { id: true } },
  presentItemFromStorage: (i: { id: string }) => ({ id: i.id }),
}));
vi.mock("@/lib/routing/resolveIds", () => ({
  resolveShelfId: async (id: string) => id,
}));
vi.mock("@/lib/routing/slugs", () => ({ slugify: (s: string) => `slug-${s}` }));
vi.mock("@/lib/item/search", () => ({ buildItemSearchConditions: () => [] }));

import { GET, POST, PATCH, DELETE } from "./route";

const USER = { user: { id: "u1", role: "user" } };
const ADMIN = { user: { id: "admin", role: "admin" } };
const GUEST = { user: { id: "g1", role: "guest" } };

function get(url: string) {
  return new NextRequest(`http://localhost${url}`);
}
function withBody(method: string, body: unknown) {
  return new NextRequest("http://localhost/api/shelves", {
    method,
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  for (const fn of [
    h.requireGuestOrHigher,
    h.summarizeShelfItemPrices,
    h.shelf.findUnique,
    h.shelf.findMany,
    h.shelf.create,
    h.shelf.update,
    h.shelf.delete,
    h.item.findMany,
    h.barcodeCache.findMany,
  ]) {
    fn.mockReset();
  }
  h.barcodeCache.findMany.mockResolvedValue([]);
  h.item.findMany.mockResolvedValue([]);
  h.summarizeShelfItemPrices.mockResolvedValue(new Map());
});

describe("GET /api/shelves — autorisation & cloisonnement", () => {
  it("401 non authentifié", async () => {
    h.requireGuestOrHigher.mockResolvedValue(
      NextResponse.json({ error: "x" }, { status: 401 }),
    );

    const res = await GET(get("/api/shelves"));

    expect(res.status).toBe(401);
  });

  it("403 sur l'étagère d'un autre user (non admin)", async () => {
    h.requireGuestOrHigher.mockResolvedValue(USER);
    h.shelf.findUnique.mockResolvedValue({ userId: "u2", items: [] });

    const res = await GET(get("/api/shelves?id=s1"));

    expect(res.status).toBe(403);
  });

  it("autorise le propriétaire", async () => {
    h.requireGuestOrHigher.mockResolvedValue(USER);
    h.shelf.findUnique.mockResolvedValue({ userId: "u1", items: [] });

    const res = await GET(get("/api/shelves?id=s1"));

    expect(res.status).toBe(200);
  });

  it("la liste est cloisonnée à l'utilisateur courant", async () => {
    h.requireGuestOrHigher.mockResolvedValue(USER);
    h.shelf.findMany.mockResolvedValue([]);

    await GET(get("/api/shelves"));

    expect(h.shelf.findMany.mock.calls[0][0].where.userId).toBe("u1");
  });

  it("attache le bestItem = l'item le mieux noté ayant un fond", async () => {
    h.requireGuestOrHigher.mockResolvedValue(USER);
    h.shelf.findMany.mockResolvedValue([{ id: "s1", name: "S", _count: { items: 2 } }]);
    h.item.findMany.mockResolvedValue([
      {
        shelfId: "s1",
        imageUrl: "low.jpg",
        backgroundImageUrl: "low-bg.jpg",
        metadata: { imageUrl: null, heroImageUrl: null, facts: JSON.stringify([{ kind: "rating", value: "6/10" }]) },
      },
      {
        shelfId: "s1",
        imageUrl: "top.jpg",
        backgroundImageUrl: null,
        metadata: { imageUrl: null, heroImageUrl: "top-hero.jpg", facts: JSON.stringify([{ kind: "rating", value: "9/10" }]) },
      },
    ]);

    const res = await GET(get("/api/shelves"));
    const body = await res.json();

    expect(body[0].bestItem).toEqual({
      imageUrl: "top.jpg",
      backgroundImageUrl: "top-hero.jpg",
    });
  });
});

describe("POST /api/shelves — autorisation", () => {
  it("403 pour un invité", async () => {
    h.requireGuestOrHigher.mockResolvedValue(GUEST);

    const res = await POST(withBody("POST", { name: "S", type: "games" }));

    expect(res.status).toBe(403);
    expect(h.shelf.create).not.toHaveBeenCalled();
  });

  it("crée l'étagère avec le userId du propriétaire", async () => {
    h.requireGuestOrHigher.mockResolvedValue(USER);
    h.shelf.create.mockResolvedValue({ id: "s1", items: [] });

    const res = await POST(withBody("POST", { name: "S", type: "games" }));

    expect(res.status).toBe(200);
    expect(h.shelf.create.mock.calls[0][0].data.userId).toBe("u1");
  });
});

describe("PATCH /api/shelves — autorisation", () => {
  it("403 pour un invité", async () => {
    h.requireGuestOrHigher.mockResolvedValue(GUEST);

    const res = await PATCH(withBody("PATCH", { id: "s1", name: "Y" }));

    expect(res.status).toBe(403);
    expect(h.shelf.update).not.toHaveBeenCalled();
  });

  it("403 sur l'étagère d'un autre user", async () => {
    h.requireGuestOrHigher.mockResolvedValue(USER);
    h.shelf.findUnique.mockResolvedValue({ userId: "u2" });

    const res = await PATCH(withBody("PATCH", { id: "s1", name: "Y" }));

    expect(res.status).toBe(403);
    expect(h.shelf.update).not.toHaveBeenCalled();
  });

  it("un admin peut modifier l'étagère d'un autre user", async () => {
    h.requireGuestOrHigher.mockResolvedValue(ADMIN);
    h.shelf.findUnique.mockResolvedValue({ userId: "u2" });
    h.shelf.update.mockResolvedValue({ id: "s1", items: [] });

    const res = await PATCH(withBody("PATCH", { id: "s1", name: "Y" }));

    expect(res.status).toBe(200);
  });
});

describe("DELETE /api/shelves — autorisation", () => {
  it("403 pour un invité", async () => {
    h.requireGuestOrHigher.mockResolvedValue(GUEST);

    const res = await DELETE(get("/api/shelves?id=s1"));

    expect(res.status).toBe(403);
    expect(h.shelf.delete).not.toHaveBeenCalled();
  });

  it("400 quand id manque", async () => {
    h.requireGuestOrHigher.mockResolvedValue(USER);

    const res = await DELETE(get("/api/shelves"));

    expect(res.status).toBe(400);
  });

  it("403 sur l'étagère d'un autre user", async () => {
    h.requireGuestOrHigher.mockResolvedValue(USER);
    h.shelf.findUnique.mockResolvedValue({ userId: "u2" });

    const res = await DELETE(get("/api/shelves?id=s1"));

    expect(res.status).toBe(403);
    expect(h.shelf.delete).not.toHaveBeenCalled();
  });

  it("supprime l'étagère de son propriétaire", async () => {
    h.requireGuestOrHigher.mockResolvedValue(USER);
    h.shelf.findUnique.mockResolvedValue({ userId: "u1" });
    h.shelf.delete.mockResolvedValue({});

    const res = await DELETE(get("/api/shelves?id=s1"));

    expect(res.status).toBe(200);
    expect(h.shelf.delete).toHaveBeenCalled();
  });
});
