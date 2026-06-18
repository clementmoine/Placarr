import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const h = vi.hoisted(() => ({
  authReturn: { user: { role: "admin" } } as unknown,
}));

vi.mock("@/lib/auth", () => ({
  requireAdmin: vi.fn(async () => h.authReturn),
}));

import { GET } from "./route";

const TMDB_API_KEY = "TMDB_API_KEY";

describe("GET /api/admin/providers", () => {
  beforeEach(() => {
    h.authReturn = { user: { role: "admin" } } as unknown;
    delete process.env[TMDB_API_KEY];
  });

  it("renvoie directement la réponse d'auth quand non-admin", async () => {
    h.authReturn = NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const response = await GET();

    expect(response.status).toBe(401);
  });

  it("signale 'missing' si une capacité n'a aucune source configurée", async () => {
    const response = await GET();
    const payload = await response.json();
    const movies = payload.coverage.find(
      (entry: { type: string }) => entry.type === "movies",
    );
    const rating = movies.capabilities.find(
      (entry: { capability: string }) => entry.capability === "rating",
    );

    expect(rating.providers).toEqual(["tmdb"]);
    expect(rating.configuredCount).toBe(0);
    expect(rating.risk).toBe("missing");
  });

  it("signale 'single-source' quand une seule source est configurée", async () => {
    process.env[TMDB_API_KEY] = "fake-key";

    const response = await GET();
    const payload = await response.json();
    const movies = payload.coverage.find(
      (entry: { type: string }) => entry.type === "movies",
    );
    const rating = movies.capabilities.find(
      (entry: { capability: string }) => entry.capability === "rating",
    );

    expect(rating.providers).toEqual(["tmdb"]);
    expect(rating.configuredCount).toBe(1);
    expect(rating.risk).toBe("single-source");
  });
});
