import { describe, expect, it, vi } from "vitest";
import {
  buildGameMetadataFallbackNames,
  buildRequestedTitleFallbackVariants,
  collectCanonicalFallbackNames,
  extractBaseTitleVariant,
  findBetterMetadataMatch,
  franchiseSequelNumbersConflict,
  hasUnrequestedVariantMarker,
  hasUnrequestedSeriesSuffixToken,
  isGenericTitleFragment,
  isMetadataTitleAligned,
  isGameEditionVariant,
  metadataTitleSimilarity,
  orderFallbackNamesForLocale,
  supplementGameEditionMetadata,
} from "@/lib/metadata/titleMatching";

describe("collectCanonicalFallbackNames", () => {
  it("prioritizes regional French titles from provider metadata", () => {
    const names = collectCanonicalFallbackNames("GoldenEye", [
      {
        title: "GoldenEye: Rogue Agent",
        regionalTitles: [
          { region: "us", text: "GoldenEye: Rogue Agent" },
          { region: "fr", text: "GoldenEye : Au Service du Mal" },
        ],
        aliases: ["007: GoldenEye Rogue Agent"],
      },
    ]);

    expect(names).toEqual(
      expect.arrayContaining([
        "GoldenEye : Au Service du Mal",
        "GoldenEye: Rogue Agent",
        "007: GoldenEye Rogue Agent",
      ]),
    );
  });
});

describe("orderFallbackNamesForLocale", () => {
  it("sorts French titles before English equivalents", () => {
    expect(
      orderFallbackNamesForLocale("Le Tiers Age", [
        "The Lord of the Rings: The Third Age",
        "Le Seigneur Des Anneaux : Le Tiers Age",
      ]),
    ).toEqual([
      "Le Seigneur Des Anneaux : Le Tiers Age",
      "The Lord of the Rings: The Third Age",
    ]);
  });
});

describe("buildGameMetadataFallbackNames", () => {
  it("merges barcode alternates and provider aliases with FR first", () => {
    const names = buildGameMetadataFallbackNames(
      "Zapper : Le Criquet Ravageur !",
      ["Zapper: One Wicked Cricket!"],
      [
        {
          title: "Zapper: One Wicked Cricket!",
          aliases: ["Zapper!"],
        },
      ],
    );

    expect(names[0]).toMatch(/criquet|zapper/i);
    expect(names).toEqual(
      expect.arrayContaining(["Zapper: One Wicked Cricket!", "Zapper!"]),
    );
  });
});

describe("buildRequestedTitleFallbackVariants", () => {
  it("maps roman numerals in titles via romanizr", () => {
    expect(
      buildRequestedTitleFallbackVariants("Final Fantasy VII"),
    ).toEqual(expect.arrayContaining(["Final Fantasy 7"]));
  });

  it("includes the base title when an edition/subtitle qualifier is present", () => {
    expect(
      buildRequestedTitleFallbackVariants(
        "Monopoly - Editions Classique Et Monde",
      ),
    ).toEqual(expect.arrayContaining(["Monopoly"]));
  });

  it("maps french colour names to english equivalents", () => {
    expect(buildRequestedTitleFallbackVariants("Pokemon Jaune")).toEqual(
      expect.arrayContaining(["Pokemon Yellow", "Pokémon Yellow"]),
    );
  });

  it("splits subtitles on colon separators", () => {
    expect(
      buildRequestedTitleFallbackVariants("La Légende Du Dragon"),
    ).toEqual(expect.arrayContaining(["Dragon"]));
  });
});

describe("extractBaseTitleVariant", () => {
  it("strips a trailing edition qualifier after a spaced dash", () => {
    expect(
      extractBaseTitleVariant("Monopoly - Editions Classique Et Monde"),
    ).toBe("Monopoly");
  });

  it("strips a trailing edition qualifier after a colon", () => {
    expect(
      extractBaseTitleVariant("Monopoly : Editions Classique et Monde"),
    ).toBe("Monopoly");
  });

  it("keeps a meaningful subtitle and strips only the trailing edition", () => {
    expect(
      extractBaseTitleVariant(
        "The Legend of Zelda: Skyward Sword - Edition Limitée",
      ),
    ).toBe("The Legend of Zelda: Skyward Sword");
  });

  it("does not strip a meaningful subtitle that is not an edition", () => {
    expect(
      extractBaseTitleVariant("The Legend of Zelda: Skyward Sword"),
    ).toBeNull();
  });

  it("does not split hyphenated names without surrounding spaces", () => {
    expect(extractBaseTitleVariant("Spider-Man")).toBeNull();
  });

  it("returns null when there is no qualifier to strip", () => {
    expect(extractBaseTitleVariant("Mario Kart Wii")).toBeNull();
  });

  it("strips trailing deluxe/collector words without a separator", () => {
    expect(extractBaseTitleVariant("Tekken 7 Deluxe Edition")).toBe("Tekken 7");
  });
});

