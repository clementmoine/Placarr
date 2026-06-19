import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const h = vi.hoisted(() => ({
  authReturn: { user: { role: "admin" } } as unknown,
  item: {
    findMany: vi.fn(),
  },
}));

vi.mock("@/lib/auth", () => ({
  requireAdmin: vi.fn(async () => h.authReturn),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    item: h.item,
  },
}));

import { GET } from "./route";

describe("GET /api/admin/items-refresh", () => {
  beforeEach(() => {
    h.authReturn = { user: { role: "admin" } } as unknown;
    h.item.findMany.mockReset();
  });

  it("renvoie directement la réponse d'auth quand non-admin", async () => {
    h.authReturn = NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 },
    );

    const response = await GET();

    expect(response.status).toBe(401);
    expect(h.item.findMany).not.toHaveBeenCalled();
  });

  it("liste les items avec les dates sérialisées", async () => {
    h.item.findMany.mockResolvedValue([
      {
        id: "i1",
        name: "Catan",
        imageUrl: "/uploads/catan.jpg",
        barcode: "3558380126133",
        condition: "used",
        createdAt: new Date("2026-01-01T10:00:00.000Z"),
        updatedAt: new Date("2026-01-02T10:00:00.000Z"),
        shelf: { id: "s1", name: "Jeux", type: "boardgames" },
        user: { id: "u1", name: "Admin", email: "admin@example.com" },
        metadata: {
          id: "m1",
          title: "CATAN",
          imageUrl: "/uploads/catan-meta.jpg",
          lastFetched: new Date("2026-01-03T10:00:00.000Z"),
        },
      },
    ]);

    const response = await GET();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.total).toBe(1);
    expect(payload.items[0].metadata.lastFetched).toBe(
      "2026-01-03T10:00:00.000Z",
    );
  });
});
