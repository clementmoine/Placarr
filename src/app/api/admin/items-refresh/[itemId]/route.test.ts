import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const h = vi.hoisted(() => ({
  authReturn: { user: { role: "admin" } } as unknown,
  item: {
    findUnique: vi.fn(),
  },
  startItemMetadataRefresh: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireAdmin: vi.fn(async () => h.authReturn),
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    item: h.item,
  },
}));
vi.mock("@/lib/jobs/scheduleMetadataRefresh", () => ({
  startItemMetadataRefresh: h.startItemMetadataRefresh,
}));
vi.mock("@/lib/item/present", () => ({
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
    h.startItemMetadataRefresh.mockReset();
    h.startItemMetadataRefresh.mockResolvedValue({
      startedAt: new Date("2026-06-27T12:00:00.000Z"),
      generation: 1,
    });
  });

  it("renvoie directement la réponse d'auth quand non-admin", async () => {
    h.authReturn = NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 },
    );

    const response = await POST(post(), context);

    expect(response.status).toBe(401);
    expect(h.startItemMetadataRefresh).not.toHaveBeenCalled();
  });

  it("planifie le refresh metadata de l'item demandé", async () => {
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

    const response = await POST(post(), context);
    const payload = await response.json();

    expect(response.status).toBe(202);
    expect(payload.ok).toBe(true);
    expect(payload.accepted).toBe(true);
    expect(h.startItemMetadataRefresh).toHaveBeenCalledWith({
      itemId: "i1",
      lookupQuery: "CATAN",
      shelfType: "boardgames",
      barcode: "3558380126133",
      shelfName: "Jeux de société",
    });
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

    await POST(post({ lookupQuery: "Titre corrigé" }), context);

    expect(h.startItemMetadataRefresh).toHaveBeenCalledWith({
      itemId: "i1",
      lookupQuery: "Titre corrigé",
      shelfType: "games",
      barcode: null,
      shelfName: "PS5",
    });
  });
});
