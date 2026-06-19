import { describe, expect, it, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  igdbResolve: vi.fn(),
  ssResolve: vi.fn(),
  hltbResolve: vi.fn(),
  steamResolve: vi.fn(),
  rawgResolve: vi.fn(),
  steamgridResolve: vi.fn(),
  // Fallback fns appelées directement par l'orchestrateur.
  fetchFromScreenScraper: vi.fn(),
  fetchFromRawg: vi.fn(),
  fetchFromIGDB: vi.fn(),
  fetchFromHowLongToBeat: vi.fn(),
  fetchFromSteamGridDB: vi.fn(),
  fetchMetadataFromPriceCharting: vi.fn(),
  fetchMetadataFromPriceChartingByName: vi.fn(),
  // Helpers de title-matching, stubbés pour un contrôle déterministe du flux.
  collectCanonicalFallbackNames: vi.fn(),
  shouldRecheckScreenScraperMatch: vi.fn(),
  findBetterScreenScraperMatch: vi.fn(),
  isMetadataTitleAligned: vi.fn(),
}));

vi.mock("@/services/metadataResolvers", () => ({
  metadataProviderResolverMap: new Map([
    ["igdb", { id: "igdb", resolve: h.igdbResolve }],
    ["screenscraper", { id: "screenscraper", resolve: h.ssResolve }],
    ["howlongtobeat", { id: "howlongtobeat", resolve: h.hltbResolve }],
    ["steam", { id: "steam", resolve: h.steamResolve }],
    ["rawg", { id: "rawg", resolve: h.rawgResolve }],
    ["steamgriddb", { id: "steamgriddb", resolve: h.steamgridResolve }],
  ]),
  fetchFromScreenScraper: h.fetchFromScreenScraper,
  fetchFromRawg: h.fetchFromRawg,
}));
vi.mock("@/services/metadataProviderSelection", () => ({
  orderedProviderIdsForType: (_type: string, order: string[]) => order,
  isPcLikeGamePlatform: () => false,
}));
vi.mock("@/services/providers/igdb", () => ({
  fetchFromIGDB: h.fetchFromIGDB,
}));
vi.mock("@/services/providers/howlongtobeat", () => ({
  fetchFromHowLongToBeat: h.fetchFromHowLongToBeat,
}));
vi.mock("@/services/providers/steamgriddb", () => ({
  fetchFromSteamGridDB: h.fetchFromSteamGridDB,
}));
vi.mock("@/services/providers/pricecharting", () => ({
  fetchMetadataFromPriceCharting: h.fetchMetadataFromPriceCharting,
}));
vi.mock("@/services/providers/pricecharting/fetch", () => ({
  fetchMetadataFromPriceChartingByName: h.fetchMetadataFromPriceChartingByName,
}));
vi.mock("@/lib/metadataTitleMatching", () => ({
  collectCanonicalFallbackNames: h.collectCanonicalFallbackNames,
  shouldRecheckScreenScraperMatch: h.shouldRecheckScreenScraperMatch,
  findBetterScreenScraperMatch: h.findBetterScreenScraperMatch,
  isMetadataTitleAligned: h.isMetadataTitleAligned,
}));

import { fetchFromAllGameSources } from "@/services/metadataGameFetch";

const BARCODE = "0045496365226";

beforeEach(() => {
  for (const fn of Object.values(h)) fn.mockReset();
  // Tout vide par défaut.
  h.igdbResolve.mockResolvedValue(null);
  h.ssResolve.mockResolvedValue(null);
  h.hltbResolve.mockResolvedValue(null);
  h.steamResolve.mockResolvedValue(null);
  h.rawgResolve.mockResolvedValue(null);
  h.steamgridResolve.mockResolvedValue(null);
  h.fetchFromScreenScraper.mockResolvedValue(null);
  h.fetchFromRawg.mockResolvedValue(null);
  h.fetchFromIGDB.mockResolvedValue(null);
  h.fetchFromHowLongToBeat.mockResolvedValue(null);
  h.fetchFromSteamGridDB.mockResolvedValue(null);
  h.fetchMetadataFromPriceCharting.mockResolvedValue(null);
  h.fetchMetadataFromPriceChartingByName.mockResolvedValue(null);
  // Pas de noms canoniques → les boucles de fallback ne s'exécutent pas (sauf override).
  h.collectCanonicalFallbackNames.mockReturnValue([]);
  h.shouldRecheckScreenScraperMatch.mockReturnValue(false);
  h.findBetterScreenScraperMatch.mockResolvedValue(null);
  h.isMetadataTitleAligned.mockReturnValue(true);
});

describe("fetchFromAllGameSources — orchestration", () => {
  it("retourne null quand aucune source ni PriceCharting ne répond", async () => {
    const res = await fetchFromAllGameSources("Inconnu", BARCODE, "wii");
    expect(res).toBeNull();
  });

  it("fusionne les sources et expose la field-evidence", async () => {
    h.igdbResolve.mockResolvedValue({
      title: "Mario Kart Wii",
      imageUrl: "https://cdn/mk.jpg",
    });
    h.ssResolve.mockResolvedValue({
      title: "Mario Kart Wii",
      description: "Jeu de course.",
    });

    const res = await fetchFromAllGameSources("Mario Kart Wii", BARCODE, "wii");

    expect(res?.title).toBe("Mario Kart Wii");
    expect(res?.fieldEvidence?.some((e) => e.source === "IGDB")).toBe(true);
    expect(res?.fieldEvidence?.some((e) => e.source === "ScreenScraper")).toBe(
      true,
    );
  });

  it("enrichit avec l'âge PEGI issu de PriceCharting", async () => {
    h.igdbResolve.mockResolvedValue({ title: "Mario Kart Wii" });
    h.fetchMetadataFromPriceCharting.mockResolvedValue({ ageRating: "PEGI 3" });

    const res = await fetchFromAllGameSources("Mario Kart Wii", BARCODE, "wii");

    // Passe par le consensus d'âge (value normalisée en « PEGI 3 »).
    expect(
      res?.facts?.some(
        (f) => f.kind === "age-rating" && String(f.value).includes("3"),
      ),
    ).toBe(true);
  });

  it("recherche PriceCharting par nom quand il n'y a pas de code-barres", async () => {
    h.igdbResolve.mockResolvedValue({ title: "Celeste" });

    const res = await fetchFromAllGameSources("Celeste", null, "pc");

    expect(h.fetchMetadataFromPriceChartingByName).toHaveBeenCalled();
    expect(h.fetchMetadataFromPriceCharting).not.toHaveBeenCalled();
    expect(res?.title).toBe("Celeste");
  });

  it("déclenche le fallback ScreenScraper via les noms canoniques quand SS est absent", async () => {
    h.collectCanonicalFallbackNames.mockReturnValue(["Mario Kart"]);
    h.igdbResolve.mockResolvedValue({ title: "Mario Kart Wii" });
    h.ssResolve.mockResolvedValue(null);
    h.fetchFromScreenScraper.mockResolvedValue({
      title: "Mario Kart Wii",
      imageUrl: "https://cdn/ss.jpg",
    });

    const res = await fetchFromAllGameSources("Mario Kart Wii", BARCODE, "wii");

    expect(h.fetchFromScreenScraper).toHaveBeenCalled();
    expect(res?.fieldEvidence?.some((e) => e.source === "ScreenScraper")).toBe(
      true,
    );
  });
});
