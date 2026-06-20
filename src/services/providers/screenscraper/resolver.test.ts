import { describe, expect, it } from "vitest";

import {
  buildScreenScraperSearchQueries,
  createScreenScraperResolver,
  isPlausibleScreenScraperFallbackResult,
  parseScreenScraperMediaUrl,
  pickSSCover,
  shouldUseCachedScreenScraperSuggestions,
  type SSMedia,
} from "./resolver";
import { getScreenScraperEnv } from "./env";

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
    ).toEqual({ gameId: 22693, systemId: 58 });
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

  it("adds the base franchise title before subtitle for colon titles", () => {
    const queries = buildScreenScraperSearchQueries(
      "Syphon Filter : Dark Mirror",
      (value) => value,
    );

    expect(queries).toContain("Syphon Filter");
    expect(queries).toContain("Dark Mirror");
  });
});
