import { describe, expect, it } from "vitest";

import {
  detectKnownVideoGamePlatformName,
  detectScreenScraperSystemId,
  detectVideoGamePlatformKey,
  createVideoGamePlatformMatcher,
  getCoverProjectPlatformSpecs,
  getPlatformKeyByScreenScraperSystemId,
  getPriceChartingPlatformSlugs,
  getTheGamesDbPlatformId,
  LAUNCHBOX_PLATFORM_REFERENCES,
  resolveLaunchBoxPlatformNames,
  SCREEN_SCRAPER_PLATFORM_REFERENCES,
} from "@/lib/videoGamePlatforms";

describe("videoGamePlatforms", () => {
  it("detects canonical Placarr platform keys from common labels", () => {
    expect(detectVideoGamePlatformKey("PlayStation 2")).toBe("ps2");
    expect(detectVideoGamePlatformKey("Xbox Series S/X")).toBe("xboxseries");
    expect(detectVideoGamePlatformKey("PC (Windows)")).toBe("pc");
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
    expect(getPriceChartingPlatformSlugs("wii")?.pal).toBe("pal-wii");
    expect(getCoverProjectPlatformSpecs("wii")[0]?.folder).toBe("nintendo_wii");
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
