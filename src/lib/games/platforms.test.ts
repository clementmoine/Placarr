import { describe, expect, it } from "vitest";

import {
  createVideoGamePlatformMatcher,
  detectKnownVideoGamePlatformName,
  detectScreenScraperSystemId,
  detectVideoGamePlatformKey,
  getCoverProjectPlatformSpecs,
  getPlatformKeyByScreenScraperSystemId,
  getPriceChartingPlatformSlugs,
  getScreenScraperSystemId,
  getTheGamesDbPlatformId,
  LAUNCHBOX_PLATFORM_REFERENCES,
  priceChartingNeoGeoVariantMatchesShelf,
  resolveLaunchBoxPlatformNames,
  resolvePriceChartingPlatformSlug,
  SCREEN_SCRAPER_PLATFORM_REFERENCES,
} from "@/lib/games/platforms";

describe("videoGamePlatforms", () => {
  it("detects canonical Placarr platform keys from common labels", () => {
    expect(detectVideoGamePlatformKey("PlayStation 2")).toBe("ps2");
    expect(detectVideoGamePlatformKey("Xbox Series S/X")).toBe("xboxseries");
    expect(detectVideoGamePlatformKey("PC (Windows)")).toBe("pc");
    expect(detectVideoGamePlatformKey("Switch 2")).toBe("switch2");
    expect(detectVideoGamePlatformKey("Nintendo Switch 2")).toBe("switch2");
  });

  it("prefers parenthetical marketplace platform markers over body text", () => {
    expect(detectVideoGamePlatformKey("Shock Troopers Neo Geo (PC)")).toBe("pc");
    expect(detectVideoGamePlatformKey("Shock Troopers Neo Geo AES")).toBe(
      "neogeo",
    );
  });

  it("builds a shared matcher for UI/admin text highlighting", () => {
    const matcher = createVideoGamePlatformMatcher();
    expect(
      [..."Halo Xbox Series S/X".matchAll(matcher)].map((m) => m[0]),
    ).toEqual(["Xbox Series S/X"]);
  });

  it("centralizes provider ids and slugs", () => {
    expect(getTheGamesDbPlatformId("ps2")).toBe(11);
    expect(detectScreenScraperSystemId("Nintendo Wii")).toBe(16);
    expect(getPlatformKeyByScreenScraperSystemId(34)).toBe("xboxone");
    expect(getScreenScraperSystemId("switch2")).toBe(296);
    expect(getPriceChartingPlatformSlugs("wii")?.pal).toBe("pal-wii");
    expect(getCoverProjectPlatformSpecs("wii")[0]?.folder).toBe("nintendo_wii");
  });

  it("resolves Neo Geo AES PriceCharting slugs from shelf labels and barcodes", () => {
    expect(
      resolvePriceChartingPlatformSlug("NEO GEO AES+", {
        barcode: "4964808100880",
      }),
    ).toBe("jp-neo-geo-aes");
    expect(
      resolvePriceChartingPlatformSlug("Neo Geo AES", {
        barcode: "4012927150101",
      }),
    ).toBe("neo-geo-aes");
    expect(resolvePriceChartingPlatformSlug("Neo Geo MVS")).toBe("neo-geo-mvs");
    expect(
      priceChartingNeoGeoVariantMatchesShelf(
        "Neo Geo MVS",
        "NEO GEO AES+",
      ),
    ).toBe(false);
  });

  it("uses source snapshots for provider platform names without runtime fetches", () => {
    expect(SCREEN_SCRAPER_PLATFORM_REFERENCES.length).toBeGreaterThan(200);
    expect(LAUNCHBOX_PLATFORM_REFERENCES.length).toBeGreaterThan(150);
    expect(detectScreenScraperSystemId("Capcom Play System 2")).toBe(7);
    expect(detectScreenScraperSystemId("Nintendo Switch 2")).toBe(296);
    expect(detectKnownVideoGamePlatformName("Nintendo Switch 2")).toBe(
      "nintendo switch 2",
    );
  });

  it("resolves LaunchBox names from canonical and source platform labels", () => {
    expect(resolveLaunchBoxPlatformNames("Mega Drive")).toContain(
      "Sega Mega Drive",
    );
    expect(resolveLaunchBoxPlatformNames("Nintendo Switch 2")).toEqual([
      "Nintendo Switch 2",
    ]);
  });
});