describe("buildGameMetadataFallbackNames base-title ordering", () => {
  it("surfaces the base title ahead of noisy marketplace barcode listings", () => {
    const names = buildGameMetadataFallbackNames(
      "Monopoly - Editions Classique Et Monde",
      [
        "Monopoly Edition Classique et Monde Nintendo Wii FR PAL TBE Complet Testé",
        "monopoly edition classique et monde +pub etat tbe",
        "Monopoly Edition Classique Et Monde / Nintendo Jouable sur",
      ],
      [{ title: "Monopoly : Editions Classique et Monde" }],
    );

    const baseIndex = names.findIndex((n) => n.toLowerCase() === "monopoly");
    expect(baseIndex).toBeGreaterThanOrEqual(0);
    expect(baseIndex).toBeLessThan(12);
  });
});

describe("hasUnrequestedVariantMarker", () => {
  it("rejette les spinoffs SD/Z absents de la requête", () => {
    expect(
      hasUnrequestedVariantMarker("Dragon Ball n°01", "Dragon Ball SD no 01"),
    ).toBe(true);
    expect(
      hasUnrequestedVariantMarker("One Piece n°02", "One Piece Z, tome 2"),
    ).toBe(true);
  });

  it("accepte les séries dont le marqueur fait partie de la requête", () => {
    expect(
      hasUnrequestedVariantMarker(
        "Dragon Ball Z n°01",
        "Dragon Ball Z n°01",
      ),
    ).toBe(false);
    expect(
      hasUnrequestedVariantMarker("Dragon Ball n°01", "Dragon Ball n°01"),
    ).toBe(false);
  });
});

describe("hasUnrequestedSeriesSuffixToken", () => {
  it("rejette les dérivés guide/artbook avec suffixe élargi", () => {
    expect(
      hasUnrequestedSeriesSuffixToken(
        "Dragon Ball Super n°01",
        "Dragon Ball - Le super livre, Tome 1",
      ),
    ).toBe(true);
  });

  it("accepte les sous-titres d'album après le tome", () => {
    expect(
      hasUnrequestedSeriesSuffixToken(
        "Dragon Ball n°01",
        "Dragon Ball 1 . Le nuage supersonique",
      ),
    ).toBe(false);
  });

  it("rejette les spinoffs quand seule la série de base est demandée", () => {
    expect(
      hasUnrequestedSeriesSuffixToken(
        "Dragon Ball n°01",
        "Dragon Ball SD no 01",
      ),
    ).toBe(true);
  });

  it("rejette les jeux dérivés quand seul le manga est demandé", () => {
    expect(
      hasUnrequestedSeriesSuffixToken(
        "Dragon Ball Z n°01",
        "Dragonball Z Taiketsu",
      ),
    ).toBe(false);
    expect(
      isMetadataTitleAligned(
        { title: "Dragonball Z Taiketsu" },
        ["Dragon Ball Z n°01"],
        0.58,
      ),
    ).toBe(false);
  });
});

