import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const h = vi.hoisted(() => ({
  authReturn: { user: { role: "admin" } } as unknown,
  item: {
    findMany: vi.fn(),
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

import { GET, POST } from "./route";

function post(url = "/api/admin/metadata-enrich") {
  return new NextRequest(`http://localhost${url}`, { method: "POST" });
}

describe("GET /api/admin/metadata-enrich", () => {
  beforeEach(() => {
    h.authReturn = { user: { role: "admin" } } as unknown;
    h.item.findMany.mockReset();
  });

  it("renvoie 401 si non-admin", async () => {
    h.authReturn = NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 },
    );

    const response = await GET();
    expect(response.status).toBe(401);
  });

  it("renvoie la liste des items admissibles à l'enrichissement", async () => {
    h.item.findMany.mockResolvedValue([
      { id: "i1", name: "Zelda GC", barcode: "123" },
    ]);

    const response = await GET();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.total).toBe(1);
    expect(payload.items[0].name).toBe("Zelda GC");
  });
});

describe("POST /api/admin/metadata-enrich", () => {
  beforeEach(() => {
    h.authReturn = { user: { role: "admin" } } as unknown;
    h.item.findMany.mockReset();
    h.fetchAndStoreMetadata.mockReset();
  });

  it("met en file le rattrapage sur les items admissibles", async () => {
    h.item.findMany.mockResolvedValue([
      {
        id: "i1",
        name: "Zelda GC",
        barcode: "123",
        shelf: { type: "games", name: "GameCube" },
        metadata: { title: "Zelda" },
      },
    ]);
    h.fetchAndStoreMetadata.mockResolvedValue({ title: "Zelda" });

    const response = await POST(post());
    const payload = await response.json();

    expect(response.status).toBe(202);
    expect(payload.acceptedCount).toBe(1);
    expect(payload.itemIds).toEqual(["i1"]);
    expect(h.fetchAndStoreMetadata).not.toHaveBeenCalled();
  });
});
