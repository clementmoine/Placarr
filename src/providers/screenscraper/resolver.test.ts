import { describe, expect, it } from "vitest";

import { cleanSearchQuery } from "@/core/enrich/search/query";
import {
  buildScreenScraperFacts,
  buildScreenScraperObservations,
  buildScreenScraperSearchQueries,
  buildScreenScraperGamePageUrl,
  collapseScreenScraperTitlePunctuation,
  createScreenScraperResolver,
  isPlausibleScreenScraperFallbackResult,
  parseScreenScraperMediaUrl,
  isScreenScraperPlaceholderMedia,
  hydrateScreenScraperLookupFromGameCache,
  mergeScreenScraperLookupWithGame,
  rewriteScreenScraperGameInfoUrl,
  screenScraperLookupHasCanonicalCover,
  pickSSCover,
  scoreScreenScraperGameTitleMatch,
  shouldUseCachedScreenScraperSuggestions,
  __screenScraperChromeTokensForTests,
  type SSMedia,
} from "./resolver";
import { getScreenScraperEnv } from "./env";
import { screenScraperAttachmentFromMediaUrl } from "./mediaUrl";

const SCREEN_SCRAPER_ENV_KEYS = [
  "SCREENSCRAPER_DEV_ID",
  "SCREENSCRAPER_DEV_PASSWORD",
  "SCREENSCRAPER_USER",
  "SCREENSCRAPER_PASSWORD",
  "SCREENSCRAPER_DEV_DEBUG_PASSWORD",
  "SCREENSCRAPER_FORCE_UPDATE",
] as const;

function withCleanScreenScraperEnv(run: () => void | Promise<void>) {
  return async () => {
    const previous = Object.fromEntries(
      SCREEN_SCRAPER_ENV_KEYS.map((key) => [key, process.env[key]]),
    );
    for (const key of SCREEN_SCRAPER_ENV_KEYS) delete process.env[key];

    try {
      await run();
    } finally {
      for (const key of SCREEN_SCRAPER_ENV_KEYS) {
        const value = previous[key];
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  };
}

describe("pickSSCover", () => {
  it("prefers box-2D with region priority", () => {
    const medias: SSMedia[] = [
      { type: "box-3D", region: "us", url: "3d-us" },
      { type: "box-2D", region: "eu", url: "2d-eu" },
      { type: "box-2D", region: "fr", url: "2d-fr" },
    ];

    expect(pickSSCover(medias)).toBe("2d-fr");
  });

  it("falls back to any preferred type when region is missing", () => {
    const medias: SSMedia[] = [{ type: "box-3D", url: "3d-any" }];
    expect(pickSSCover(medias)).toBe("3d-any");
  });

  it("returns null when no supported cover type is available", () => {
    const medias: SSMedia[] = [{ type: "mixrbv2", region: "fr", url: "mix" }];
    expect(pickSSCover(medias)).toBeNull();
  });

  it("ignores tiny placeholder media when choosing the cover", () => {
    const medias: SSMedia[] = [
      { type: "box-2D", region: "jp", url: "2d-jp", size: "2742" }, // placeholder
      { type: "box-2D", region: "eu", url: "2d-eu", size: "571174" },
    ];
    expect(pickSSCover(medias)).toBe("2d-eu");
  });
});

describe("buildScreenScraperGamePageUrl", () => {
  it("builds the public gameinfos URL with plateforme when known", () => {
    expect(buildScreenScraperGamePageUrl(29600, 62)).toBe(
      "https://www.screenscraper.fr/gameinfos.php?plateforme=62&gameid=29600",
    );
  });

  it("rewrites api jeuInfos links to the public fiche", () => {
    expect(
      rewriteScreenScraperGameInfoUrl(
        "https://api.screenscraper.fr/api2/jeuInfos.php?gameid=29600",
        62,
      ),
    ).toBe(
      "https://www.screenscraper.fr/gameinfos.php?plateforme=62&gameid=29600",
    );
  });
});

describe("isScreenScraperPlaceholderMedia", () => {
  it("flags the tiny green placeholder (~2.7 KB)", () => {
    expect(
      isScreenScraperPlaceholderMedia({
        type: "box-2D-back",
        region: "jp",
        url: "x",
        size: "2742",
      }),
    ).toBe(true);
  });

  it("keeps real box art and small-but-legit spines", () => {
    expect(
      isScreenScraperPlaceholderMedia({
        type: "box-2D",
        url: "x",
        size: "571174",
      }),
    ).toBe(false);
    // Smallest legitimate side/spine observed (~8.7 KB) stays.
    expect(
      isScreenScraperPlaceholderMedia({
        type: "box-2D-side",
        url: "x",
        size: "8704",
      }),
    ).toBe(false);
  });

  it("keeps media with no size info (cannot judge → never dropped)", () => {
    expect(isScreenScraperPlaceholderMedia({ type: "box-2D", url: "x" })).toBe(
      false,
    );
  });
});

describe("buildScreenScraperFacts", () => {
  it("maps player count and play modes when ScreenScraper exposes them", () => {
    const facts = buildScreenScraperFacts(
      {
        joueurs: { text: "1-4 joueurs" },
        modes: [{ text: "Solo" }, { text: "Coopératif" }],
        note: { text: "17" },
      },
      (value, scale) => `${value}/${scale}`,
    );

    expect(facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "players",
          label: "Joueurs",
          value: "1-4",
          source: "screenscraper",
        }),
        expect.objectContaining({
          kind: "modes",
          label: "Modes de jeu",
          value: "Solo • Coopératif",
          source: "screenscraper",
        }),
      ]),
    );
  });
});

