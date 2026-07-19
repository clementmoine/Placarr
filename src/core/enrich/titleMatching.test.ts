import { describe, expect, it, vi } from "vitest";
import {
  buildGameMetadataFallbackNames,
  buildGameMetadataSearchQueries,
  buildMetadataAlignmentNames,
  buildRequestedTitleFallbackVariants,
  catalogAttachmentTitleConflicts,
  collectCanonicalFallbackNames,
  extractBaseTitleVariant,
  findBetterMetadataMatch,
  franchiseSequelNumbersConflict,
  hasUnrequestedVariantMarker,
  hasUnrequestedSeriesSuffixToken,
  isGenericTitleFragment,
  isMetadataTitleAligned,
  isGameEditionVariant,
  catalogLabelSimilarity,
  distinctiveTokenCoverage,
  franchiseLeadTokens,
  franchiseLeadTokensConflict,
  gameProductIdentityMismatch,
  metadataTitleSimilarity,
  orderFallbackNamesForLocale,
  supplementGameEditionMetadata,
} from "@/core/enrich/titleMatching";

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
    expect(buildRequestedTitleFallbackVariants("Final Fantasy VII")).toEqual(
      expect.arrayContaining(["Final Fantasy 7"]),
    );
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
      expect.arrayContaining(["Pokemon Yellow"]),
    );
    // Le sens accents → sans-accents est structurel (aucune paire nommée) ;
    // l'orthographe accentuée officielle vient des alternate names providers.
    expect(buildRequestedTitleFallbackVariants("Pokémon Jaune")).toEqual(
      expect.arrayContaining(["Pokémon Yellow", "Pokemon Yellow"]),
    );
  });

  it("splits subtitles on colon separators", () => {
    expect(buildRequestedTitleFallbackVariants("La Légende Du Dragon")).toEqual(
      expect.arrayContaining(["Dragon"]),
    );
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
      hasUnrequestedVariantMarker("Dragon Ball Z n°01", "Dragon Ball Z n°01"),
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

  it("rejette la série de base quand Super est demandé", () => {
    expect(
      hasUnrequestedSeriesSuffixToken(
        "Dragon Ball Super n°01",
        "Dragon Ball, Tome 1 : Sangoku",
      ),
    ).toBe(true);
    expect(
      hasUnrequestedSeriesSuffixToken(
        "Dragon Ball Super n°01",
        "Dragon Ball n°01",
      ),
    ).toBe(true);
  });

  it("rejette la série de base quand Z ou GT est demandé", () => {
    expect(
      hasUnrequestedSeriesSuffixToken(
        "Dragon Ball Z - Tome 2",
        "Dragon Ball, tome 2",
      ),
    ).toBe(true);
    expect(
      hasUnrequestedSeriesSuffixToken(
        "Dragon Ball Z n°02",
        "Dragon Ball, Tome 2 : Kaméhaméha",
      ),
    ).toBe(true);
    expect(
      hasUnrequestedSeriesSuffixToken(
        "Dragon Ball GT Tome 2",
        "Dragon Ball, tome 2",
      ),
    ).toBe(true);
    expect(
      hasUnrequestedSeriesSuffixToken(
        "Dragon Ball Z n°02",
        "Dragon Ball Z - Tome 2",
      ),
    ).toBe(false);
  });
});

