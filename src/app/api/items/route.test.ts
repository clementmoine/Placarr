import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const h = vi.hoisted(() => ({
  requireGuestOrHigher: vi.fn(),
  item: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  shelf: { findUnique: vi.fn() },
  metadata: { update: vi.fn() },
  resolveShelfId: vi.fn(),
  resolveItemId: vi.fn(),
  fetchAndStoreMetadata: vi.fn(),
  downloadRemoteImage: vi.fn(),
  startItemMetadataRefresh: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireGuestOrHigher: h.requireGuestOrHigher,
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: { item: h.item, shelf: h.shelf, metadata: h.metadata },
}));
vi.mock("@/services/metadata", () => ({
  fetchAndStoreMetadata: h.fetchAndStoreMetadata,
  downloadRemoteImage: h.downloadRemoteImage,
}));
vi.mock("@/lib/item/present", () => ({
  presentItem: (i: { id: string }) => ({ presented: "full", id: i.id }),
  presentItemFromStorage: (i: { id: string }) => ({
    presented: "storage",
    id: i.id,
  }),
}));
vi.mock("@/lib/routing/resolveIds", () => ({
  resolveShelfId: h.resolveShelfId,
  resolveItemId: h.resolveItemId,
}));
vi.mock("@/lib/routing/slugs", () => ({
  slugifyItemName: (s: string) => `slug-${s}`,
}));
vi.mock("@/lib/item/search", () => ({ buildItemSearchConditions: () => [] }));
vi.mock("@/lib/jobs/scheduleMetadataRefresh", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/jobs/scheduleMetadataRefresh")>();
  return {
    ...actual,
    startItemMetadataRefresh: h.startItemMetadataRefresh,
  };
});
vi.mock("@/services/pricing/itemDisplay", () => ({
  itemPricesContextFromRecord: (item: { id: string }) => ({ id: item.id }),
  readItemPrices: vi.fn().mockResolvedValue({
    priceNew: null,
    priceUsed: null,
    priceUsedCIB: null,
    priceLastUpdated: null,
  }),
  summarizeListItemPrices: vi.fn().mockResolvedValue(new Map()),
  EMPTY_LIST_ITEM_PRICES: {
    priceNew: null,
    priceUsed: null,
    priceUsedCIB: null,
    priceLastUpdated: null,
  },
}));

import { GET, POST, PATCH, DELETE } from "./route";

const USER = { user: { id: "u1", role: "user" } };
const ADMIN = { user: { id: "admin", role: "admin" } };
const GUEST = { user: { id: "g1", role: "guest" } };

