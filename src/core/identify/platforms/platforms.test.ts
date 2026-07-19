import { describe, expect, it } from "vitest";

import {
  createSequelNumberBeforePlatformMatcher,
  createTrailingVideoGamePlatformSuffixMatcher,
  createVideoGamePlatformMatcher,
  detectKnownVideoGamePlatformName,
  detectScreenScraperSystemId,
  detectVideoGamePlatformKey,
  getCoverProjectPlatformSpecs,
  getPlatformKeyByScreenScraperSystemId,
  getScreenScraperSystemId,
  getTheGamesDbPlatformId,
  LAUNCHBOX_PLATFORM_REFERENCES,
  resolveLaunchBoxPlatformNames,
  SCREEN_SCRAPER_PLATFORM_REFERENCES,
  videoGamePlatformListingTypeSignal,
  videoGamePlatformTargetsPhysicalMedia,
} from "@/core/identify/platforms/platforms";

describe("videoGamePlatforms", () => {
  it("detects canonical Placarr platform keys from common labels", () => {
    expect(detectVideoGamePlatformKey("PlayStation 2")).toBe("ps2");
    expect(detectVideoGamePlatformKey("Xbox Series S/X")).toBe("xboxseries");
    expect(detectVideoGamePlatformKey("PC (Windows)")).toBe("pc");
    expect(detectVideoGamePlatformKey("Switch 2")).toBe("switch2");
    expect(detectVideoGamePlatformKey("Nintendo Switch 2")).toBe("switch2");
  });

  it("prefers parenthetical marketplace platform markers over body text", () => {
    expect(detectVideoGamePlatformKey("Shock Troopers Neo Geo (PC)")).toBe(
      "pc",
    );
    expect(detectVideoGamePlatformKey("Shock Troopers Neo Geo AES")).toBe(
      "neogeo",
    );
  });

  it("marks low listing-type-signal precision on the platform row, not in core logic", () => {
    expect(videoGamePlatformListingTypeSignal("pc")).toBe(0);
    expect(videoGamePlatformListingTypeSignal("xbox")).toBe(1);
    expect(videoGamePlatformListingTypeSignal(null)).toBe(0);
  });

  it("marks physical vs digital release on the platform row", () => {
    expect(videoGamePlatformTargetsPhysicalMedia("xbox")).toBe(true);
    expect(videoGamePlatformTargetsPhysicalMedia("pc")).toBe(false);
    expect(videoGamePlatformTargetsPhysicalMedia("web")).toBe(false);
  });

  it("builds a shared matcher for UI/admin text highlighting", () => {
    const matcher = createVideoGamePlatformMatcher();
    expect(
      [..."Halo Xbox Series S/X".matchAll(matcher)].map((m) => m[0]),
    ).toEqual(["Xbox Series S/X"]);
  });

  it("builds trailing / sequel-before-platform matchers from the same registry", () => {
    expect(
      createTrailingVideoGamePlatformSuffixMatcher().test(
        "Tekken 7 sur PS4",
      ),
    ).toBe(true);
    expect(
      [
        ..."Borderlands 3 Xbox One".matchAll(
          createSequelNumberBeforePlatformMatcher(),
        ),
      ][0]?.[1],
    ).toBe("3");
  });

  it("centralizes provider ids and slugs", () => {
    expect(getTheGamesDbPlatformId("ps2")).toBe(11);
    expect(getTheGamesDbPlatformId("saturn")).toBe(17);
    expect(detectScreenScraperSystemId("Nintendo Wii")).toBe(16);
    expect(getPlatformKeyByScreenScraperSystemId(34)).toBe("xboxone");
    expect(getScreenScraperSystemId("switch2")).toBe(296);
    expect(getScreenScraperSystemId("megadrive")).toBe(1);
    expect(getScreenScraperSystemId("gamegear")).toBe(21);
    expect(getScreenScraperSystemId("saturn")).toBe(22);
    expect(getScreenScraperSystemId("neogeo")).toBe(142);
    expect(getScreenScraperSystemId("atari5200")).toBe(40);
    expect(getScreenScraperSystemId("atari7800")).toBe(41);
    expect(getCoverProjectPlatformSpecs("wii")[0]?.folder).toBe("nintendo_wii");
  });

  it("resolves LaunchBox names for Sega / Atari shelves", () => {
    expect(resolveLaunchBoxPlatformNames("Master System")).toContain(
      "Sega Master System",
    );
    expect(resolveLaunchBoxPlatformNames("Game Gear")).toContain(
      "Sega Game Gear",
    );
    expect(resolveLaunchBoxPlatformNames("Neo Geo")).toEqual(
      expect.arrayContaining(["SNK Neo Geo AES", "SNK Neo Geo MVS"]),
    );
    expect(resolveLaunchBoxPlatformNames("Atari 5200")).toContain("Atari 5200");
  });

  it("uses source snapshots for provider platform names without runtime fetches", () => {
    expect(SCREEN_SCRAPER_PLATFORM_REFERENCES.length).toBeGreaterThan(200);
    expect(LAUNCHBOX_PLATFORM_REFERENCES.length).toBeGreaterThan(150);
    expect(
      SCREEN_SCRAPER_PLATFORM_REFERENCES.every(
        (platform) =>
          Number.isFinite(platform.id) &&
          typeof platform.type === "string" &&
          platform.names.length > 0,
      ),
    ).toBe(true);
    expect(
      LAUNCHBOX_PLATFORM_REFERENCES.every(
        (platform) =>
          Number.isFinite(platform.id) && platform.name.trim().length > 0,
      ),
    ).toBe(true);
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
