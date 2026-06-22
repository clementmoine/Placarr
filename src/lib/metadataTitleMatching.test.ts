import { describe, expect, it } from "vitest";
import {
  buildGameMetadataFallbackNames,
  buildRequestedTitleFallbackVariants,
  collectCanonicalFallbackNames,
  extractBaseTitleVariant,
  isGenericTitleFragment,
  isMetadataTitleAligned,
  orderFallbackNamesForLocale,
} from "@/lib/metadataTitleMatching";

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
  it("maps La Légende Du X to Legend of the X", () => {
    expect(buildRequestedTitleFallbackVariants("La Légende Du Dragon")).toEqual(
      expect.arrayContaining(["Legend of the Dragon", "Legend of Dragon"]),
    );
  });

  it("includes the base title when an edition/subtitle qualifier is present", () => {
    expect(
      buildRequestedTitleFallbackVariants("Monopoly - Editions Classique Et Monde"),
    ).toEqual(expect.arrayContaining(["Monopoly"]));
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

describe("isMetadataTitleAligned", () => {
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

  it("rejects unrelated titles even with alternates present", () => {
    expect(
      isMetadataTitleAligned(
        { title: "Super Mario Bros." },
        ["Zapper : Le Criquet Ravageur !", "Zapper: One Wicked Cricket!"],
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
    expect(isGenericTitleFragment("Mario Kart", ["Mario Kart Wii"])).toBe(false);
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
