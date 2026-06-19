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
  fetchAndStoreMetadata: vi.fn(),
  downloadRemoteImage: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireGuestOrHigher: h.requireGuestOrHigher,
}));
vi.mock("@/lib/prisma", () => ({
  prisma: { item: h.item, shelf: h.shelf },
}));
vi.mock("@/services/metadata", () => ({
  fetchAndStoreMetadata: h.fetchAndStoreMetadata,
  downloadRemoteImage: h.downloadRemoteImage,
}));
vi.mock("@/lib/presentItem", () => ({
  presentItem: (i: { id: string }) => ({ presented: "full", id: i.id }),
  presentItemFromStorage: (i: { id: string }) => ({
    presented: "storage",
    id: i.id,
  }),
}));
vi.mock("@/lib/resolveIds", () => ({
  resolveShelfId: async (id: string) => id,
  resolveItemId: async (id: string) => id,
}));
vi.mock("@/lib/slugs", () => ({ slugify: (s: string) => `slug-${s}` }));
vi.mock("@/lib/itemSearch", () => ({ buildItemSearchConditions: () => [] }));

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
    h.fetchAndStoreMetadata,
    h.downloadRemoteImage,
  ]) {
    fn.mockReset();
  }
  h.downloadRemoteImage.mockImplementation(async (u: string) => u);
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
