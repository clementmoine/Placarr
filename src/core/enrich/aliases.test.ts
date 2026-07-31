import { describe, expect, it } from "vitest";

import {
  aliasesExcludingTitle,
  catalogAliasesFromNames,
  collectMergedSearchAliases,
  promoteTitleKeepingAliases,
} from "@/core/enrich/aliases";

describe("catalogAliasesFromNames", () => {
  it("keeps official alternates distinct from the display title", () => {
    expect(
      catalogAliasesFromNames("Pokemon Yellow", [
        "Pokemon Yellow",
        "Pokemon Jaune",
        "Pocket Monsters Pikachu",
      ]),
    ).toEqual(["Pokemon Jaune", "Pocket Monsters Pikachu"]);
  });

  it("drops noise placeholders", () => {
    expect(catalogAliasesFromNames("Catan", ["n/c", "Catan"])).toBeUndefined();
  });
});

describe("metadataAliases", () => {
  it("parses JSON string aliases and array aliases", async () => {
    const { metadataAliases } = await import("@/core/enrich/aliases");
    expect(metadataAliases('["Enter Electro","Sinister Six"]')).toEqual([
      "Enter Electro",
      "Sinister Six",
    ]);
    expect(metadataAliases(["Enter Electro"])).toEqual(["Enter Electro"]);
    expect(metadataAliases(null)).toBeUndefined();
  });

  it("repairs ScreenScraper-style Main ? Subtitle aliases", async () => {
    const { metadataAliases } = await import("@/core/enrich/aliases");
    expect(
      metadataAliases('["Lego La Grande Aventure ? Le Jeu Vidéo"]'),
    ).toEqual(["Lego La Grande Aventure : Le Jeu Vidéo"]);
  });

  it("surfaces catalog metadata.title when it differs from the display name", async () => {
    const { displayAliasesForItem } = await import("@/core/enrich/aliases");
    expect(
      displayAliasesForItem({
        name: "WRC 4: FIA World Rally Championship",
        metadataTitle: "Wrc 4",
        aliases: null,
      }),
    ).toEqual(["Wrc 4"]);
  });

  it("surfaces regional cover titles (TCG multi-lang jaquettes)", async () => {
    const { displayAliasesForItem } = await import("@/core/enrich/aliases");
    expect(
      displayAliasesForItem({
        name: "Ariel - Sur des jambes humaines",
        metadataTitle: "Ariel - Sur des jambes humaines",
        aliases: null,
        attachments: [
          {
            type: "cover",
            role: "fr",
            title: "Ariel - Sur des jambes humaines",
          },
          { type: "cover", role: "en", title: "Ariel - On Human Legs" },
          {
            type: "cover",
            role: "de",
            title: "Arielle - Auf menschlichen Beinen",
          },
          {
            type: "foilMask",
            role: "en",
            title: "Ariel - On Human Legs — masque holographique",
          },
        ],
      }),
    ).toEqual([
      "Ariel - On Human Legs",
      "Arielle - Auf menschlichen Beinen",
    ]);
  });

  it("does not repeat the display name as an alias", async () => {
    const { displayAliasesForItem } = await import("@/core/enrich/aliases");
    expect(
      displayAliasesForItem({
        name: "Wrc 4",
        metadataTitle: "Wrc 4",
        aliases: ["WRC 4"],
      }),
    ).toEqual([]);
  });

  it("drops placeholder, platform-prefixed, and bracket stub aliases", async () => {
    const { displayAliasesForItem, aliasesExcludingTitle } = await import(
      "@/core/enrich/aliases"
    );
    expect(
      displayAliasesForItem({
        name: "Prototype",
        metadataTitle: "Prototype",
        aliases: [
          "[Grand Prototype]",
          "Xbox 360 Prototype",
          "n/c",
          "Prototype®",
        ],
      }),
    ).toEqual([]);

    expect(
      aliasesExcludingTitle(
        "Prototype",
        "[Grand Prototype]",
        "Xbox 360 Prototype",
        "n/c",
        "Прототип",
      ),
    ).toEqual(["Прототип"]);
  });

  it("drops the promoted title from aliases", () => {
    expect(
      promoteTitleKeepingAliases(
        { title: "Naruto Tome 01", aliases: ["Naruto 1"] },
        "Naruto Tome 001",
      ),
    ).toEqual(["Naruto Tome 01", "Naruto 1"]);
  });

  it("returns undefined when no aliases remain", () => {
    expect(aliasesExcludingTitle("Naruto", "Naruto")).toBeUndefined();
  });

  it("collecte les titres provider + regionalTitles + facts aliases", () => {
    expect(
      collectMergedSearchAliases(
        [
          {
            title: "L'Attaque des Titans n°1",
            regionalTitles: [{ text: "L'Attaque des Titans n°1" }],
          },
          {
            title: "Shingeki no Kyojin",
            aliases: ["Attack on Titan"],
          },
        ],
        "L'Attaque des Titans n°1",
      ),
    ).toEqual(["Shingeki no Kyojin", "Attack on Titan"]);
  });

  it("écarte les alias de ligne produit intercalée avant le tome", () => {
    expect(
      collectMergedSearchAliases(
        [
          {
            title: "The Promised Neverland T01",
            aliases: [
              "The Promised Neverland : Gag Manga, Tome 1",
              "Yakusoku no Neverland",
            ],
          },
        ],
        "The Promised Neverland Tome 1",
        "The Promised Neverland Tome 1",
      ),
    ).toEqual(["The Promised Neverland T01", "Yakusoku no Neverland"]);
  });
});