describe("isMetadataTitleAligned", () => {
  it("accepts Ni no Kuni II english catalog title against french shelf name", () => {
    expect(
      isMetadataTitleAligned(
        { title: "Ni no Kuni II: Revenant Kingdom" },
        ["Ni No Kuni 2 - L’avénement d’un nouveau royaume"],
        0.58,
      ),
    ).toBe(true);
  });

  it("accepts IGDB English title against French request and barcode alternates", () => {
    expect(
      isMetadataTitleAligned(
        { title: "Zapper: One Wicked Cricket!" },
        ["Zapper : Le Criquet Ravageur !", "Zapper: One Wicked Cricket!"],
        0.58,
      ),
    ).toBe(true);
  });

  it("accepts LOTR English title against French catalog name", () => {
    expect(
      isMetadataTitleAligned(
        { title: "The Lord of the Rings: The Third Age" },
        [
          "Le Seigneur Des Anneaux : Le Tiers Age",
          "The Lord of the Rings: The Third Age",
        ],
        0.58,
      ),
    ).toBe(true);
  });

  it("rejects the first game when a numbered sequel was requested", () => {
    expect(
      isMetadataTitleAligned(
        { title: "Baldur's Gate" },
        ["Baldur's Gate 3: Deluxe Edition", "Baldur's Gate 3"],
        0.58,
      ),
    ).toBe(false);
    expect(
      isMetadataTitleAligned(
        { title: "Baldur's Gate 3" },
        ["Baldur's Gate 3: Deluxe Edition", "Baldur's Gate 3"],
        0.58,
      ),
    ).toBe(true);
  });

  it("detects conflicting franchise sequel numbers", () => {
    expect(
      franchiseSequelNumbersConflict(
        ["Borderlands 1 - Game of the Year edition"],
        "Borderlands 3 [Deluxe Edition]",
      ),
    ).toBe(true);
    expect(
      franchiseSequelNumbersConflict(
        ["Borderlands 1 - Game of the Year edition"],
        "Borderlands 3 PS4",
      ),
    ).toBe(true);
    expect(
      franchiseSequelNumbersConflict(
        ["Borderlands 1 - Game of the Year edition"],
        "Borderlands [Game of the Year]",
      ),
    ).toBe(false);
    expect(
      franchiseSequelNumbersConflict(
        ["Little Nightmares"],
        "Little Nightmares II PS4",
      ),
    ).toBe(true);
    expect(
      franchiseSequelNumbersConflict(
        ["Little Nightmares"],
        "Little Nightmares PS4",
      ),
    ).toBe(false);
  });

  it("accepts Borderlands GOTY catalog title without sequel number", () => {
    expect(
      isMetadataTitleAligned(
        { title: "Borderlands [Game of the Year]" },
        ["Borderlands 1 - Game of the Year edition"],
        0.58,
      ),
    ).toBe(true);
    expect(
      isMetadataTitleAligned(
        { title: "Borderlands [Game of the Year]" },
        ["Borderlands - Game of the Year edition"],
        0.58,
      ),
    ).toBe(true);
    expect(
      isMetadataTitleAligned(
        { title: "Baldur's Gate" },
        ["Baldur's Gate 3: Deluxe Edition", "Baldur's Gate 3"],
        0.58,
      ),
    ).toBe(false);
  });

  it("rejects a sibling Isaac expansion when Repentance was requested", () => {
    expect(
      isMetadataTitleAligned(
        { title: "The Binding of Isaac Afterbirth+ sur PS5" },
        ["The Binding of Isaac Repentance", "The Binding of Isaac Repentance ps5"],
        0.58,
      ),
    ).toBe(false);
    expect(
      isMetadataTitleAligned(
        { title: "The Binding of Isaac Repentance sur PS5" },
        ["The Binding of Isaac Repentance", "The Binding of Isaac Repentance ps5"],
        0.58,
      ),
    ).toBe(true);
  });

  it("rejects another game's deluxe edition that only shares the qualifier", () => {
    expect(
      isMetadataTitleAligned(
        { title: "Distraint: Deluxe Edition" },
        ["Alan Wake II - Deluxe Edition", "Alan Wake II", "Alan Wake 2"],
        0.58,
      ),
    ).toBe(false);
    expect(
      isMetadataTitleAligned(
        { title: "Alan Wake II: Deluxe Edition" },
        ["Alan Wake II - Deluxe Edition", "Alan Wake II", "Alan Wake 2"],
        0.58,
      ),
    ).toBe(true);
  });

  it("aggregates limited edition metadata with the base game", () => {
    expect(
      isGameEditionVariant("Assassin's Creed Shadows - Limited Edition"),
    ).toBe(true);

    const supplemented = supplementGameEditionMetadata(
      "Assassin's Creed Shadows - Limited Edition",
      {
        title: "Assassin's Creed Shadows: Limited Edition",
        description: "Short edition blurb.",
        facts: [{ kind: "price", label: "PriceCharting", value: "79 €" }],
      },
      {
        title: "Assassin's Creed Shadows",
        description: "Feudal Japan action-adventure with a much longer synopsis.",
        facts: [{ kind: "rating", label: "IGDB", value: "85/100" }],
      },
    );

    expect(supplemented.title).toBe("Assassin's Creed Shadows: Limited Edition");
    expect(supplemented.description).toContain("Feudal Japan");
    expect(supplemented.facts).toHaveLength(2);
  });

  it("accepts stylized fused titles against their spaced catalog names", () => {
    expect(
      isMetadataTitleAligned(
        { title: "Ball x Pit" },
        ["BallXPitt", "Ball X Pit", "Ball X Pitt", "Ball Pit"],
        0.58,
      ),
    ).toBe(true);
  });

  it("rejects spinoff markers absent from the requested title", () => {
    expect(
      isMetadataTitleAligned(
        { title: "Dragon Ball SD no 01" },
        ["Dragon Ball n°01"],
        0.58,
      ),
    ).toBe(false);
    expect(
      isMetadataTitleAligned(
        { title: "One Piece Z, tome 2" },
        ["One Piece n°02"],
        0.58,
      ),
    ).toBe(false);
  });

  it("rejects guide books mistaken for numbered manga volumes", () => {
    expect(
      isMetadataTitleAligned(
        { title: "Dragon Ball - Le super livre, Tome 1" },
        ["Dragon Ball Super n°01"],
        0.58,
      ),
    ).toBe(false);
  });

  it("accepts bedetheque album subtitles for the requested volume", () => {
    expect(
      isMetadataTitleAligned(
        { title: "Dragon Ball 1 . Le nuage supersonique" },
        ["Dragon Ball n°01"],
        0.58,
      ),
    ).toBe(true);
  });

  it("rejects unrelated titles even with alternates present", () => {
    expect(
      isMetadataTitleAligned(
        { title: "Super Mario Bros." },
        ["Zapper : Le Criquet Ravageur !", "Zapper: One Wicked Cricket!"],
        0.58,
      ),
    ).toBe(false);
  });

  it("rejects a result that drops an explicitly requested issue number", () => {
    expect(
      isMetadataTitleAligned(
        { title: "Super Picsou Geant" },
        ["Super Picsou Géant n°01"],
        0.58,
      ),
    ).toBe(false);
  });

  it("accepts the same issue number with a different spelling", () => {
    expect(
      isMetadataTitleAligned(
        { title: "Super picsou geant N° 1" },
        ["Super Picsou Géant n°01"],
        0.58,
      ),
    ).toBe(true);
  });

  it("rejects a different numbered volume from another collection", () => {
    expect(
      isMetadataTitleAligned(
        { title: "La grande histoire de Picsou Tome 1" },
        ["Super Picsou Géant n°12"],
        0.58,
      ),
    ).toBe(false);
  });

  it("rejects an arbitrary volume when the request is only the collection", () => {
    expect(
      isMetadataTitleAligned(
        { title: "Fullmetal Alchemist - Tome 17" },
        ["Fullmetal Alchemist"],
        0.58,
      ),
    ).toBe(false);
  });

  it("accepts a numbered result when a barcode alternate carries that number", () => {
    expect(
      isMetadataTitleAligned(
        { title: "Death Note - Vol. 1" },
        ["Death Note", "Death Note Vol 1"],
        0.58,
      ),
    ).toBe(true);
  });

  it("rejects franchise siblings with different subtitles", () => {
    expect(
      isMetadataTitleAligned(
        { title: "Pokemon Snap" },
        ["Pokemon Jaune"],
        0.58,
      ),
    ).toBe(false);
  });

  it("accepts cross-language pokemon version titles", () => {
    expect(
      isMetadataTitleAligned(
        { title: "Pokemon Yellow" },
        ["Pokemon Jaune"],
        0.58,
      ),
    ).toBe(true);
  });

  it("accepts chocobonplan titles with a trailing sur PS4 suffix", () => {
    expect(
      isMetadataTitleAligned({ title: "Silt sur PS4" }, ["Silt"], 0.58),
    ).toBe(true);
    expect(
      isMetadataTitleAligned(
        { title: "Tekken 7 sur PS4" },
        ["Tekken 7 Deluxe Edition"],
        0.58,
      ),
    ).toBe(true);
  });

  it("accepts valhalla dlc listings with neutral platform markers", () => {
    const alignmentNames = [
      "Assassin’s Creed Valhalla l’Aube du Ragnarok",
      "Assassin’s Creed Valhalla l’Dawn of ragnarok",
      "Assassin’s Creed Valhalla l’Laube du ragnarok",
    ];
    expect(
      isMetadataTitleAligned(
        {
          title:
            "Assassin’s Creed Valhalla DLC Aube du Ragnarok sur PS4",
        },
        alignmentNames,
        0.58,
      ),
    ).toBe(true);
  });

  it("rejects franchise spinoffs when only the platform-suffixed query would match", () => {
    expect(
      isMetadataTitleAligned(
        { title: "PS4 The Great Ace Attorney Chronicles" },
        [
          "Ace Attorney Investigations Collection",
          "Ace Attorney Investigations Collection ps4",
        ],
        0.58,
      ),
    ).toBe(false);
  });

  it("rejects sequel bundles when only the base game was requested", () => {
    expect(
      isMetadataTitleAligned(
        { title: "Little Nightmares & Little Nightmares II" },
        ["Little Nightmares"],
        0.58,
      ),
    ).toBe(false);
    expect(
      isMetadataTitleAligned(
        { title: "DmC & Devil May Cry 5" },
        ["DmC"],
        0.58,
      ),
    ).toBe(false);
  });
});

