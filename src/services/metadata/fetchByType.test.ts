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
  shouldRecheckMetadataMatch: vi.fn(),
  findBetterMetadataMatch: vi.fn(),
  isMetadataTitleAligned: vi.fn(),
  openlibraryResolve: vi.fn(),
  googlebooksResolve: vi.fn(),
  tmdbResolve: vi.fn(),
  omdbResolve: vi.fn(),
  musicbrainzResolve: vi.fn(),
  discogsResolve: vi.fn(),
  deezerResolve: vi.fn(),
  bggResolve: vi.fn(),
  wikidataResolve: vi.fn(),
  philibertResolve: vi.fn(),
  scraperFetch:
    vi.fn<
      (barcode: string) => Promise<Array<{ name: string; coverUrl?: string }>>
    >(),
}));

vi.mock("@/services/provider/bootstrap", () => ({
  metadataProviderResolverMap: new Map<
    string,
    { id: string; resolve: (ctx: MetadataAdapterContext) => unknown }
  >([
    [
      "igdb",
      { id: "igdb", resolve: (ctx) => h.igdbResolve(ctx.name, ctx.platform) },
    ],
    [
      "screenscraper",
      {
        id: "screenscraper",
        resolve: async (ctx) => {
          const first = await h.ssResolve(
            ctx.name,
            ctx.barcode,
            ctx.platform,
            ctx,
          );
          if (first) return first;
          return h.fetchFromScreenScraper(
            ctx.name,
            ctx.barcode,
            ctx.platform,
            ctx,
          );
        },
      },
    ],
    [
      "howlongtobeat",
      {
        id: "howlongtobeat",
        resolve: (ctx) => h.hltbResolve(ctx.name, ctx.platform),
      },
    ],
    ["steam", { id: "steam", resolve: (ctx) => h.steamResolve(ctx.name) }],
    [
      "rawg",
      {
        id: "rawg",
        resolve: async (ctx) => {
          const first = await h.rawgResolve(ctx.name);
          if (first) return first;
          return h.fetchFromRawg(ctx.name);
        },
      },
    ],
    [
      "steamgriddb",
      { id: "steamgriddb", resolve: (ctx) => h.steamgridResolve(ctx.name) },
    ],
    [
      "coverproject",
      {
        id: "coverproject",
        resolve: (ctx) => h.fetchFromCoverProject(ctx.name, ctx.platform),
      },
    ],
    [
      "launchbox",
      {
        id: "launchbox",
        resolve: (ctx) => h.fetchFromLaunchBox(ctx.name, ctx.platform),
      },
    ],
    [
      "thegamesdb",
      {
        id: "thegamesdb",
        resolve: (ctx) =>
          h.fetchFromTheGamesDB(ctx.name, ctx.platform, ctx.barcode),
      },
    ],
    [
      "pricecharting",
      {
        id: "pricecharting",
        resolve: async (ctx) => {
          const isPal = ctx.barcode
            ? ctx.barcode.length === 13 && !ctx.barcode.startsWith("0")
            : false;
          if (ctx.barcode) {
            const pcMeta = await h.fetchMetadataFromPriceCharting(
              ctx.barcode,
              ctx.name,
              ctx.platform,
              isPal,
            );
            if (!pcMeta) return null;
            return {
              title: pcMeta.title || ctx.name,
              barcode: pcMeta.barcode || ctx.barcode,
              imageUrl: pcMeta.coverUrl || undefined,
              facts: pcMeta.ageRating
                ? [
                    {
                      kind: "age-rating",
                      label: pcMeta.ageRating.startsWith("PEGI")
                        ? "PEGI"
                        : "PriceCharting",
                      value:
                        pcMeta.ageRating.replace(/^PEGI\s*/i, "").trim() ||
                        pcMeta.ageRating,
                      source: "pricecharting",
                      confidence: 0.62,
                      priority: 58,
                    },
                  ]
                : undefined,
            };
          } else {
            const pcMeta = await h.fetchMetadataFromPriceChartingByName(
              ctx.name,
              ctx.platform,
              isPal,
            );
            if (!pcMeta) return null;
            return {
              title: pcMeta.title || ctx.name,
              barcode: pcMeta.barcode,
              imageUrl: pcMeta.coverUrl || undefined,
              facts: pcMeta.ageRating
                ? [
                    {
                      kind: "age-rating",
                      label: pcMeta.ageRating.startsWith("PEGI")
                        ? "PEGI"
                        : "PriceCharting",
                      value:
                        pcMeta.ageRating.replace(/^PEGI\s*/i, "").trim() ||
                        pcMeta.ageRating,
                      source: "pricecharting",
                      confidence: 0.62,
                      priority: 58,
                    },
                  ]
                : undefined,
            };
          }
        },
      },
    ],
    ["openlibrary", { id: "openlibrary", resolve: h.openlibraryResolve }],
    ["googlebooks", { id: "googlebooks", resolve: h.googlebooksResolve }],
    ["tmdb", { id: "tmdb", resolve: h.tmdbResolve }],
    ["omdb", { id: "omdb", resolve: h.omdbResolve }],
    ["musicbrainz", { id: "musicbrainz", resolve: h.musicbrainzResolve }],
    ["discogs", { id: "discogs", resolve: h.discogsResolve }],
    ["deezer", { id: "deezer", resolve: h.deezerResolve }],
    ["boardgamegeek", { id: "boardgamegeek", resolve: h.bggResolve }],
    ["wikidata", { id: "wikidata", resolve: h.wikidataResolve }],
    ["philibert", { id: "philibert", resolve: h.philibertResolve }],
    [
      "achatmoinscher",
      {
        id: "achatmoinscher",
        resolve: async ({ barcode }) => {
          if (!barcode) return null;
          const products = await h.scraperFetch(barcode);
          const product = products[0];
          if (!product?.name) return null;
          return {
            title: product.name,
            barcode,
            imageUrl: product.coverUrl || undefined,
            attachments: product.coverUrl
              ? [
                  {
                    type: "cover",
                    url: product.coverUrl,
                    source: "achatmoinscher",
                  },
                ]
              : undefined,
          };
        },
      },
    ],
  ]),
  fetchFromScreenScraper: h.fetchFromScreenScraper,
  fetchFromRawg: h.fetchFromRawg,
}));
vi.mock("@/services/metadata/selection", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@/services/metadata/selection")
    >();
  return {
    ...actual,
    orderedProviderIdsForType: (_type: string, order: string[]) => order,
    isPcLikeGamePlatform: () => false,
  };
});
vi.mock("@/services/providers/igdb", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/services/providers/igdb")>();
  return {
    ...actual,
    fetchFromIGDB: h.fetchFromIGDB,
  };
});
vi.mock("@/services/providers/howlongtobeat", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/services/providers/howlongtobeat")>();
  return {
    ...actual,
    fetchFromHowLongToBeat: h.fetchFromHowLongToBeat,
  };
});
vi.mock("@/services/providers/steamgriddb", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/services/providers/steamgriddb")>();
  return {
    ...actual,
    fetchFromSteamGridDB: h.fetchFromSteamGridDB,
  };
});
vi.mock("@/services/providers/pricecharting", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/services/providers/pricecharting")>();
  return {
    ...actual,
    fetchMetadataFromPriceCharting: h.fetchMetadataFromPriceCharting,
  };
});
vi.mock("@/services/providers/pricecharting/fetch", () => ({
  fetchMetadataFromPriceChartingByName: h.fetchMetadataFromPriceChartingByName,
}));
vi.mock("@/services/providers/coverproject", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/services/providers/coverproject")>();
  return {
    ...actual,
    fetchFromCoverProject: h.fetchFromCoverProject,
  };
});
vi.mock("@/services/providers/launchbox", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/services/providers/launchbox")>();
  return {
    ...actual,
    fetchFromLaunchBox: h.fetchFromLaunchBox,
  };
});
vi.mock("@/services/providers/thegamesdb", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/services/providers/thegamesdb")>();
  return {
    ...actual,
    fetchFromTheGamesDB: h.fetchFromTheGamesDB,
  };
});
vi.mock("@/services/providers/achatmoinscher", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@/services/providers/achatmoinscher")
    >();
  return {
    ...actual,
    fetchFromAchatMoinsCher: h.scraperFetch,
  };
});
vi.mock("@/lib/barcode/alternateNames", () => ({
  loadBarcodeAlternateNames: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/lib/metadata/titleMatching", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/metadata/titleMatching")>();
  return {
    ...actual,
    collectCanonicalFallbackNames: h.collectCanonicalFallbackNames,
    buildGameMetadataFallbackNames: h.buildGameMetadataFallbackNames,
    shouldRecheckMetadataMatch: h.shouldRecheckMetadataMatch,
    findBetterMetadataMatch: h.findBetterMetadataMatch,
    isMetadataTitleAligned: h.isMetadataTitleAligned,
  };
});

