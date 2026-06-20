import { describe, expect, it } from "vitest";
import {
  buildGameMetadataFallbackNames,
  buildRequestedTitleFallbackVariants,
  collectCanonicalFallbackNames,
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