describe("isGenericTitleFragment", () => {
  it("flags a generic subtitle fragment missing the franchise identity", () => {
    // RAWG matched the itch.io game "Retour vers le passé" — shares the generic
    // subtitle but drops the "Lapins Crétins" identity.
    expect(
      isGenericTitleFragment("Retour vers le passé", [
        "The Lapins Crétins : Retour vers le passé",
        "Raving Rabbids : Travel in Time",
      ]),
    ).toBe(true);
  });

  it("does not flag a base title that keeps the leading identity token", () => {
    expect(
      isGenericTitleFragment("Monopoly", [
        "Monopoly - Editions Classique Et Monde",
      ]),
    ).toBe(false);
    expect(isGenericTitleFragment("Mario Kart", ["Mario Kart Wii"])).toBe(
      false,
    );
    expect(
      isGenericTitleFragment("The Legend of Zelda: Skyward Sword", [
        "The Legend of Zelda: Skyward Sword - Edition Limitée",
      ]),
    ).toBe(false);
  });

  it("does not flag the correct full title", () => {
    expect(
      isGenericTitleFragment("Raving Rabbids: Travel in Time", [
        "The Lapins Crétins : Retour vers le passé",
        "Raving Rabbids : Travel in Time",
      ]),
    ).toBe(false);
  });

  it("returns false when there is no title", () => {
    expect(isGenericTitleFragment(undefined, ["Anything"])).toBe(false);
  });
});

