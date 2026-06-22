import { describe, expect, it, vi, beforeEach } from "vitest";
import type { MetadataAdapterContext } from "@/types/providerModule";

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
  metadataProviderResolverMap: new Map<
    string,
    { id: string; resolve: (ctx: MetadataAdapterContext) => unknown }
  >([
    ["igdb", { id: "igdb", resolve: (ctx) => h.igdbResolve(ctx.name, ctx.platform) }],
    ["screenscraper", {
      id: "screenscraper",
      resolve: async (ctx) => {
        const first = await h.ssResolve(ctx.name, ctx.barcode, ctx.platform, ctx);
        if (first) return first;
        return h.fetchFromScreenScraper(ctx.name, ctx.barcode, ctx.platform, ctx);
      }
    }],
    ["howlongtobeat", { id: "howlongtobeat", resolve: (ctx) => h.hltbResolve(ctx.name, ctx.platform) }],
    ["steam", { id: "steam", resolve: (ctx) => h.steamResolve(ctx.name) }],
    ["rawg", {
      id: "rawg",
      resolve: async (ctx) => {
        const first = await h.rawgResolve(ctx.name);
        if (first) return first;
        return h.fetchFromRawg(ctx.name);
      }
    }],
    ["steamgriddb", { id: "steamgriddb", resolve: (ctx) => h.steamgridResolve(ctx.name) }],
    ["coverproject", { id: "coverproject", resolve: (ctx) => h.fetchFromCoverProject(ctx.name, ctx.platform) }],
    ["launchbox", { id: "launchbox", resolve: (ctx) => h.fetchFromLaunchBox(ctx.name, ctx.platform) }],
    ["thegamesdb", { id: "thegamesdb", resolve: (ctx) => h.fetchFromTheGamesDB(ctx.name, ctx.platform, ctx.barcode) }],
    ["pricecharting", {
      id: "pricecharting",
      resolve: async (ctx) => {
        const isPal = ctx.barcode ? (ctx.barcode.length === 13 && !ctx.barcode.startsWith("0")) : false;
        if (ctx.barcode) {
          const pcMeta = await h.fetchMetadataFromPriceCharting(ctx.barcode, ctx.name, ctx.platform, isPal);
          if (!pcMeta) return null;
          return {
            title: pcMeta.title || ctx.name,
            barcode: pcMeta.barcode || ctx.barcode,
            imageUrl: pcMeta.coverUrl || undefined,
            facts: pcMeta.ageRating ? [{
              kind: "age-rating",
              label: pcMeta.ageRating.startsWith("PEGI") ? "PEGI" : "PriceCharting",
              value: pcMeta.ageRating.replace(/^PEGI\s*/i, "").trim() || pcMeta.ageRating,
              source: "pricecharting",
              confidence: 0.62,
              priority: 58,
            }] : undefined,
          };
        } else {
          const pcMeta = await h.fetchMetadataFromPriceChartingByName(ctx.name, ctx.platform, isPal);
          if (!pcMeta) return null;
          return {
            title: pcMeta.title || ctx.name,
            barcode: pcMeta.barcode,
            imageUrl: pcMeta.coverUrl || undefined,
            facts: pcMeta.ageRating ? [{
              kind: "age-rating",
              label: pcMeta.ageRating.startsWith("PEGI") ? "PEGI" : "PriceCharting",
              value: pcMeta.ageRating.replace(/^PEGI\s*/i, "").trim() || pcMeta.ageRating,
              source: "pricecharting",
              confidence: 0.62,
              priority: 58,
            }] : undefined,
          };
        }
      }
    }]
  ]),
  fetchFromScreenScraper: h.fetchFromScreenScraper,
  fetchFromRawg: h.fetchFromRawg,
}));
vi.mock("@/services/metadataProviderSelection", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/metadataProviderSelection")>();
  return {
    ...actual,
    orderedProviderIdsForType: (_type: string, order: string[]) => order,
    isPcLikeGamePlatform: () => false,
  };
});
vi.mock("@/services/providers/igdb", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/providers/igdb")>();
  return {
    ...actual,
    fetchFromIGDB: h.fetchFromIGDB,
  };
});
vi.mock("@/services/providers/howlongtobeat", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/providers/howlongtobeat")>();
  return {
    ...actual,
    fetchFromHowLongToBeat: h.fetchFromHowLongToBeat,
  };
});
vi.mock("@/services/providers/steamgriddb", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/providers/steamgriddb")>();
  return {
    ...actual,
    fetchFromSteamGridDB: h.fetchFromSteamGridDB,
  };
});
vi.mock("@/services/providers/pricecharting", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/providers/pricecharting")>();
  return {
    ...actual,
    fetchMetadataFromPriceCharting: h.fetchMetadataFromPriceCharting,
  };
});
vi.mock("@/services/providers/pricecharting/fetch", () => ({
  fetchMetadataFromPriceChartingByName: h.fetchMetadataFromPriceChartingByName,
}));
vi.mock("@/services/providers/coverproject", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/providers/coverproject")>();
  return {
    ...actual,
    fetchFromCoverProject: h.fetchFromCoverProject,
  };
});
vi.mock("@/services/providers/launchbox", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/providers/launchbox")>();
  return {
    ...actual,
    fetchFromLaunchBox: h.fetchFromLaunchBox,
  };
});
vi.mock("@/services/providers/thegamesdb", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/providers/thegamesdb")>();
  return {
    ...actual,
    fetchFromTheGamesDB: h.fetchFromTheGamesDB,
  };
});
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

  it("récupère la durée HowLongToBeat via le titre de base quand le titre complet ne matche pas", async () => {
    // IGDB fournit titre + couverture ; HowLongToBeat ne connaît que « Monopoly ».
    h.igdbResolve.mockResolvedValue({
      title: "Monopoly - Editions Classique Et Monde",
      imageUrl: "https://cdn/monopoly.jpg",
    });
    h.hltbResolve.mockImplementation((name: string) =>
      name.trim().toLowerCase() === "monopoly"
        ? Promise.resolve({
            title: "Monopoly",
            facts: [
              {
                kind: "duration",
                label: "Durée",
                value: "2 h",
                source: "How Long to Beat · Wii",
              },
            ],
          })
        : Promise.resolve(null),
    );
    // Le titre de base figure parmi les noms de repli (cf. buildGameMetadataFallbackNames réel).
    h.buildGameMetadataFallbackNames.mockReturnValue([
      "Monopoly - Editions Classique Et Monde",
      "Monopoly",
    ]);

    const res = await fetchFromAllGameSources(
      "Monopoly - Editions Classique Et Monde",
      "5030931065965",
      "wii",
    );

    // HLTB est rappelé sur « Monopoly » via la passe de repli ; la durée arrive dans le merge.
    expect(h.hltbResolve).toHaveBeenCalledWith("Monopoly", "wii");
    expect(
      res?.facts?.some((f) => f.kind === "duration" && f.value === "2 h"),
    ).toBe(true);
    // Le titre demandé n'est pas détourné par le titre HLTB « Monopoly ».
    expect(res?.title).toBe("Monopoly - Editions Classique Et Monde");
  });

  it("scrape HowLongToBeat même quand IGDB fournit déjà un time-to-beat (confirmation + complétion 100%)", async () => {
    // IGDB fournit titre + couverture + un time-to-beat partiel (sans complétion 100%).
    h.igdbResolve.mockResolvedValue({
      title: "Zelda Game",
      imageUrl: "https://cdn/z.jpg",
      facts: [
        {
          kind: "time-to-beat",
          label: "Histoire",
          value: "46 h",
          source: "How Long to Beat",
        },
      ],
    });
    // HLTB échoue sur le titre complet mais matche un nom de repli, avec la complétion 100%.
    h.hltbResolve.mockImplementation((name: string) =>
      name === "Zelda Game"
        ? Promise.resolve(null)
        : Promise.resolve({
            title: "Zelda Game",
            facts: [
              {
                kind: "completion-time",
                label: "Complétion",
                value: "58 h",
                source: "How Long to Beat · Wii",
              },
            ],
          }),
    );
    h.buildGameMetadataFallbackNames.mockReturnValue([
      "Zelda Game",
      "Zelda Game HD",
    ]);

    const res = await fetchFromAllGameSources("Zelda Game", BARCODE, "wii");

    // HLTB n'est PAS court-circuité par le time-to-beat IGDB : il est rappelé en repli.
    expect(h.hltbResolve).toHaveBeenCalledWith("Zelda Game HD", "wii");
    // Les deux sources cohabitent : time-to-beat IGDB + complétion 100% HLTB.
    expect(
      res?.facts?.some((f) => f.kind === "time-to-beat" && f.value === "46 h"),
    ).toBe(true);
    expect(
      res?.facts?.some(
        (f) => f.kind === "completion-time" && f.value === "58 h",
      ),
    ).toBe(true);
  });

  it("écarte un faux match RAWG dont le titre n'est qu'un fragment générique", async () => {
    h.igdbResolve.mockResolvedValue({
      title: "Raving Rabbids: Travel in Time",
      imageUrl: "https://cdn/rabbids.jpg",
      facts: [
        { kind: "genre", label: "Genres", value: "Party", source: "igdb" },
      ],
    });
    // RAWG matche le mauvais jeu (jeu itch.io « Retour vers le passé ») et tente
    // d'injecter plateforme Web + store itch.io.
    h.rawgResolve.mockResolvedValue({
      title: "Retour vers le passé",
      facts: [
        { kind: "platform", label: "Plateformes", value: "Web", source: "rawg" },
        { kind: "store", label: "Stores", value: "itch.io", source: "rawg" },
      ],
    });

    const res = await fetchFromAllGameSources(
      "The Lapins Crétins : Retour vers le passé",
      BARCODE,
      "wii",
    );

    const facts = res?.facts ?? [];
    // Le bon jeu (IGDB) reste...
    expect(facts.some((f) => f.kind === "genre" && f.value === "Party")).toBe(
      true,
    );
    // ...mais les faits du faux match RAWG sont écartés à la fusion.
    expect(
      facts.some((f) => f.kind === "platform" && /web/i.test(f.value)),
    ).toBe(false);
    expect(facts.some((f) => f.kind === "store" && /itch/i.test(f.value))).toBe(
      false,
    );
  });
});
