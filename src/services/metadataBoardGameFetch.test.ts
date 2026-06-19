import { describe, expect, it, vi, beforeEach } from "vitest";

const { bggResolve, wikidataResolve, philibertResolve, scraperFetch } =
  vi.hoisted(() => ({
    bggResolve: vi.fn(),
    wikidataResolve: vi.fn(),
    philibertResolve: vi.fn(),
    scraperFetch:
      vi.fn<
        (barcode: string) => Promise<Array<{ name: string; coverUrl?: string }>>
      >(),
  }));

vi.mock("@/services/metadataResolvers", () => ({
  metadataProviderResolverMap: new Map([
    ["boardgamegeek", { id: "boardgamegeek", resolve: bggResolve }],
    ["wikidata", { id: "wikidata", resolve: wikidataResolve }],
    ["philibert", { id: "philibert", resolve: philibertResolve }],
  ]),
}));

vi.mock("@/services/providers/achatmoinscher", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@/services/providers/achatmoinscher")
    >();
  return {
    ...actual,
    fetchFromAchatMoinsCher: scraperFetch,
  };
});

import { fetchFromAllBoardGameSources } from "@/services/metadataBoardGameFetch";

const BARCODE = "3558380126133";

describe("fetchFromAllBoardGameSources", () => {
  beforeEach(() => {
    bggResolve.mockReset();
    wikidataResolve.mockReset();
    philibertResolve.mockReset();
    scraperFetch.mockReset();
    scraperFetch.mockResolvedValue([]);
  });

  it("fusionne BGG, Wikidata et Philibert avec fieldEvidence", async () => {
    bggResolve.mockResolvedValue({
      title: "Catan",
      description: "Trade and build.",
      facts: [
        { kind: "players", label: "Joueurs", value: "3-4", source: "bgg" },
      ],
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
    expect(
      result?.fieldEvidence?.some((entry) => entry.source === "BoardGameGeek"),
    ).toBe(true);
    expect(
      result?.fieldEvidence?.some((entry) => entry.source === "Wikidata"),
    ).toBe(true);
    expect(
      result?.fieldEvidence?.some((entry) => entry.source === "Philibert"),
    ).toBe(true);
  });

  it("retourne null si aucune source ne répond", async () => {
    bggResolve.mockResolvedValue(null);
    wikidataResolve.mockResolvedValue(null);
    philibertResolve.mockResolvedValue(null);

    const result = await fetchFromAllBoardGameSources("Inconnu");
    expect(result).toBeNull();
  });

  it("n'appelle pas le scraper quand une source fournit titre + couverture", async () => {
    bggResolve.mockResolvedValue({
      title: "Catan",
      imageUrl: "https://cdn/catan.jpg",
    });
    wikidataResolve.mockResolvedValue(null);
    philibertResolve.mockResolvedValue(null);

    const result = await fetchFromAllBoardGameSources("Catan", BARCODE);

    expect(result?.title).toBe("Catan");
    expect(scraperFetch).not.toHaveBeenCalled();
  });

  it("déclenche le scraper en fallback couverture quand aucune source n'a d'image", async () => {
    bggResolve.mockResolvedValue({ title: "Catan" });
    wikidataResolve.mockResolvedValue(null);
    philibertResolve.mockResolvedValue(null);
    scraperFetch.mockResolvedValue([
      { name: "Catan", coverUrl: "https://cdn/box.jpg" },
    ]);

    const result = await fetchFromAllBoardGameSources("Catan", BARCODE);

    expect(scraperFetch).toHaveBeenCalledTimes(1);
    expect(result?.imageUrl).toContain("box.jpg");
  });

  it("déclenche le scraper quand aucune métadonnée primaire n'est trouvée", async () => {
    bggResolve.mockResolvedValue(null);
    wikidataResolve.mockResolvedValue(null);
    philibertResolve.mockResolvedValue(null);
    scraperFetch.mockResolvedValue([
      { name: "Catan (boîte)", coverUrl: "https://cdn/box.jpg" },
    ]);

    const result = await fetchFromAllBoardGameSources("Catan", BARCODE);

    expect(scraperFetch).toHaveBeenCalledTimes(1);
    expect(result).not.toBeNull();
    expect(result?.title).toBeTruthy();
  });

  it("ignore un provider qui rejette (allSettled) sans faire échouer la résolution", async () => {
    bggResolve.mockRejectedValue(new Error("BGG 401"));
    wikidataResolve.mockResolvedValue({
      title: "Catan",
      imageUrl: "https://cdn/wikidata.jpg",
    });
    philibertResolve.mockResolvedValue(null);

    const result = await fetchFromAllBoardGameSources("Catan", BARCODE);

    expect(result?.title).toBe("Catan");
    expect(scraperFetch).not.toHaveBeenCalled();
  });
});