describe("buildScreenScraperObservations", () => {
  it("emits typed observations with image roles and evidence signals", () => {
    const observations = buildScreenScraperObservations(
      {
        title: "The Legend of Zelda: Skyward Sword",
        imageUrl: "https://media.screenscraper.fr/box-2D-fr.jpg",
        aliases: ["Zelda Skyward Sword"],
        regionalTitles: [
          { region: "fr", text: "The Legend of Zelda : Skyward Sword" },
        ],
        attachments: [
          {
            type: "cover",
            role: "fr",
            url: "https://media.screenscraper.fr/box-2D-fr.jpg",
            source: "screenscraper",
          },
          {
            type: "screenshot",
            role: "wor",
            url: "https://media.screenscraper.fr/screenshot-1.jpg",
            source: "screenscraper",
          },
          {
            type: "image",
            role: "back-fr",
            url: "https://media.screenscraper.fr/box-back-fr.jpg",
            source: "screenscraper",
          },
        ],
        facts: [
          {
            kind: "players",
            label: "Joueurs",
            value: "1-4",
            source: "screenscraper",
          },
        ],
        externalIds: { screenscraper: "14825" },
      },
      {
        sourceUrl: "https://www.screenscraper.fr/gameinfos.php?gameid=14825",
        hasBarcodeMatch: true,
        hasPlatformMatch: true,
      },
    );

    expect(observations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "title",
          role: "object_title",
          value: "The Legend of Zelda: Skyward Sword",
          provenance: expect.objectContaining({
            providerId: "screenscraper",
            sourceDocumentRole: "api_object",
            evidenceSignals: expect.arrayContaining([
              "structured_data",
              "barcode_match",
              "platform_match",
            ]),
          }),
        }),
        expect.objectContaining({
          kind: "image",
          role: "cover_front",
          url: "https://media.screenscraper.fr/box-2D-fr.jpg",
        }),
        expect.objectContaining({
          kind: "image",
          role: "screenshot",
          url: "https://media.screenscraper.fr/screenshot-1.jpg",
        }),
        expect.objectContaining({
          kind: "image",
          role: "cover_back",
          url: "https://media.screenscraper.fr/box-back-fr.jpg",
          region: "fr",
        }),
        expect.objectContaining({
          kind: "fact",
          role: "structured_fact",
          factKind: "players",
          value: "1-4",
        }),
        expect.objectContaining({
          kind: "external-id",
          role: "provider_record_id",
          idKind: "screenscraper",
          value: "14825",
        }),
      ]),
    );
  });

  it("buckets ScreenScraper ISO region codes into canonical regions", () => {
    const observations = buildScreenScraperObservations(
      {
        title: "Assassin's Creed: The Ezio Collection",
        attachments: [
          {
            type: "cover",
            role: "au",
            url: "https://media.screenscraper.fr/box-2D-au.jpg",
            source: "screenscraper",
          },
          {
            type: "cover",
            role: "3d-sp",
            url: "https://media.screenscraper.fr/box-3D-sp.jpg",
            source: "screenscraper",
          },
          {
            type: "image",
            role: "back-br",
            url: "https://media.screenscraper.fr/box-back-br.jpg",
            source: "screenscraper",
          },
        ],
      },
      { hasBarcodeMatch: false, hasPlatformMatch: false },
    );

    expect(observations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "image",
          role: "cover_front",
          url: "https://media.screenscraper.fr/box-2D-au.jpg",
          region: "eu",
        }),
        expect.objectContaining({
          kind: "image",
          role: "product_packshot",
          url: "https://media.screenscraper.fr/box-3D-sp.jpg",
          region: "eu",
        }),
        expect.objectContaining({
          kind: "image",
          role: "cover_back",
          url: "https://media.screenscraper.fr/box-back-br.jpg",
          region: "us",
        }),
      ]),
    );
  });
});

