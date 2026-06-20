import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const h = vi.hoisted(() => ({
  authReturn: { user: { role: "admin" } } as unknown,
  item: {
    findUnique: vi.fn(),
  },
  fetchAndStoreMetadata: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireAdmin: vi.fn(async () => h.authReturn),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    item: h.item,
  },
}));
vi.mock("@/services/metadata", () => ({
  fetchAndStoreMetadata: h.fetchAndStoreMetadata,
}));
vi.mock("@/lib/presentItem", () => ({
  presentItemFromStorage: (item: { id: string }) => ({
    id: item.id,
    presented: true,
  }),
}));

import { POST } from "./route";

function post(body: unknown = {}) {
  return new NextRequest("http://localhost/api/admin/items-refresh/i1", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

const context = { params: Promise.resolve({ itemId: "i1" }) };

describe("POST /api/admin/items-refresh/[itemId]", () => {
  beforeEach(() => {
    h.authReturn = { user: { role: "admin" } } as unknown;
    h.item.findUnique.mockReset();
    h.fetchAndStoreMetadata.mockReset();
  });

  it("renvoie directement la réponse d'auth quand non-admin", async () => {
    h.authReturn = NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 },
    );

    const response = await POST(post(), context);

    expect(response.status).toBe(401);
    expect(h.fetchAndStoreMetadata).not.toHaveBeenCalled();
  });

  it("force le refresh metadata de l'item demandé", async () => {
    h.item.findUnique
      .mockResolvedValueOnce({
        id: "i1",
        name: "Catan",
        barcode: "3558380126133",
        shelf: { type: "boardgames", name: "Jeux de société" },
        metadata: { title: "CATAN" },
      })
      .mockResolvedValueOnce({
        id: "i1",
        shelf: { type: "boardgames" },
        metadata: {
          attachments: [],
          authors: [],
          publishers: [],
        },
      });
    h.fetchAndStoreMetadata.mockResolvedValue({ title: "CATAN" });

    const response = await POST(post(), context);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(h.fetchAndStoreMetadata).toHaveBeenCalledWith(
      "i1",
      "CATAN",
      "boardgames",
      "3558380126133",
      true,
      "Jeux de société",
      true, // explicit refresh bypasses the short-lived lookup cache
      true, // isBackground
    );
  });

  it("utilise lookupQuery quand fourni", async () => {
    h.item.findUnique
      .mockResolvedValueOnce({
        id: "i1",
        name: "Nom stocké",
        barcode: null,
        shelf: { type: "games", name: "PS5" },
        metadata: { title: "Ancien titre" },
      })
      .mockResolvedValueOnce({
        id: "i1",
        shelf: { type: "games" },
        metadata: null,
      });
    h.fetchAndStoreMetadata.mockResolvedValue(null);

    await POST(post({ lookupQuery: "Titre corrigé" }), context);

    expect(h.fetchAndStoreMetadata).toHaveBeenCalledWith(
      "i1",
      "Titre corrigé",
      "games",
      undefined,
      true,
      "PS5",
      true, // explicit refresh bypasses the short-lived lookup cache
      true, // isBackground
    );
  });
});
