import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  resolveBgg: vi.fn(),
  suggestIgdb: vi.fn(),
  getProviderModule: vi.fn(),
  mockProviders: [
    {
      id: "boardgamegeek",
      types: ["boardgames"],
      nameDatabase: true,
      weight: 0.9,
    },
    { id: "igdb", types: ["games"], nameDatabase: true, weight: 0.85 },
    {
      id: "openlibrary",
      types: ["books"],
      nameDatabase: true,
      weight: 0.85,
    },
  ],
}));

vi.mock("@/services/provider/registry", () => ({
  PROVIDERS: h.mockProviders,
  nameDatabaseProviderForType: (type: string) =>
    h.mockProviders
      .filter(
        (provider) =>
          provider.nameDatabase &&
          provider.types.some((mediaType) => mediaType === type),
      )
      .sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0))[0],
  getProviderModule: h.getProviderModule,
}));

vi.mock("@/services/provider/bootstrap", () => ({
  getMetadataProviderAdapter: (id: string) =>
    id === "boardgamegeek" ? { id, resolve: h.resolveBgg } : undefined,
}));

import {
  confrontWithDatabase,
  getDatabaseSuggestions,
} from "@/services/metadata/database";

beforeEach(() => {
  h.resolveBgg.mockReset();
  h.suggestIgdb.mockReset();
  h.getProviderModule.mockReset();
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

describe("getDatabaseSuggestions", () => {
  it("delegates to the name-database provider module hook", async () => {
    h.getProviderModule.mockReturnValue({
      suggestDatabaseTitles: h.suggestIgdb,
    });
    h.suggestIgdb.mockResolvedValue(["Hades", "Hades II"]);

    await expect(
      getDatabaseSuggestions("Hades", "games", "PC"),
    ).resolves.toEqual(["Hades", "Hades II"]);

    expect(h.getProviderModule).toHaveBeenCalledWith("igdb");
    expect(h.suggestIgdb).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Hades",
        cleanedName: "Hades",
        platform: "PC",
      }),
    );
  });

  it("returns an empty list when the provider module has no suggestion hook", async () => {
    h.getProviderModule.mockReturnValue({});

    await expect(getDatabaseSuggestions("Catan", "boardgames")).resolves.toEqual(
      [],
    );
  });
});