describe("createScreenScraperResolver", () => {
  it(
    "returns null when ScreenScraper is not configured",
    withCleanScreenScraperEnv(async () => {
      const resolver = createScreenScraperResolver({
        cleanSearchQuery: (value) => value,
        formatScore: () => null,
      });
      const result = await resolver("Any Game");
      expect(result).toBeNull();
    }),
  );

  it(
    "requires the ScreenScraper developer credentials from the API docs",
    withCleanScreenScraperEnv(() => {
      process.env.SCREENSCRAPER_DEV_ID = "dev-id";
      process.env.SCREENSCRAPER_DEV_PASSWORD = "dev-pass";
      process.env.SCREENSCRAPER_USER = "screen-user";
      process.env.SCREENSCRAPER_PASSWORD = "screen-pass";

      expect(getScreenScraperEnv()).toEqual({
        devId: "dev-id",
        devPass: "dev-pass",
        ssUser: "screen-user",
        ssPass: "screen-pass",
        devDebugPassword: "",
        forceUpdate: false,
      });
    }),
  );
});

describe("isPlausibleScreenScraperFallbackResult", () => {
  it("does not reject plain base titles when query contains generic words", () => {
    const cleanSearchQuery = (value: string) => value;
    expect(
      isPlausibleScreenScraperFallbackResult(
        "Minecraft Edition",
        "Minecraft",
        cleanSearchQuery,
      ),
    ).toBe(true);
  });

  it("accepts punctuation variants via fuzzy title similarity", () => {
    const cleanSearchQuery = (value: string) => value;
    expect(
      isPlausibleScreenScraperFallbackResult(
        "Alice : Retour au Pays de la Folie",
        "Alice - Retour Au Pays De La Folie",
        cleanSearchQuery,
      ),
    ).toBe(true);
  });
});

describe("shouldUseCachedScreenScraperSuggestions", () => {
  it("allows cache fallback for franchise-style queries", () => {
    const cleanSearchQuery = (value: string) => value;

    expect(
      shouldUseCachedScreenScraperSuggestions(
        "Minecraft Edition",
        cleanSearchQuery,
      ),
    ).toBe(true);
    expect(
      shouldUseCachedScreenScraperSuggestions(
        "Syphon Filter Dark Mirror",
        cleanSearchQuery,
      ),
    ).toBe(true);
  });
});

describe("parseScreenScraperMediaUrl", () => {
  it("extracts game and system ids from media urls", () => {
    expect(
      parseScreenScraperMediaUrl(
        "https://api.screenscraper.fr/api2/mediaJeu.php?systemeid=58&jeuid=22693&media=box-2D(eu)",
      ),
    ).toEqual({
      gameId: 22693,
      systemId: 58,
      mediaType: "box-2D",
      mediaRegion: "eu",
    });
  });

  it("infers attachment semantics from media urls", () => {
    expect(
      screenScraperAttachmentFromMediaUrl(
        "https://api.screenscraper.fr/api2/mediaJeu.php?systemeid=32&jeuid=14774&media=box-2D(fr)",
      ),
    ).toEqual({ type: "cover", role: "fr", source: "screenscraper" });
  });
});

