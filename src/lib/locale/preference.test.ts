import { describe, expect, it } from "vitest";

import { getCoverImage } from "@/lib/item/media";
import {
  inferTextLanguage,
  localeBonusForAttachmentRole,
  mapBggLanguageToAttachmentRole,
  parseRegionFromRole,
  pickBestLocalizedDescription,
  pickBestRegionalTitle,
  regionRank,
} from "@/lib/locale/preference";

describe("localePreference", () => {
  const frLocale = { uiLocale: "fr" as const };
  const enLocale = { uiLocale: "en" as const };

  it("ranks FR/EU regions ahead of US/JP for French UI locale", () => {
    expect(regionRank("fr", frLocale)).toBeLessThan(regionRank("eu", frLocale));
    expect(regionRank("eu", frLocale)).toBeLessThan(regionRank("us", frLocale));
    expect(regionRank("us", frLocale)).toBeLessThan(regionRank("jp", frLocale));
  });

  it("ranks US/UK regions ahead of FR/EU for English UI locale", () => {
    expect(regionRank("us", enLocale)).toBeLessThan(regionRank("uk", enLocale));
    expect(regionRank("uk", enLocale)).toBeLessThan(regionRank("fr", enLocale));
    expect(regionRank("eu", enLocale)).toBeLessThan(regionRank("jp", enLocale));
  });

  it("maps provider region labels to canonical locale ranks", () => {
    expect(regionRank("europe")).toBe(regionRank("eu"));
    expect(regionRank("eur")).toBe(regionRank("eu"));
    expect(regionRank("France")).toBe(regionRank("fr"));
    expect(regionRank("world")).toBe(regionRank("wor"));
    expect(parseRegionFromRole("europe")).toBe("eu");
    expect(parseRegionFromRole("Europe")).toBe("eu");
    expect(localeBonusForAttachmentRole("europe")).toBe(
      localeBonusForAttachmentRole("eu"),
    );
  });

  it("maps ScreenScraper ISO short codes to canonical PAL/NTSC/JP buckets", () => {
    // PAL territories → eu (this is the regression behind covers showing no
    // region: a real `au`/`sp` cover used to resolve to nothing).
    for (const code of ["au", "sp", "it", "nl", "pl", "dk", "no", "se", "ru"]) {
      expect(parseRegionFromRole(code)).toBe("eu");
      expect(regionRank(code)).toBe(regionRank("eu"));
    }
    // Americas → us
    for (const code of ["ca", "br", "mx"]) {
      expect(parseRegionFromRole(code)).toBe("us");
    }
    // East Asia → jp
    for (const code of ["kr", "ko", "cn", "tw"]) {
      expect(parseRegionFromRole(code)).toBe("jp");
    }
    expect(parseRegionFromRole("gb")).toBe("uk");
    // Continent groupings
    expect(parseRegionFromRole("ame")).toBe("us");
    expect(parseRegionFromRole("asi")).toBe("jp");
    expect(parseRegionFromRole("oce")).toBe("eu");
  });

  it("leaves ScreenScraper's region-agnostic codes unmapped (honest empty)", () => {
    // `ss`/`cus` mean "no specific region" — better to show no region badge.
    expect(parseRegionFromRole("ss")).toBeUndefined();
    expect(parseRegionFromRole("cus")).toBeUndefined();
  });

  it("picks LaunchBox Europe titles at the same priority as EU", () => {
    expect(
      pickBestRegionalTitle([
        {
          title: "Tom Clancy's Ghost Recon 2",
          regionalTitles: [
            { region: "World", text: "Tom Clancy's Ghost Recon 2" },
            { region: "Europe", text: "Tom Clancy's Ghost Recon 2" },
            { region: "us", text: "Tom Clancy's Ghost Recon 2" },
          ],
        },
      ]),
    ).toBe("Tom Clancy's Ghost Recon 2");
    expect(regionRank("Europe")).toBe(regionRank("eu"));
  });

  it("picks the best regional title from provider payloads", () => {
    expect(
      pickBestRegionalTitle([
        {
          title: "Super Monkey Ball",
          regionalTitles: [
            { region: "us", text: "Super Monkey Ball" },
            { region: "fr", text: "Super Monkey Ball: Banana Blitz" },
          ],
        },
      ]),
    ).toBe("Super Monkey Ball: Banana Blitz");
  });

  it("prefers French descriptions over English when both exist", () => {
    expect(
      pickBestLocalizedDescription([
        {
          text: "A platform game starring monkeys in balls.",
          source: "igdb",
        },
        {
          text: "Un jeu de plateforme avec des singes dans des boules.",
          source: "screenscraper",
        },
      ]),
    ).toBe("Un jeu de plateforme avec des singes dans des boules.");
  });

  it("detects French text from accents and common words", () => {
    expect(inferTextLanguage("Le jeu des singes")).toBe("fr");
    expect(inferTextLanguage("The monkey game")).toBe("en");
  });

  it("maps BGG edition languages to attachment locale roles", () => {
    expect(mapBggLanguageToAttachmentRole("French")).toBe("fr");
    expect(mapBggLanguageToAttachmentRole("English")).toBe("wor");
    expect(mapBggLanguageToAttachmentRole(null, "French edition")).toBe("fr");
    expect(mapBggLanguageToAttachmentRole("Korean")).toBe("jp");
  });

  it("only treats plain region roles as cover locales", () => {
    expect(parseRegionFromRole("eu")).toBe("eu");
    expect(parseRegionFromRole("fr")).toBe("fr");
    expect(parseRegionFromRole("de")).toBe("eu");
    expect(parseRegionFromRole("fr-support")).toBeUndefined();
    expect(parseRegionFromRole("disc-fr")).toBeUndefined();
    expect(parseRegionFromRole("back-eu")).toBeUndefined();
    expect(parseRegionFromRole("3d-us")).toBeUndefined();
  });
});

describe("attachment locale scoring", () => {
  const frLocale = { uiLocale: "fr" as const };
  const enLocale = { uiLocale: "en" as const };

  it("boosts FR/EU cover roles over US covers for French UI locale", () => {
    expect(localeBonusForAttachmentRole("fr", frLocale)).toBeGreaterThan(
      localeBonusForAttachmentRole("us", frLocale),
    );
    expect(localeBonusForAttachmentRole("eu", frLocale)).toBeGreaterThan(
      localeBonusForAttachmentRole("us", frLocale),
    );
  });

  it("boosts US cover roles over FR covers for English UI locale", () => {
    expect(localeBonusForAttachmentRole("us", enLocale)).toBeGreaterThan(
      localeBonusForAttachmentRole("fr", enLocale),
    );
  });

  it("prefers FR regional covers over US when quality signals match", () => {
    expect(
      getCoverImage(
        {
          metadata: {
            attachments: [
              { type: "cover", role: "us", url: "/uploads/us.jpg" },
              { type: "cover", role: "fr", url: "/uploads/fr.jpg" },
            ],
          },
        },
        "fr",
      ),
    ).toBe("/uploads/fr.jpg");
  });

  it("prefers US regional covers over FR for English UI locale", () => {
    expect(
      getCoverImage(
        {
          metadata: {
            attachments: [
              { type: "cover", role: "us", url: "/uploads/us.jpg" },
              { type: "cover", role: "fr", url: "/uploads/fr.jpg" },
            ],
          },
        },
        "en",
      ),
    ).toBe("/uploads/us.jpg");
  });
});
