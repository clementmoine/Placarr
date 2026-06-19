import { describe, expect, it, vi, beforeEach } from "vitest";

const { bggResolve, wikidataResolve, philibertResolve } = vi.hoisted(() => ({
  bggResolve: vi.fn(),
  wikidataResolve: vi.fn(),
  philibertResolve: vi.fn(),
}));

vi.mock("@/services/metadataResolvers", () => ({
  metadataProviderResolverMap: new Map([
    ["boardgamegeek", { id: "boardgamegeek", resolve: bggResolve }],
    ["wikidata", { id: "wikidata", resolve: wikidataResolve }],
    ["philibert", { id: "philibert", resolve: philibertResolve }],
  ]),
}));

vi.mock("@/services/providers/achatmoinscher", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/providers/achatmoinscher")>();
  return {
    ...actual,
    fetchFromAchatMoinsCher: vi.fn(async () => []),
  };
});

import { fetchFromAllBoardGameSources } from "@/services/metadataBoardGameFetch";

describe("fetchFromAllBoardGameSources", () => {
  beforeEach(() => {
    bggResolve.mockReset();
    wikidataResolve.mockReset();
    philibertResolve.mockReset();
  });

  it("fusionne BGG, Wikidata et Philibert avec fieldEvidence", async () => {
    bggResolve.mockResolvedValue({
      title: "Catan",
      description: "Trade and build.",
      facts: [{ kind: "players", label: "Joueurs", value: "3-4", source: "bgg" }],
    });
    wikidataResolve.mockResolvedValue({
      title: "Les Colons de Catane",
      description: "Jeu de société.",
    });
    philibertResolve.mockResolvedValue({
      title: "Catan",
      description: "Description FR Philibert.",
      imageUrl: "https://cdn1.philibertnet.com/catane.jpg",
    });

    const result = await fetchFromAllBoardGameSources("Catan");

    expect(result?.title).toBe("Catan");
    expect(result?.description).toBe("Description FR Philibert.");
    expect(result?.fieldEvidence?.some((entry) => entry.source === "BoardGameGeek")).toBe(
      true,
    );
    expect(result?.fieldEvidence?.some((entry) => entry.source === "Wikidata")).toBe(
      true,
    );
    expect(result?.fieldEvidence?.some((entry) => entry.source === "Philibert")).toBe(
      true,
    );
  });

  it("retourne null si aucune source ne répond", async () => {
    bggResolve.mockResolvedValue(null);
    wikidataResolve.mockResolvedValue(null);
    philibertResolve.mockResolvedValue(null);

    const result = await fetchFromAllBoardGameSources("Inconnu");
    expect(result).toBeNull();
  });
});