describe("buildScreenScraperSearchQueries", () => {
  it("tries a punctuation-stripped variant for titles ending with ! or ?", () => {
    const queries = buildScreenScraperSearchQueries(
      "Whacked!",
      (value) => value,
    );

    expect(queries).toContain("Whacked!");
    expect(queries).toContain("Whacked");
  });

  it("adds hyphen/colon variants for Club Football team editions", () => {
    const cleanSearchQuery = (value: string) =>
      value
        .replace(/\bde\b/gi, " ")
        .replace(/\s+/g, " ")
        .trim();
    const queries = buildScreenScraperSearchQueries(
      "Club Football 2005 Olympique de Marseille",
      cleanSearchQuery,
    );

    expect(queries).toContain("Club Football 2005 - Olympique Marseille");
  });

  it("prioritizes the original title before stripped variants", () => {
    const queries = buildScreenScraperSearchQueries(
      "New Super Mario Bros. Wii",
      (value) => value.replace(/\bwii\b/gi, "").trim(),
    );

    expect(queries[0]).toBe("New Super Mario Bros. Wii");
  });

  it("never searches with legal mark symbols", () => {
    const queries = buildScreenScraperSearchQueries(
      "You Suck at Parking® - Complete Edition",
      (value) => value.replace(/[\u00AE\u2122\u00A9\u2120\u2117]/g, "").trim(),
    );

    expect(queries[0]).toBe("You Suck at Parking - Complete Edition");
    for (const query of queries) {
      expect(query).not.toMatch(/[\u00AE\u2122\u00A9\u2120\u2117]/);
    }
  });

  it("adds the base franchise title before subtitle for colon titles", () => {
    const queries = buildScreenScraperSearchQueries(
      "Syphon Filter : Dark Mirror",
      (value) => value,
    );

    expect(queries).toContain("Syphon Filter");
    expect(queries).toContain("Dark Mirror");
  });

  it("does not search edition-only subtitle fragments alone", () => {
    const queries = buildScreenScraperSearchQueries(
      "Alan Wake II - Deluxe Edition",
      (value) => value,
    );

    expect(queries).toContain("Alan Wake II - Deluxe Edition");
    expect(queries).toContain("Alan Wake II");
    expect(queries).not.toContain("Deluxe Edition");
  });

  it("dedupes colon, dash and spacing variants into one search", () => {
    const queries = buildScreenScraperSearchQueries(
      "Alice : Retour au Pays de la Folie",
      (value) => value,
    );

    expect(queries).toContain("Alice : Retour au Pays de la Folie");
    expect(queries).not.toContain("Alice - Retour au Pays de la Folie");
    expect(queries).not.toContain("Alice :  Retour au Pays de la Folie");
    expect(
      queries.filter(
        (query) =>
          collapseScreenScraperTitlePunctuation(query) ===
          "Alice Retour au Pays de la Folie",
      ),
    ).toHaveLength(1);
  });

  it("searches the franchise title when the French name ends with le jeu vidéo", () => {
    const queries = buildScreenScraperSearchQueries(
      "LEGO La Grande Aventure Le Jeu Vidéo",
      cleanSearchQuery,
    );

    expect(queries).toContain("LEGO La Grande Aventure Le Jeu Vidéo");
    expect(queries).toContain("LEGO La Grande Aventure");
    expect(queries).not.toContain("LEGO La Grande Aventure Le");
  });
});

describe("scoreScreenScraperGameTitleMatch", () => {
  it("matches Alice despite ScreenScraper dash spelling and US regional title", () => {
    const noms = [
      { region: "wor", text: "Alice - Retour Au Pays De La Folie" },
      { region: "us", text: "Alice: Madness Returns" },
    ];

    expect(
      scoreScreenScraperGameTitleMatch(
        "Alice : Retour au Pays de la Folie",
        noms,
      ),
    ).toBeGreaterThanOrEqual(0.99);
  });

  it("rejects unrelated games that only share the franchise name", () => {
    expect(
      scoreScreenScraperGameTitleMatch("Alice : Retour au Pays de la Folie", [
        { region: "us", text: "Alice: Madness Returns" },
      ]),
    ).toBeLessThan(0.55);
  });

  it("rejects homonym titles that only share Alice", () => {
    expect(
      scoreScreenScraperGameTitleMatch("Alice : Retour au Pays de la Folie", [
        { region: "wor", text: "Alice in Wonderland" },
      ]),
    ).toBeLessThan(0.55);
  });
});

describe("screenScraperLookupHasCanonicalCover", () => {
  it("accepts unpinned lookups regardless of attachment mix", () => {
    expect(
      screenScraperLookupHasCanonicalCover({
        title: "Some Game",
        imageUrl: "https://example.com/cover.jpg",
      }),
    ).toBe(true);
  });

  it("detects pinned games cached with only screenshots", () => {
    expect(
      screenScraperLookupHasCanonicalCover({
        title: "Alice : Retour au Pays de la Folie",
        externalIds: { screenscraper: "16056" },
        attachments: [
          {
            source: "screenscraper",
            type: "screenshot",
            url: "https://www.screenscraper.fr/media/ss/16056/ss.jpg",
          },
        ],
      }),
    ).toBe(false);
  });

  it("detects pinned games with a box cover attachment", () => {
    expect(
      screenScraperLookupHasCanonicalCover({
        title: "Alice : Retour au Pays de la Folie",
        externalIds: { screenscraper: "16056" },
        attachments: [
          {
            source: "screenscraper",
            type: "cover",
            url: "https://www.screenscraper.fr/media/ss/16056/box-2D/fr.png",
          },
        ],
      }),
    ).toBe(true);
  });

  it("detects pinned games when imageUrl is a box cover", () => {
    expect(
      screenScraperLookupHasCanonicalCover({
        title: "Alice : Retour au Pays de la Folie",
        externalIds: { screenscraper: "16056" },
        imageUrl:
          "https://api.screenscraper.fr/api2/mediaJeu.php?systemeid=32&jeuid=16056&media=box-2D(eu)",
      }),
    ).toBe(true);
  });
});

