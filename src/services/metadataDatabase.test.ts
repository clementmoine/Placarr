import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  resolveBgg: vi.fn(),
  getIGDBSuggestions: vi.fn(),
}));

// Name database is now selected via the `nameDatabase` trait + the registry
// adapter, so the test mocks that seam rather than the direct provider calls.
vi.mock("@/services/providerRegistry", () => ({
  PROVIDERS: [
    { id: "boardgamegeek", types: ["boardgames"], nameDatabase: true, weight: 0.9 },
    { id: "igdb", types: ["games"], nameDatabase: true, weight: 0.85 },
  ],
}));

vi.mock("@/services/metadataResolvers", () => ({
  getMetadataProviderAdapter: (id: string) =>
    id === "boardgamegeek" ? { id, resolve: h.resolveBgg } : undefined,
}));

vi.mock("@/services/providers/igdb", () => ({
  getIGDBSuggestions: h.getIGDBSuggestions,
}));

vi.mock("@/services/providers/tmdb", () => ({
  parseTMDBSeriesIntent: (name: string) => ({
    searchTitle: name,
    isSeriesLike: false,
    seasonNumber: null,
  }),
}));

import { confrontWithDatabase } from "@/services/metadataDatabase";

beforeEach(() => {
  for (const fn of Object.values(h)) fn.mockReset();
});

describe("confrontWithDatabase", () => {
  it("returns null when the type database has no match", async () => {
    h.resolveBgg.mockResolvedValue(null);

    await expect(
      confrontWithDatabase("Mille Sabords Gigamic neuf", "boardgames"),
    ).resolves.toBeNull();
  });

  it("returns the resolved title when the type database matches", async () => {
    h.resolveBgg.mockResolvedValue({ title: "Mille Sabords" });

    await expect(
      confrontWithDatabase("Mille Sabords Gigamic", "boardgames"),
    ).resolves.toBe("Mille Sabords");
  });

  it("routes to the type's `nameDatabase` provider, by name", async () => {
    h.resolveBgg.mockResolvedValue({ title: "Mille Sabords" });

    await confrontWithDatabase("Mille Sabords", "boardgames");

    expect(h.resolveBgg).toHaveBeenCalledTimes(1);
    expect(h.resolveBgg).toHaveBeenCalledWith(
      expect.objectContaining({ name: expect.any(String) }),
    );
  });

  it("returns null when no type or no searchable name is available", async () => {
    await expect(confrontWithDatabase("Anything", null)).resolves.toBeNull();
    await expect(confrontWithDatabase("", "games")).resolves.toBeNull();
  });
});