import {
  fetchFromAllBoardGameSources,
  fetchFromAllBookSources,
  fetchFromAllGameSources,
  fetchFromAllMovieSources,
  fetchFromAllMusicSources,
} from "@/services/metadata/fetchByType";

const GAME_BARCODE = "0045496365226";
const BOARD_GAME_BARCODE = "3558380126133";

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
  h.shouldRecheckMetadataMatch.mockReturnValue(false);
  h.findBetterMetadataMatch.mockResolvedValue(null);
  h.isMetadataTitleAligned.mockReturnValue(true);
  h.scraperFetch.mockResolvedValue([]);
});

describe("fetchFromAllGameSources — orchestration", () => {
  it("retourne null quand aucune source ni PriceCharting ne répond", async () => {
    const res = await fetchFromAllGameSources("Inconnu", GAME_BARCODE, "wii");
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

    const res = await fetchFromAllGameSources("Mario Kart Wii", GAME_BARCODE, "wii");

    expect(res?.title).toBe("Mario Kart Wii");
    expect(res?.fieldEvidence?.some((e) => e.source === "IGDB")).toBe(true);
    expect(res?.fieldEvidence?.some((e) => e.source === "ScreenScraper")).toBe(
      true,
    );
  });

  it("enrichit avec l'âge PEGI issu de PriceCharting", async () => {
    h.igdbResolve.mockResolvedValue({ title: "Mario Kart Wii" });
    h.fetchMetadataFromPriceCharting.mockResolvedValue({ ageRating: "PEGI 3" });

    const res = await fetchFromAllGameSources("Mario Kart Wii", GAME_BARCODE, "wii");

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

    const res = await fetchFromAllGameSources("Mario Kart Wii", GAME_BARCODE, "wii");

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

    const res = await fetchFromAllGameSources("Zelda Game", GAME_BARCODE, "wii");

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
    h.isMetadataTitleAligned.mockImplementation(
      (meta: { title?: string }, names: string[], minScore?: number) => {
        if (meta.title?.toLowerCase() === "retour vers le passé") return false;
        return true;
      },
    );

    h.igdbResolve.mockResolvedValue({
      title: "The Lapins Crétins : Retour vers le passé",
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
        {
          kind: "platform",
          label: "Plateformes",
          value: "Web",
          source: "rawg",
        },
        { kind: "store", label: "Stores", value: "itch.io", source: "rawg" },
      ],
    });

    const res = await fetchFromAllGameSources(
      "The Lapins Crétins : Retour vers le passé",
      GAME_BARCODE,
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

describe("fetchFromAllBookSources", () => {
  beforeEach(() => {
    h.openlibraryResolve.mockReset();
    h.googlebooksResolve.mockReset();
  });

  it("fusionne OpenLibrary et Google Books avec fieldEvidence", async () => {
    h.openlibraryResolve.mockResolvedValue({
      title: "Fantastic Mr. Fox",
      authors: [{ name: "Roald Dahl" }],
    });
    h.googlebooksResolve.mockResolvedValue({
      title: "Fantastic Mr. Fox",
      description: "A clever fox outwits three farmers.",
    });

    const res = await fetchFromAllBookSources(
      "Fantastic Mr. Fox",
      "9780140328721",
    );

    expect(res?.title).toBe("Fantastic Mr. Fox");
    expect(res?.description).toContain("clever fox");
    expect(res?.fieldEvidence?.some((e) => e.source === "OpenLibrary")).toBe(
      true,
    );
    expect(res?.fieldEvidence?.some((e) => e.source === "Google Books")).toBe(
      true,
    );
  });

  it("retourne null si aucune source ne répond", async () => {
    h.openlibraryResolve.mockResolvedValue(null);
    h.googlebooksResolve.mockResolvedValue(null);

    expect(
      await fetchFromAllBookSources("Inconnu", "0000000000000"),
    ).toBeNull();
  });

  it("fonctionne avec une seule source disponible", async () => {
    h.openlibraryResolve.mockResolvedValue(null);
    h.googlebooksResolve.mockResolvedValue({ title: "Solo Book" });

    const res = await fetchFromAllBookSources("Solo Book");

    expect(res?.title).toBe("Solo Book");
  });
});

describe("fetchFromAllMovieSources", () => {
  beforeEach(() => {
    h.tmdbResolve.mockReset();
    h.omdbResolve.mockReset();
  });

  it("passe l'imdb TMDB à OMDb pour enrichir les notes", async () => {
    h.tmdbResolve.mockResolvedValue({
      title: "Pocahontas",
      externalIds: { imdb: "tt0114148" },
      facts: [
        { kind: "rating", label: "TMDB", value: "6,9/10", source: "tmdb" },
      ],
    });
    h.omdbResolve.mockResolvedValue({
      title: "Pocahontas",
      facts: [
        {
          kind: "rating",
          label: "Internet Movie Database",
          value: "6.7/10",
          source: "omdb",
        },
        {
          kind: "rating",
          label: "Metascore",
          value: "59/100",
          source: "omdb",
        },
      ],
    });

    const res = await fetchFromAllMovieSources(
      "Pocahontas: Une légende indienne",
      null,
    );

    expect(h.omdbResolve).toHaveBeenCalledWith(
      expect.objectContaining({
        imdbId: "tt0114148",
      }),
    );
    expect(
      res?.facts?.filter((fact) => fact.kind === "rating").length,
    ).toBeGreaterThanOrEqual(3);
  });

  it("fusionne TMDB et OMDb avec fieldEvidence", async () => {
    h.tmdbResolve.mockResolvedValue({
      title: "Inception",
      description: "Un voleur qui s'infiltre dans les rêves.",
      facts: [{ kind: "rating", label: "TMDB", value: "8.4", source: "tmdb" }],
    });
    h.omdbResolve.mockResolvedValue({
      title: "Inception",
      facts: [{ kind: "rating", label: "IMDb", value: "8.8", source: "omdb" }],
    });

    const res = await fetchFromAllMovieSources("Inception", null);

    expect(res?.title).toBe("Inception");
    expect(res?.fieldEvidence?.some((e) => e.source === "TMDB")).toBe(true);
    expect(res?.fieldEvidence?.some((e) => e.source === "OMDb")).toBe(true);
    expect(res?.facts?.length).toBeGreaterThanOrEqual(2);
  });

  it("retourne null si aucune source ne répond", async () => {
    h.tmdbResolve.mockResolvedValue(null);
    h.omdbResolve.mockResolvedValue(null);

    expect(await fetchFromAllMovieSources("Inconnu", null)).toBeNull();
  });

  it("fonctionne avec une seule source (OMDb seul)", async () => {
    h.tmdbResolve.mockResolvedValue(null);
    h.omdbResolve.mockResolvedValue({ title: "Solo Movie" });

    const res = await fetchFromAllMovieSources("Solo Movie", null);

    expect(res?.title).toBe("Solo Movie");
    expect(res?.fieldEvidence?.some((e) => e.source === "OMDb")).toBe(true);
  });
});

describe("fetchFromAllMusicSources", () => {
  beforeEach(() => {
    h.musicbrainzResolve.mockReset();
    h.discogsResolve.mockReset();
    h.deezerResolve.mockReset();
  });

  it("fusionne MusicBrainz, Discogs et Deezer avec fieldEvidence", async () => {
    h.musicbrainzResolve.mockResolvedValue({
      title: "Discovery",
      authors: [{ name: "Daft Punk" }],
    });
    h.discogsResolve.mockResolvedValue({ title: "Discovery" });
    h.deezerResolve.mockResolvedValue({
      title: "Discovery",
      imageUrl: "https://cdn/discovery.jpg",
    });

    const res = await fetchFromAllMusicSources("Discovery", "0724384960650");

    expect(res?.title).toBe("Discovery");
    expect(res?.fieldEvidence?.some((e) => e.source === "MusicBrainz")).toBe(
      true,
    );
    expect(res?.fieldEvidence?.some((e) => e.source === "Discogs")).toBe(true);
    expect(res?.fieldEvidence?.some((e) => e.source === "Deezer")).toBe(true);
  });

  it("retourne null si aucune source ne répond", async () => {
    h.musicbrainzResolve.mockResolvedValue(null);
    h.discogsResolve.mockResolvedValue(null);
    h.deezerResolve.mockResolvedValue(null);

    expect(
      await fetchFromAllMusicSources("Inconnu", "0000000000000"),
    ).toBeNull();
  });

  it("fonctionne avec une seule source disponible", async () => {
    h.musicbrainzResolve.mockResolvedValue(null);
    h.discogsResolve.mockResolvedValue(null);
    h.deezerResolve.mockResolvedValue({ title: "Solo Album" });

    const res = await fetchFromAllMusicSources("Solo Album");

    expect(res?.title).toBe("Solo Album");
  });
});

describe("fetchFromAllBoardGameSources", () => {
  beforeEach(() => {
    h.bggResolve.mockReset();
    h.wikidataResolve.mockReset();
    h.philibertResolve.mockReset();
    h.scraperFetch.mockReset();
    h.scraperFetch.mockResolvedValue([]);
  });

  it("fusionne BGG, Wikidata et Philibert avec fieldEvidence", async () => {
    h.bggResolve.mockResolvedValue({
      title: "Catan",
      description: "Trade and build.",
      facts: [
        { kind: "players", label: "Joueurs", value: "3-4", source: "bgg" },
      ],
    });
    h.wikidataResolve.mockResolvedValue({
      title: "Les Colons de Catane",
      description: "Jeu de société.",
    });
    h.philibertResolve.mockResolvedValue({
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
    h.bggResolve.mockResolvedValue(null);
    h.wikidataResolve.mockResolvedValue(null);
    h.philibertResolve.mockResolvedValue(null);

    const result = await fetchFromAllBoardGameSources("Inconnu");
    expect(result).toBeNull();
  });

  it("n'appelle pas le scraper quand une source fournit titre + couverture", async () => {
    h.bggResolve.mockResolvedValue({
      title: "Catan",
      imageUrl: "https://cdn/catan.jpg",
    });
    h.wikidataResolve.mockResolvedValue(null);
    h.philibertResolve.mockResolvedValue(null);

    const result = await fetchFromAllBoardGameSources("Catan", BOARD_GAME_BARCODE);

    expect(result?.title).toBe("Catan");
    expect(h.scraperFetch).not.toHaveBeenCalled();
  });

  it("déclenche le scraper en fallback couverture quand aucune source n'a d'image", async () => {
    h.bggResolve.mockResolvedValue({ title: "Catan" });
    h.wikidataResolve.mockResolvedValue(null);
    h.philibertResolve.mockResolvedValue(null);
    h.scraperFetch.mockResolvedValue([
      { name: "Catan", coverUrl: "https://cdn/box.jpg" },
    ]);

    const result = await fetchFromAllBoardGameSources("Catan", BOARD_GAME_BARCODE);

    expect(h.scraperFetch).toHaveBeenCalledTimes(1);
    expect(result?.imageUrl).toContain("box.jpg");
  });

  it("déclenche le scraper quand aucune métadonnée primaire n'est trouvée", async () => {
    h.bggResolve.mockResolvedValue(null);
    h.wikidataResolve.mockResolvedValue(null);
    h.philibertResolve.mockResolvedValue(null);
    h.scraperFetch.mockResolvedValue([
      { name: "Catan (boîte)", coverUrl: "https://cdn/box.jpg" },
    ]);

    const result = await fetchFromAllBoardGameSources("Catan", BOARD_GAME_BARCODE);

    expect(h.scraperFetch).toHaveBeenCalledTimes(1);
    expect(result).not.toBeNull();
    expect(result?.title).toBeTruthy();
  });

  it("ignore un provider qui rejette (allSettled) sans faire échouer la résolution", async () => {
    h.bggResolve.mockRejectedValue(new Error("BGG 401"));
    h.wikidataResolve.mockResolvedValue({
      title: "Catan",
      imageUrl: "https://cdn/wikidata.jpg",
    });
    h.philibertResolve.mockResolvedValue(null);

    const result = await fetchFromAllBoardGameSources("Catan", BOARD_GAME_BARCODE);

    expect(result?.title).toBe("Catan");
    expect(h.scraperFetch).not.toHaveBeenCalled();
  });
});