describe("mergeScreenScraperLookupWithGame", () => {
  it("adds box cover attachments from cached game data without dropping screenshots", () => {
    const merged = mergeScreenScraperLookupWithGame(
      {
        title: "Alice : Retour au Pays de la Folie",
        externalIds: { screenscraper: "16056" },
        attachments: [
          {
            source: "screenscraper",
            type: "screenshot",
            url: "https://api.screenscraper.fr/api2/mediaJeu.php?systemeid=32&jeuid=16056&media=ss(wor)",
          },
        ],
      },
      {
        id: 16056,
        noms: [{ region: "wor", text: "Alice - Retour Au Pays De La Folie" }],
        medias: [
          {
            type: "box-2D",
            region: "eu",
            url: "https://api.screenscraper.fr/api2/mediaJeu.php?systemeid=32&jeuid=16056&media=box-2D(eu)",
            size: "571174",
          },
          {
            type: "ss",
            region: "wor",
            url: "https://api.screenscraper.fr/api2/mediaJeu.php?systemeid=32&jeuid=16056&media=ss(wor)",
            size: "120000",
          },
        ],
      },
      "Alice : Retour au Pays de la Folie",
    );

    expect(screenScraperLookupHasCanonicalCover(merged)).toBe(true);
    expect(merged.imageUrl).toContain("box-2D(eu)");
    expect(merged.attachments).toHaveLength(2);
    expect(merged.platformKey).toBe("xbox");
    expect(
      merged.attachments?.find((attachment) => attachment.type === "cover")
        ?.platformKey,
    ).toBe("xbox");
  });
});

describe("hydrateScreenScraperLookupFromGameCache", () => {
  it("returns the same lookup when no game cache is available", async () => {
    const lookup = {
      title: "Alice : Retour au Pays de la Folie",
      externalIds: { screenscraper: "99999999" },
      attachments: [
        {
          source: "screenscraper" as const,
          type: "screenshot" as const,
          url: "https://example.com/ss.jpg",
        },
      ],
    };

    await expect(hydrateScreenScraperLookupFromGameCache(lookup)).resolves.toBe(
      lookup,
    );
  });

  it("merges cached game medias even when the lookup already has a canonical cover", async () => {
    const lookup = {
      title: "Alice : Retour au Pays de la Folie",
      imageUrl:
        "https://api.screenscraper.fr/api2/mediaJeu.php?systemeid=32&jeuid=16056&media=box-2D(eu)",
      externalIds: { screenscraper: "16056" },
      attachments: [
        {
          source: "screenscraper" as const,
          type: "cover" as const,
          role: "eu",
          url: "https://api.screenscraper.fr/api2/mediaJeu.php?systemeid=32&jeuid=16056&media=box-2D(eu)",
        },
      ],
    };

    const merged = await hydrateScreenScraperLookupFromGameCache(lookup);

    expect(
      merged.attachments?.some((attachment) => attachment.role === "3d-eu"),
    ).toBe(true);
    expect(
      merged.attachments?.some(
        (attachment) => attachment.type === "screenshot",
      ),
    ).toBe(true);
  });

  it("keeps jeux/complet chrome via GENERIC + LISTING_CONDITION (no bare literals)", () => {
    const { broad, nonDistinctive } = __screenScraperChromeTokensForTests();
    expect(broad.has("jeux")).toBe(true);
    expect(broad.has("jeu")).toBe(true);
    expect(nonDistinctive.has("complet")).toBe(true);
    expect(nonDistinctive.has("complete")).toBe(true);
    // Intentional SS seed policy — not listing taxonomies.
    expect(broad.has("club")).toBe(true);
    expect(nonDistinctive.has("force")).toBe(true);
  });
});