describe("isMetadataTitleAligned", () => {
  it("rejects iPod/phone case merch for a manga shelf volume", () => {
    expect(
      isMetadataTitleAligned(
        { title: "Coque compatible pour Ipod TOUCH 7 MANGA NARUTO 51" },
        ["Naruto n°51"],
        0.58,
      ),
    ).toBe(false);
  });

  it("rejects LEGO kit listings for a short game franchise title", () => {
    expect(
      isMetadataTitleAligned(
        { title: "LEGO Minecraft 21273 L'attaque du village de ballons Ghast" },
        ["Minecraft"],
        0.42,
      ),
    ).toBe(false);
  });

  it("rejects Boruto catalog titles for a Naruto shelf volume", () => {
    expect(
      franchiseLeadTokens("Naruto n°03"),
    ).toEqual(["naruto"]);
    expect(
      franchiseLeadTokens("Boruto no 03/20: Naruto Next Generations"),
    ).toEqual(["boruto"]);
    expect(
      franchiseLeadTokensConflict(
        "Naruto n°03",
        "Boruto no 03/20: Naruto Next Generations",
      ),
    ).toBe(true);
    expect(
      isMetadataTitleAligned(
        { title: "Boruto no 03/20: Naruto Next Generations" },
        ["Naruto n°03"],
        0.58,
      ),
    ).toBe(false);
  });

  it("accepts Ni no Kuni II english catalog title against french shelf name", () => {
    expect(
      isMetadataTitleAligned(
        { title: "Ni no Kuni II: Revenant Kingdom" },
        ["Ni No Kuni 2 - L’avénement d’un nouveau royaume"],
        0.58,
      ),
    ).toBe(true);
  });

  it("accepts LaunchBox English primary when a French regional title matches the shelf", () => {
    expect(
      isMetadataTitleAligned(
        {
          title: "Tomb Raider: The Last Revelation",
          aliases: [
            "Tomb Raider IV: The Last Revelation",
            "Tomb Raider: La Révélation Finale",
          ],
          regionalTitles: [
            { region: "France", text: "Tomb Raider: La Révélation Finale" },
          ],
        },
        ["Tomb Raider La Revelation Finale"],
        0.58,
      ),
    ).toBe(true);
  });

  it("accepts a slash bundle against a PriceCharting double-pack listing", () => {
    expect(
      isMetadataTitleAligned(
        { title: "Halo Reach & Fable 3 [Double Pack]" },
        ["Halo Reach / Fable III"],
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
    expect(
      franchiseSequelNumbersConflict(
        ["Elden Ring sur Xbox"],
        "elden ring xbox series x one visuel produit",
      ),
    ).toBe(false);
  });

  it("aligns Burnout 3 TakeDown with the colon catalog form", () => {
    expect(
      franchiseSequelNumbersConflict(
        ["Burnout 3 TakeDown"],
        "Burnout 3: Takedown",
      ),
    ).toBe(false);
    expect(
      isMetadataTitleAligned(
        { title: "Burnout 3: Takedown" },
        ["Burnout 3 TakeDown"],
        0.58,
      ),
    ).toBe(true);
  });

  it("keeps Bond 007 catalog titles when the shelf uses the full franchise name", () => {
    expect(
      isMetadataTitleAligned(
        {
          title: "007: Agent Under Fire",
          aliases: ["James Bond 007: Agent Under Fire"],
        },
        ["James Bond 007 Agent Under Fire"],
        0.58,
      ),
    ).toBe(true);
    expect(
      isMetadataTitleAligned(
        { title: "007: Nightfire" },
        ["James Bond 007 Nightfire"],
        0.58,
      ),
    ).toBe(true);
  });

  it("does not treat numbered BD albums as franchise sequel conflicts", () => {
    expect(
      franchiseSequelNumbersConflict(
        ["WAKFU 3 Les Mines de Lamororia"],
        "Wakfu, Tome 3 : Les mines de Lamororia",
      ),
    ).toBe(false);
    expect(
      isMetadataTitleAligned(
        { title: "Wakfu, Tome 3 : Les mines de Lamororia" },
        ["WAKFU 3 Les Mines de Lamororia"],
        0.58,
      ),
    ).toBe(true);
  });

  it("rejects a same-volume BD sibling that drops the album subtitle", () => {
    expect(
      isMetadataTitleAligned(
        { title: "Wakfu, Tome 3 : Shak Shaka" },
        ["WAKFU 3 Les Mines de Lamororia"],
        0.58,
      ),
    ).toBe(false);
    expect(
      isMetadataTitleAligned(
        { title: "Wakfu Tome 3" },
        ["Wakfu, Tome 3 : Les mines de Lamororia"],
        0.58,
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
        [
          "The Binding of Isaac Repentance",
          "The Binding of Isaac Repentance ps5",
        ],
        0.58,
      ),
    ).toBe(false);
    expect(
      isMetadataTitleAligned(
        { title: "The Binding of Isaac Repentance sur PS5" },
        [
          "The Binding of Isaac Repentance",
          "The Binding of Isaac Repentance ps5",
        ],
        0.58,
      ),
    ).toBe(true);
  });

  it("rejects sibling DLC lines via shared franchise prefix, not a product vocabulary", () => {
    expect(
      gameProductIdentityMismatch(
        ["Alan Wake II - Night Springs"],
        "Alan Wake II - The Lake House",
      ),
    ).toBe(true);
    expect(
      gameProductIdentityMismatch(
        ["The Binding of Isaac Repentance"],
        "The Binding of Isaac Afterbirth+",
      ),
    ).toBe(true);
    // Shorter catalog title / base SKU is not a conflicting sibling line.
    expect(
      gameProductIdentityMismatch(
        ["Lollipop Chainsaw RePOP"],
        "Lollipop Chainsaw",
      ),
    ).toBe(false);
    expect(
      gameProductIdentityMismatch(
        ["Alan Wake II"],
        "Alan Wake II - Night Springs",
      ),
    ).toBe(false);
    // Single-token series names are not treated as expansion roots.
    expect(
      gameProductIdentityMismatch(["Pokemon Yellow"], "Pokemon Snap"),
    ).toBe(false);
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
        description:
          "Feudal Japan action-adventure with a much longer synopsis.",
        facts: [{ kind: "rating", label: "IGDB", value: "85/100" }],
      },
    );

    expect(supplemented.title).toBe(
      "Assassin's Creed Shadows: Limited Edition",
    );
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

  it("rejects parallel product lines inserted before the volume marker", () => {
    expect(
      hasUnrequestedSeriesSuffixToken(
        "The Promised Neverland Tome 1",
        "The Promised Neverland : Gag Manga, Tome 1",
      ),
    ).toBe(true);
    expect(
      isMetadataTitleAligned(
        { title: "The Promised Neverland Gag Manga" },
        ["The Promised Neverland"],
        0.58,
      ),
    ).toBe(false);
    expect(
      isMetadataTitleAligned(
        { title: "The Promised Neverland : Gag Manga, Tome 1" },
        ["The Promised Neverland Tome 1"],
        0.58,
      ),
    ).toBe(false);
    // Chapter subtitle after the volume stays allowed.
    expect(
      hasUnrequestedSeriesSuffixToken(
        "Dragon Ball n°01",
        "Dragon Ball 1 . Le nuage supersonique",
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

  it("rejects the base franchise when a spinoff line is requested", () => {
    expect(
      isMetadataTitleAligned(
        { title: "Dragon Ball, Tome 1 : Sangoku" },
        ["Dragon Ball Super n°01"],
        0.58,
      ),
    ).toBe(false);
    expect(
      isMetadataTitleAligned(
        { title: "Dragon Ball Super, Tome 1 : La guerre de l'univers 6" },
        ["Dragon Ball Super n°01"],
        0.58,
      ),
    ).toBe(true);
  });

  it("rejects classic Dragon Ball ISBN titles when Dragon Ball Z is requested", () => {
    expect(
      isMetadataTitleAligned(
        { title: "Dragon Ball, tome 2" },
        ["Dragon Ball Z - Tome 2"],
        0.58,
      ),
    ).toBe(false);
    expect(
      isMetadataTitleAligned(
        { title: "Dragon Ball, Tome 2 : Kaméhaméha" },
        ["Dragon Ball Z n°02"],
        0.58,
      ),
    ).toBe(false);
    expect(
      isMetadataTitleAligned(
        { title: "Dragon Ball Z - Tome 2" },
        ["Dragon Ball Z n°02"],
        0.58,
      ),
    ).toBe(true);
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
          title: "Assassin’s Creed Valhalla DLC Aube du Ragnarok sur PS4",
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
      isMetadataTitleAligned({ title: "DmC & Devil May Cry 5" }, ["DmC"], 0.58),
    ).toBe(false);
  });
});

describe("catalogAttachmentTitleConflicts", () => {
  it("rejects merch case listings that only share a franchise token", () => {
    expect(
      catalogAttachmentTitleConflicts(
        "Naruto n°51",
        "Coque compatible pour Ipod TOUCH 7 MANGA NARUTO 51",
        { mediaType: "books" },
      ),
    ).toBe(true);
  });

  it("rejects base-game catalog art for an official trilogy collection", () => {
    expect(
      catalogAttachmentTitleConflicts(
        "Prince of Persia Trilogy",
        "PS3 Prince of Persia",
        { mediaType: "games" },
      ),
    ).toBe(true);
    expect(
      catalogAttachmentTitleConflicts(
        "Prince of Persia Trilogy",
        "PS3 Prince of Persia Trilogy: 3 Full Games",
        { mediaType: "games" },
      ),
    ).toBe(false);
  });

  it("rejects non-game media titles on game shelves", () => {
    expect(
      catalogAttachmentTitleConflicts(
        "La Mémoire dans la peau",
        "La Mémoire dans la peau [Blu-ray]",
        { mediaType: "games" },
      ),
    ).toBe(true);
    expect(
      catalogAttachmentTitleConflicts(
        "La Mémoire dans la peau",
        "La Mémoire dans la peau [Blu-ray]",
        { mediaType: "movies" },
      ),
    ).toBe(false);
  });

  it("rejects another comic line that only shares a franchise token", () => {
    expect(
      catalogAttachmentTitleConflicts(
        "Les Trésors de Picsou n°1",
        "Les âges d'or de Picsou, Tome 1",
        { mediaType: "books" },
      ),
    ).toBe(true);
  });

  it("rejects generic base art when a specific subtitle is requested", () => {
    expect(
      catalogAttachmentTitleConflicts(
        "Ratchet and Clank: Q-Force",
        "PS3 Ratchet & Clank",
        { mediaType: "games" },
      ),
    ).toBe(true);
    expect(
      catalogAttachmentTitleConflicts(
        "Ratchet and Clank: Q-Force",
        "Ratchet & Clank: QForce PS3",
        { mediaType: "games" },
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

  it("still flags subtitle-only fragments missing franchise identity", () => {
    expect(
      isGenericTitleFragment("Retour vers le passé", [
        "The Lapins Crétins : Retour vers le passé",
      ]),
    ).toBe(true);
  });

  it("does not flag 007 catalog titles that keep the series code", () => {
    expect(
      isGenericTitleFragment("007: Agent Under Fire", [
        "James Bond 007 Agent Under Fire",
      ]),
    ).toBe(false);
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

  it("prefers the remake whose releaseDate matches Title (YYYY)", async () => {
    const result = await findBetterMetadataMatch(
      "Resident Evil 4 (2023)",
      {
        title: "Resident Evil 4",
        releaseDate: "2005-01-11",
      },
      ["Resident Evil 4"],
      async () => ({
        title: "Resident Evil 4",
        releaseDate: "2023-03-24",
      }),
    );
    expect(result?.releaseDate).toBe("2023-03-24");
  });
});

describe("buildGameMetadataSearchQueries year disambiguators", () => {
  it("searches without parenthetical years and keeps them for alignment", () => {
    const queries = buildGameMetadataSearchQueries(
      "Resident Evil 4 (2023)",
      "playstation-4",
      "PlayStation 4",
    );
    expect(queries[0]).toBe("Resident Evil 4");
    expect(queries.some((q) => q.includes("2023"))).toBe(false);
    expect(buildMetadataAlignmentNames("Resident Evil 4 (2023)")).toEqual(
      expect.arrayContaining([
        "Resident Evil 4 (2023)",
        "Resident Evil 4",
      ]),
    );
  });
});

describe("catalogLabelSimilarity", () => {
  it("boosts a long catalog label that embeds every distinctive query token", () => {
    expect(
      catalogLabelSimilarity(
        "les tresors de picsou",
        "Picsou Magazine (hors-série, les trésors de Picsou)",
      ),
    ).toBeGreaterThan(
      catalogLabelSimilarity("les tresors de picsou", "Les âges d'or de Picsou"),
    );
    expect(
      catalogLabelSimilarity(
        "les tresors de picsou",
        "Picsou Magazine (hors-série, les trésors de Picsou)",
      ),
    ).toBeGreaterThanOrEqual(0.85);
  });

  it("reports full distinctive token coverage for embedded sub-series labels", () => {
    expect(
      distinctiveTokenCoverage(
        "les tresors de picsou",
        "Picsou Magazine (hors-série, les trésors de Picsou)",
      ),
    ).toBe(1);
    expect(
      distinctiveTokenCoverage("les tresors de picsou", "Les âges d'or de Picsou"),
    ).toBe(0.5);
  });
});

describe("metadataTitleSimilarity", () => {
  it("does not treat pokemon franchise siblings as aligned via string distance", () => {
    expect(
      metadataTitleSimilarity("Pokemon Jaune", "Pokemon Snap"),
    ).toBeLessThan(0.58);
  });

  it("does not treat Parrain and Parkan sequels as the same product", () => {
    expect(metadataTitleSimilarity("Le Parrain 2", "Parkan II")).toBeLessThan(
      0.58,
    );
    expect(
      isMetadataTitleAligned({ title: "Parkan II" }, ["Le Parrain 2"], 0.58),
    ).toBe(false);
  });

  it("rejects Bakuman ↔ Batman / Bat Man false friends", () => {
    expect(metadataTitleSimilarity("Bakuman", "Batman")).toBeLessThan(0.55);
    expect(metadataTitleSimilarity("Bakuman n°01", "Bat Man n°1")).toBeLessThan(
      0.55,
    );
    expect(
      isMetadataTitleAligned({ title: "Bat Man n°1" }, ["Bakuman n°01"], 0.55),
    ).toBe(false);
    expect(
      isMetadataTitleAligned({ title: "Batman" }, ["Bakuman n°01"], 0.55),
    ).toBe(false);
  });

  it("keeps cross-language pokemon version titles aligned", () => {
    expect(
      metadataTitleSimilarity("Pokemon Jaune", "Pokemon Yellow"),
    ).toBeGreaterThanOrEqual(0.58);
  });

  it("aligns FR retail titles via provider alternate names, not a hand map", () => {
    // Deux chaînes nues de langues différentes sans recouvrement lexical :
    // pas de corroboration forcée par une table de traduction par-produit.
    expect(
      metadataTitleSimilarity(
        "Destiny Le Roi des Corrompus",
        "Destiny: The Taken King",
      ),
    ).toBeLessThan(0.58);

    // Avec les alternate names / titres régionaux du provider (IGDB, SS…),
    // l'alignement passe par les données.
    expect(
      isMetadataTitleAligned(
        {
          title: "Destiny: The Taken King",
          regionalTitles: [
            { region: "fr", text: "Destiny : Le Roi des Corrompus" },
          ],
        },
        ["Destiny Le Roi des Corrompus"],
        0.58,
      ),
    ).toBe(true);
  });

  it("aligns AC III FR packaging via ScreenScraper-style regionalTitles", () => {
    expect(
      isMetadataTitleAligned(
        {
          title: "Assassin's Creed III",
          regionalTitles: [
            {
              region: "fr",
              text: "Assassin's Creed III : Naissance d'un Nouveau Monde",
            },
            {
              region: "wor",
              text: "Assassin's Creed III: Birth of a New World",
            },
          ],
        },
        ["Assassin's Creed III: Naissance d'un Nouveau Monde"],
        0.58,
      ),
    ).toBe(true);
  });

  it("aligns Star Wars collection FR/EN via provider regionalTitles", () => {
    expect(
      isMetadataTitleAligned(
        {
          title: "Star Wars : La Saga américaine",
          regionalTitles: [
            { region: "fr", text: "Star Wars : La Saga américaine" },
            { region: "wor", text: "Star Wars: The American Saga" },
          ],
        },
        ["Star Wars: La Saga américaine"],
        0.58,
      ),
    ).toBe(true);
  });
});