describe("findBetterMetadataMatch", () => {
  it("skips resolution while quota is blocked", async () => {
    const resolveByName = vi.fn();
    const result = await findBetterMetadataMatch(
      "Pokemon Jaune",
      { title: "Pokemon Yellow Version" },
      ["Pokemon Jaune", "Pokemon Yellow"],
      resolveByName,
      { isQuotaBlocked: () => true },
    );
    expect(result).toBeNull();
    expect(resolveByName).not.toHaveBeenCalled();
  });

  it("returns a better aligned candidate from fallback names", async () => {
    const result = await findBetterMetadataMatch(
      "Pokemon Jaune",
      { title: "Pokemon Yellow Version - Player's Choice" },
      ["Pokemon Jaune", "Pokemon Yellow"],
      async (name) =>
        name === "Pokemon Jaune"
          ? { title: "Pokemon Jaune" }
          : { title: "Pokemon Yellow" },
    );
    expect(result?.title).toBe("Pokemon Jaune");
  });
});

describe("metadataTitleSimilarity", () => {
  it("does not treat pokemon franchise siblings as aligned via string distance", () => {
    expect(metadataTitleSimilarity("Pokemon Jaune", "Pokemon Snap")).toBeLessThan(
      0.58,
    );
  });

  it("keeps cross-language pokemon version titles aligned", () => {
    expect(
      metadataTitleSimilarity("Pokemon Jaune", "Pokemon Yellow"),
    ).toBeGreaterThanOrEqual(0.58);
  });

  it("aligns destiny french retail title with the taken king", () => {
    expect(
      metadataTitleSimilarity(
        "Destiny Le Roi des Corrompus",
        "Destiny: The Taken King",
      ),
    ).toBeGreaterThanOrEqual(0.58);
  });
});
