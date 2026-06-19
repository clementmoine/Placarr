import { describe, expect, it } from "vitest";

import { getCoverImage } from "@/lib/itemMedia";
import {
  inferTextLanguage,
  localeBonusForAttachmentRole,
  pickBestLocalizedDescription,
  pickBestRegionalTitle,
  regionRank,
} from "@/lib/localePreference";

describe("localePreference", () => {
  it("ranks FR/EU regions ahead of US/JP", () => {
    expect(regionRank("fr")).toBeLessThan(regionRank("eu"));
    expect(regionRank("eu")).toBeLessThan(regionRank("us"));
    expect(regionRank("us")).toBeLessThan(regionRank("jp"));
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
});

describe("attachment locale scoring", () => {
  it("boosts FR/EU cover roles over US covers", () => {
    expect(localeBonusForAttachmentRole("fr")).toBeGreaterThan(
      localeBonusForAttachmentRole("us"),
    );
    expect(localeBonusForAttachmentRole("eu")).toBeGreaterThan(
      localeBonusForAttachmentRole("us"),
    );
  });

  it("prefers FR regional covers over US when quality signals match", () => {
    expect(
      getCoverImage({
        metadata: {
          attachments: [
            { type: "cover", role: "us", url: "/uploads/us.jpg" },
            { type: "cover", role: "fr", url: "/uploads/fr.jpg" },
          ],
        },
      }),
    ).toBe("/uploads/fr.jpg");
  });
});
