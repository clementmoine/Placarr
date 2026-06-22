import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  fetchFromBGG: vi.fn(),
  fetchFromDeezer: vi.fn(),
  fetchFromOpenLibrary: vi.fn(),
  fetchFromTMDB: vi.fn(),
  fetchFromIGDB: vi.fn(),
  getIGDBSuggestions: vi.fn(),
}));

vi.mock("@/services/metadataResolvers", () => ({
  fetchFromBGG: h.fetchFromBGG,
  fetchFromDeezer: h.fetchFromDeezer,
  fetchFromOpenLibrary: h.fetchFromOpenLibrary,
  fetchFromTMDB: h.fetchFromTMDB,
}));

vi.mock("@/services/providers/igdb", () => ({
  fetchFromIGDB: h.fetchFromIGDB,
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
    h.fetchFromBGG.mockResolvedValue(null);

    await expect(
      confrontWithDatabase("Mille Sabords Gigamic neuf", "boardgames"),
    ).resolves.toBeNull();
  });

  it("returns the resolved title when the type database matches", async () => {
    h.fetchFromBGG.mockResolvedValue({ title: "Mille Sabords" });

    await expect(
      confrontWithDatabase("Mille Sabords Gigamic", "boardgames"),
    ).resolves.toBe("Mille Sabords");
  });

  it("returns null when no type or no searchable name is available", async () => {
    await expect(confrontWithDatabase("Anything", null)).resolves.toBeNull();
    await expect(confrontWithDatabase("", "games")).resolves.toBeNull();
  });
});
