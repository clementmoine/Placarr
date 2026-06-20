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
  fetchFromCoverProject: vi.fn(),
  fetchFromLaunchBox: vi.fn(),
  fetchFromTheGamesDB: vi.fn(),
  fetchMetadataFromPriceCharting: vi.fn(),
  fetchMetadataFromPriceChartingByName: vi.fn(),
  // Helpers de title-matching, stubbés pour un contrôle déterministe du flux.
  collectCanonicalFallbackNames: vi.fn(),
  buildGameMetadataFallbackNames: vi.fn(),
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
    [
      "coverproject",
      { id: "coverproject", resolve: vi.fn().mockResolvedValue(null) },
    ],
    [
      "launchbox",
      { id: "launchbox", resolve: vi.fn().mockResolvedValue(null) },
    ],
    [
      "thegamesdb",
      { id: "thegamesdb", resolve: vi.fn().mockResolvedValue(null) },
    ],
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
vi.mock("@/services/providers/coverproject", () => ({
  fetchFromCoverProject: h.fetchFromCoverProject,
}));
vi.mock("@/services/providers/launchbox", () => ({
  fetchFromLaunchBox: h.fetchFromLaunchBox,
}));
vi.mock("@/services/providers/thegamesdb", () => ({
  fetchFromTheGamesDB: h.fetchFromTheGamesDB,
}));
vi.mock("@/lib/barcodeAlternateNames", () => ({
  loadBarcodeAlternateNames: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/lib/metadataTitleMatching", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/metadataTitleMatching")>();
  return {
    ...actual,
    collectCanonicalFallbackNames: h.collectCanonicalFallbackNames,
    buildGameMetadataFallbackNames: h.buildGameMetadataFallbackNames,
    shouldRecheckScreenScraperMatch: h.shouldRecheckScreenScraperMatch,
    findBetterScreenScraperMatch: h.findBetterScreenScraperMatch,
    isMetadataTitleAligned: h.isMetadataTitleAligned,
  };
});

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
  h.fetchFromCoverProject.mockResolvedValue(null);
  h.fetchFromLaunchBox.mockResolvedValue(null);
  h.fetchFromTheGamesDB.mockResolvedValue(null);
  h.fetchMetadataFromPriceCharting.mockResolvedValue(null);
  h.fetchMetadataFromPriceChartingByName.mockResolvedValue(null);
  // Pas de noms canoniques → les boucles de fallback ne s'exécutent pas (sauf override).
  h.collectCanonicalFallbackNames.mockReturnValue([]);
  h.buildGameMetadataFallbackNames.mockReturnValue([]);
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

  it("utilise le titre PriceCharting quand les autres sources sont absentes", async () => {
    h.fetchMetadataFromPriceCharting.mockResolvedValue({
      title: "Game Boy Player Start-up Disc",
      platform: "PAL Gamecube",
    });
    h.isMetadataTitleAligned.mockImplementation(
      (_meta: { title?: string }, names: string[]) =>
        names.some((name) => name.toLowerCase().includes("game boy player")) ||
        _meta.title?.toLowerCase().includes("game boy player") ||
        false,
    );

    const res = await fetchFromAllGameSources(
      "Game Boy Player",
      "0045496380038",
      "GameCube",
    );

    expect(res?.title).toBe("Game Boy Player Start-up Disc");
    expect(res?.fieldEvidence?.some((e) => e.source === "PriceCharting")).toBe(
      true,
    );
  });

  it("remplace un titre désaligné par le titre PriceCharting aligné", async () => {
    h.ssResolve.mockResolvedValue({ title: "Super Blue Boy Planet" });
    h.fetchMetadataFromPriceCharting.mockResolvedValue({
      title: "Game Boy Player Start-up Disc",
    });
    h.isMetadataTitleAligned.mockImplementation(
      (meta: { title?: string }, names: string[]) => {
        const title = meta.title?.toLowerCase() || "";
        if (title.includes("super blue boy")) return false;
        if (title.includes("game boy player")) return true;
        return names.some((name) => name.toLowerCase().includes("game boy"));
      },
    );

    const res = await fetchFromAllGameSources(
      "Game Boy Player",
      "0045496380038",
      "GameCube",
    );

    expect(res?.title).toBe("Game Boy Player Start-up Disc");
  });

  it("déclenche le fallback ScreenScraper via les noms canoniques quand SS est absent", async () => {
    h.buildGameMetadataFallbackNames.mockReturnValue(["Mario Kart"]);
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