function get(url: string) {
  return new NextRequest(`http://localhost${url}`);
}
function withBody(method: string, body: unknown) {
  return new NextRequest("http://localhost/api/items", {
    method,
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  for (const fn of [
    h.requireGuestOrHigher,
    h.item.findUnique,
    h.item.findMany,
    h.item.create,
    h.item.update,
    h.item.delete,
    h.shelf.findUnique,
    h.resolveShelfId,
    h.resolveItemId,
    h.startItemMetadataRefresh,
    h.fetchAndStoreMetadata,
    h.downloadRemoteImage,
  ]) {
    fn.mockReset();
  }
  h.resolveShelfId.mockImplementation(async (id: string) => id);
  h.resolveItemId.mockImplementation(async (id: string) => id);
  h.downloadRemoteImage.mockImplementation(async (u: string) => u);
  h.startItemMetadataRefresh.mockResolvedValue({
    startedAt: new Date("2026-06-27T12:00:00.000Z"),
    generation: 1,
  });
});

describe("GET /api/items — autorisation & cloisonnement", () => {
  it("renvoie la réponse d'auth (401) quand non authentifié", async () => {
    h.requireGuestOrHigher.mockResolvedValue(
      NextResponse.json({ error: "x" }, { status: 401 }),
    );

    const res = await GET(get("/api/items"));

    expect(res.status).toBe(401);
  });

  it("403 sur l'item d'un autre user dans une étagère privée", async () => {
    h.requireGuestOrHigher.mockResolvedValue(USER);
    h.item.findUnique.mockResolvedValue({
      id: "i1",
      userId: "u2",
      shelf: { isPublic: false },
    });

    const res = await GET(get("/api/items?id=i1"));

    expect(res.status).toBe(403);
  });

  it("autorise l'item d'un autre user si l'étagère est publique", async () => {
    h.requireGuestOrHigher.mockResolvedValue(USER);
    h.item.findUnique.mockResolvedValue({
      id: "i1",
      userId: "u2",
      shelf: { isPublic: true },
    });

    const res = await GET(get("/api/items?id=i1"));

    expect(res.status).toBe(200);
  });

  it("404 quand l'item n'existe pas", async () => {
    h.requireGuestOrHigher.mockResolvedValue(USER);
    h.item.findUnique.mockResolvedValue(null);

    const res = await GET(get("/api/items?id=i1"));

    expect(res.status).toBe(404);
  });

  it("restreint la liste aux items de l'utilisateur (non admin)", async () => {
    h.requireGuestOrHigher.mockResolvedValue(USER);
    h.item.findMany.mockResolvedValue([]);

    await GET(get("/api/items?includeMetadata=false"));

    expect(h.item.findMany.mock.calls[0][0].where.userId).toBe("u1");
  });

  it("admin voit tous les items (pas de filtre userId)", async () => {
    h.requireGuestOrHigher.mockResolvedValue(ADMIN);
    h.item.findMany.mockResolvedValue([]);

    await GET(get("/api/items?includeMetadata=false"));

    expect(h.item.findMany.mock.calls[0][0].where.userId).toBeUndefined();
  });

  it("filtre par types d'étagère exclus ou inclus", async () => {
    h.requireGuestOrHigher.mockResolvedValue(USER);
    h.item.findMany.mockResolvedValue([]);

    await GET(
      get("/api/items?excludeShelfTypes=books&shelfTypes=games,movies"),
    );

    expect(h.item.findMany.mock.calls[0][0].where.shelf).toEqual({
      type: { in: ["games", "movies"] },
    });

    h.item.findMany.mockClear();

    await GET(get("/api/items?excludeShelfTypes=books"));

    expect(h.item.findMany.mock.calls[0][0].where.shelf).toEqual({
      type: { notIn: ["books"] },
    });
  });

  it("renvoie 400 pour un type d'étagère invalide", async () => {
    h.requireGuestOrHigher.mockResolvedValue(USER);

    const res = await GET(get("/api/items?shelfTypes=games,nope"));
    const payload = await res.json();

    expect(res.status).toBe(400);
    expect(payload.invalidShelfTypes).toEqual(["nope"]);
    expect(h.item.findMany).not.toHaveBeenCalled();
  });

  it("attache les prix aux listes d'items", async () => {
    const { summarizeListItemPrices } =
      await import("@/services/pricing/itemDisplay");

    h.requireGuestOrHigher.mockResolvedValue(USER);
    h.item.findMany.mockResolvedValue([
      { id: "i1", shelf: { type: "games", name: "PS4" } },
    ]);
    vi.mocked(summarizeListItemPrices).mockResolvedValue(
      new Map([
        [
          "i1",
          {
            priceNew: null,
            priceUsed: 1200,
            priceUsedCIB: null,
            priceLastUpdated: null,
          },
        ],
      ]),
    );

    const res = await GET(get("/api/items"));
    const payload = await res.json();

    expect(payload[0].priceUsed).toBe(1200);
    expect(summarizeListItemPrices).toHaveBeenCalled();
  });
});

describe("POST /api/items — autorisation", () => {
  it("403 pour un invité", async () => {
    h.requireGuestOrHigher.mockResolvedValue(GUEST);

    const res = await POST(withBody("POST", { shelfId: "s1", name: "X" }));

    expect(res.status).toBe(403);
    expect(h.item.create).not.toHaveBeenCalled();
  });

  it("400 quand shelfId manque", async () => {
    h.requireGuestOrHigher.mockResolvedValue(USER);

    const res = await POST(withBody("POST", { name: "X" }));

    expect(res.status).toBe(400);
  });

  it("403 quand l'étagère appartient à un autre user (non admin)", async () => {
    h.requireGuestOrHigher.mockResolvedValue(USER);
    h.shelf.findUnique.mockResolvedValue({
      type: "games",
      userId: "u2",
      name: "S",
    });

    const res = await POST(withBody("POST", { shelfId: "s1", name: "X" }));

    expect(res.status).toBe(403);
    expect(h.item.create).not.toHaveBeenCalled();
  });

  it("crée l'item pour le propriétaire avec son propre userId", async () => {
    h.requireGuestOrHigher.mockResolvedValue(USER);
    h.shelf.findUnique.mockResolvedValue({
      type: "games",
      userId: "u1",
      name: "S",
    });
    h.item.create.mockResolvedValue({ id: "i1", shelf: {} });

    const res = await POST(
      withBody("POST", { shelfId: "s1", name: "X", fetchMetadata: false }),
    );

    expect(res.status).toBe(200);
    expect(h.item.create.mock.calls[0][0].data.userId).toBe("u1");
  });
});

describe("PATCH /api/items — autorisation", () => {
  it("403 pour un invité", async () => {
    h.requireGuestOrHigher.mockResolvedValue(GUEST);

    const res = await PATCH(withBody("PATCH", { id: "i1", name: "Y" }));

    expect(res.status).toBe(403);
    expect(h.item.update).not.toHaveBeenCalled();
  });

  it("403 quand l'item appartient à un autre user", async () => {
    h.requireGuestOrHigher.mockResolvedValue(USER);
    h.item.findUnique.mockResolvedValue({
      userId: "u2",
      shelf: { type: "games" },
    });

    const res = await PATCH(withBody("PATCH", { id: "i1", name: "Y" }));

    expect(res.status).toBe(403);
    expect(h.item.update).not.toHaveBeenCalled();
  });

  it("un admin peut modifier l'item d'un autre user", async () => {
    h.requireGuestOrHigher.mockResolvedValue(ADMIN);
    h.item.findUnique.mockResolvedValue({
      userId: "u2",
      shelf: { type: "games" },
    });
    h.item.update.mockResolvedValue({ id: "i1", shelf: { type: "games" } });

    const res = await PATCH(withBody("PATCH", { id: "i1", name: "Y" }));

    expect(res.status).toBe(200);
    expect(h.item.update).toHaveBeenCalled();
  });

  it("met à jour le titre dans les métadonnées de l'item si elles existent", async () => {
    h.requireGuestOrHigher.mockResolvedValue(USER);
    h.item.findUnique.mockResolvedValue({
      userId: "u1",
      shelf: { type: "games" },
    });
    h.item.update.mockResolvedValue({
      id: "i1",
      metadataId: "m1",
      metadata: { id: "m1", title: "Old Title" },
      shelf: { type: "games" },
    });

    const res = await PATCH(withBody("PATCH", { id: "i1", name: "New Title" }));

    expect(res.status).toBe(200);
    expect(h.item.update).toHaveBeenCalled();
    expect(h.metadata.update).toHaveBeenCalledWith({
      where: { id: "m1" },
      data: { title: "New Title" },
    });
  });

  it("résout l'item avec l'étagère source quand il est déplacé par slug", async () => {
    h.requireGuestOrHigher.mockResolvedValue(USER);
    h.resolveShelfId.mockResolvedValue("target-shelf-id");
    h.resolveItemId.mockResolvedValue("item-id");
    h.item.findUnique.mockResolvedValue({
      userId: "u1",
      shelfId: "source-shelf-id",
      name: "Aladdin",
      barcode: null,
      imageUrl: null,
      backgroundImageUrl: null,
      shelf: { type: "movies", name: "DVD" },
    });
    h.item.update.mockResolvedValue({
      id: "item-id",
      shelfId: "target-shelf-id",
      name: "Aladdin",
      barcode: null,
      shelf: { type: "movies", name: "DVD Disney" },
    });

    const res = await PATCH(
      new NextRequest("http://localhost/api/items?shelfId=dvd", {
        method: "PATCH",
        body: JSON.stringify({
          id: "aladdin",
          name: "Aladdin",
          shelfId: "dvd-disney",
        }),
      }),
    );

    expect(res.status).toBe(200);
    expect(h.resolveShelfId).toHaveBeenCalledWith("dvd-disney", "u1");
    expect(h.resolveItemId).toHaveBeenCalledWith("aladdin", "dvd", "u1");
    expect(h.item.update.mock.calls[0][0].where.id).toBe("item-id");
    expect(h.item.update.mock.calls[0][0].data.shelfId).toBe(
      "target-shelf-id",
    );
    expect(h.startItemMetadataRefresh).toHaveBeenCalled();
  });
});

describe("DELETE /api/items — autorisation", () => {
  it("403 pour un invité", async () => {
    h.requireGuestOrHigher.mockResolvedValue(GUEST);

    const res = await DELETE(get("/api/items?id=i1"));

    expect(res.status).toBe(403);
    expect(h.item.delete).not.toHaveBeenCalled();
  });

  it("400 quand id manque", async () => {
    h.requireGuestOrHigher.mockResolvedValue(USER);

    const res = await DELETE(get("/api/items"));

    expect(res.status).toBe(400);
  });

  it("403 quand l'item appartient à un autre user", async () => {
    h.requireGuestOrHigher.mockResolvedValue(USER);
    h.item.findUnique.mockResolvedValue({ userId: "u2" });

    const res = await DELETE(get("/api/items?id=i1"));

    expect(res.status).toBe(403);
    expect(h.item.delete).not.toHaveBeenCalled();
  });

  it("supprime l'item de son propriétaire", async () => {
    h.requireGuestOrHigher.mockResolvedValue(USER);
    h.item.findUnique.mockResolvedValue({ userId: "u1" });
    h.item.delete.mockResolvedValue({});

    const res = await DELETE(get("/api/items?id=i1"));

    expect(res.status).toBe(200);
    expect(h.item.delete).toHaveBeenCalled();
  });
});
