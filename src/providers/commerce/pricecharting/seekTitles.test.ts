import { describe, expect, it } from "vitest";

import { priceChartingCatalogAlignsWithTitles } from "./fetch";
import {
  priceChartingAcceptanceTitleBag,
  rankPriceChartingSeekTitles,
} from "./seekTitles";

describe("rankPriceChartingSeekTitles", () => {
  it("tries specific regional/edition titles before bare franchise labels", () => {
    const ranked = rankPriceChartingSeekTitles(
      [
        "Need for Speed: Conduit en État de liberté",
        "Need for Speed : High Stakes",
        "Need for Speed",
        "Road & Track Presents: The Need for Speed",
        "NFS: High Stakes",
      ],
      "Need for Speed: Conduit en État de liberté",
    );

    const highStakesIdx = ranked.findIndex((title) =>
      /high stakes/i.test(title),
    );
    const bareIdx = ranked.findIndex(
      (title) => title.toLowerCase() === "need for speed",
    );
    expect(highStakesIdx).toBeGreaterThanOrEqual(0);
    expect(bareIdx).toBeGreaterThanOrEqual(0);
    expect(highStakesIdx).toBeLessThan(bareIdx);
  });

  it("keeps in-family aliases ahead of outlier franchise entries", () => {
    const ranked = rankPriceChartingSeekTitles(
      [
        "Need for Speed: Conduit en État de liberté",
        "Need for Speed : Conduite en état de liberté",
        "Need for Speed: High Stakes",
        "Road & Track Presents: The Need for Speed",
      ],
      "Need for Speed: Conduit en État de liberté",
    );

    expect(ranked[0]).toMatch(/conduit|conduite/i);
    const roadTrackIdx = ranked.findIndex((title) =>
      /road\s*&\s*track/i.test(title),
    );
    const highStakesIdx = ranked.findIndex((title) =>
      /high stakes/i.test(title),
    );
    expect(highStakesIdx).toBeLessThan(roadTrackIdx);
  });
});

describe("priceChartingAcceptanceTitleBag", () => {
  it("keeps High Stakes / Conduite and drops bare + wrong-generation outliers", () => {
    const bag = priceChartingAcceptanceTitleBag([
      "Need for Speed: Conduit en État de liberté",
      "Need for Speed: High Stakes",
      "Need for Speed : Conduite en état de liberté",
      "Road & Track Presents: The Need for Speed",
      "Need for Speed",
    ]);
    expect(bag.some((title) => /high stakes/i.test(title))).toBe(true);
    expect(bag.some((title) => /conduite/i.test(title))).toBe(true);
    expect(bag.some((title) => /road\s*&\s*track/i.test(title))).toBe(false);
    expect(bag.some((title) => title.toLowerCase() === "need for speed")).toBe(
      false,
    );
    expect(bag[0]).toMatch(/conduit/i);
  });

  it("keeps a bag-listed color sibling without inventing rose≡pink", () => {
    const bag = priceChartingAcceptanceTitleBag([
      "Sony Playstation 2 Slim Rose",
      "Playstation 2 Slim Pink",
    ]);
    expect(bag).toEqual([
      "Sony Playstation 2 Slim Rose",
      "Playstation 2 Slim Pink",
    ]);
  });
});

describe("priceChartingCatalogAlignsWithTitles", () => {
  it("accepts High Stakes against the FR typo title + aliases bag", () => {
    expect(
      priceChartingCatalogAlignsWithTitles("Need For Speed High Stakes", [
        "Need for Speed: Conduit en État de liberté",
        "Need for Speed : High Stakes",
        "Need for Speed : Conduite en état de liberté",
        "Need for Speed: High Stakes",
        "Need for Speed",
        "Road & Track Presents: The Need for Speed",
      ]),
    ).toBe(true);
  });

  it("rejects the first NFS when the bag knows High Stakes", () => {
    expect(
      priceChartingCatalogAlignsWithTitles(
        "Road & Track Presents: The Need for Speed",
        [
          "Need for Speed: Conduit en État de liberté",
          "Need for Speed : High Stakes",
          "Need for Speed: High Stakes",
          "Need for Speed",
          "Road & Track Presents: The Need for Speed",
        ],
      ),
    ).toBe(false);
  });

  it("rejects a bare-franchise false friend when specific aliases disagree", () => {
    expect(
      priceChartingCatalogAlignsWithTitles("Need for Speed", [
        "Need for Speed: High Stakes",
        "NFS: High Stakes",
        "Need for Speed",
      ]),
    ).toBe(false);
  });

  it("rejects FIFA 2002 Road-to-World-Cup as a distinct spinoff", () => {
    expect(
      priceChartingCatalogAlignsWithTitles(
        "FIFA 2002: Road to FIFA World Cup",
        ["FIFA 2002"],
      ),
    ).toBe(false);
    expect(
      priceChartingCatalogAlignsWithTitles("FIFA Football 2002", ["FIFA 2002"]),
    ).toBe(true);
  });

  it("accepts regional FR subtitle vs US Enter Electro on primary alone", () => {
    expect(
      priceChartingCatalogAlignsWithTitles("Spiderman 2 Enter Electro", [
        "Spider-Man 2 : La Revanche d'Electro",
      ]),
    ).toBe(true);
  });

  it("rejects wrong Spider-Man titles when only the FR primary is known", () => {
    expect(
      priceChartingCatalogAlignsWithTitles("Amazing Spider-Man", [
        "Spider-Man 2 : La Revanche d'Electro",
      ]),
    ).toBe(false);
    expect(
      priceChartingCatalogAlignsWithTitles("Spiderman Sinister Six", [
        "Spider-Man 2 : La Revanche d'Electro",
      ]),
    ).toBe(false);
  });

  it("keeps EN Eternal Wings in the acceptance bag beside the FR primary", () => {
    const bag = priceChartingAcceptanceTitleBag([
      "Baten Kaitos : Les Ailes éternelles et l'Océan perdu",
      "Baten Kaitos - Eternal Wings and the Lost Ocean",
      "Baten Kaitos II",
      "Baten Kaitos 2",
    ]);
    expect(bag.some((title) => /eternal wings/i.test(title))).toBe(true);
    expect(bag.some((title) => /\bII\b|\b2\b/i.test(title))).toBe(false);
  });

  it("accepts short PC catalog Baten Kaitos when search confirmed the franchise stem", () => {
    expect(
      priceChartingCatalogAlignsWithTitles(
        "Baten Kaitos",
        [
          "Baten Kaitos : Les Ailes éternelles et l'Océan perdu",
          "Baten Kaitos - Eternal Wings and the Lost Ocean",
        ],
        { allowFranchiseStem: true },
      ),
    ).toBe(true);
  });

  it("still rejects short Baten Kaitos without search-confirmed stem allowance", () => {
    expect(
      priceChartingCatalogAlignsWithTitles("Baten Kaitos", [
        "Baten Kaitos : Les Ailes éternelles et l'Océan perdu",
        "Baten Kaitos - Eternal Wings and the Lost Ocean",
      ]),
    ).toBe(false);
  });

  it("rejects Origins even with franchise-stem allowance", () => {
    expect(
      priceChartingCatalogAlignsWithTitles(
        "Baten Kaitos Origins",
        [
          "Baten Kaitos : Les Ailes éternelles et l'Océan perdu",
          "Baten Kaitos - Eternal Wings and the Lost Ocean",
        ],
        { allowFranchiseStem: true },
      ),
    ).toBe(false);
  });

  it("accepts short Pokemon Yellow catalog for the Special Pikachu Edition bag", () => {
    expect(
      priceChartingCatalogAlignsWithTitles(
        "Pokemon Yellow",
        [
          "Pokémon Yellow Version: Special Pikachu Edition",
          "Pokémon : Version Jaune, Édition Spéciale Pikachu",
          "Pokemon Yellow Version",
        ],
        { allowFranchiseStem: true },
      ),
    ).toBe(true);
  });

  it("accepts 007 Nightfire short catalog for the full Bond primary", () => {
    expect(
      priceChartingCatalogAlignsWithTitles("007 Nightfire", [
        "James Bond 007 Nightfire",
      ]),
    ).toBe(true);
    expect(
      priceChartingCatalogAlignsWithTitles("007 Nightfire", [
        "James Bond 007 Nightfire",
        "007: Nightfire",
        "Nightfire",
      ]),
    ).toBe(true);
  });

  it("rejects a bare Slim catalog when the bag asks for Slim Rose", () => {
    expect(
      priceChartingCatalogAlignsWithTitles("Playstation 2 Slim", [
        "Sony Playstation 2 Slim Rose",
      ]),
    ).toBe(false);
    expect(
      priceChartingCatalogAlignsWithTitles("Playstation 2", [
        "Sony Playstation 2 Slim Rose",
      ]),
    ).toBe(false);
  });

  it("folds rose≡pink on hardware (default finish family)", () => {
    expect(
      priceChartingCatalogAlignsWithTitles(
        "Slim Playstation 2 System Pink",
        ["PlayStation 2 Slim Rose"],
        { mediaType: "hardware" },
      ),
    ).toBe(true);
  });

  it("still requires bag-listed pink for non-hardware title bags", () => {
    expect(
      priceChartingCatalogAlignsWithTitles("Playstation 2 Slim Pink", [
        "Sony Playstation 2 Slim Rose",
      ]),
    ).toBe(false);
    expect(
      priceChartingCatalogAlignsWithTitles("Playstation 2 Slim Pink", [
        "Sony Playstation 2 Slim Rose",
        "Playstation 2 Slim Pink",
      ]),
    ).toBe(true);
  });

  it("accepts PS4 Pro hardware against the PAL 1TB Black systems SKU", () => {
    expect(
      priceChartingCatalogAlignsWithTitles(
        "Sony PlayStation 4 Pro 1TB Console Black",
        ["PlayStation 4 PS4 Pro"],
        { mediaType: "hardware", allowFranchiseStem: true },
      ),
    ).toBe(true);
  });

  it("still rejects Slim Rose → Slim on hardware mediaType", () => {
    expect(
      priceChartingCatalogAlignsWithTitles(
        "Playstation 2 Slim",
        ["Sony Playstation 2 Slim Rose"],
        { mediaType: "hardware" },
      ),
    ).toBe(false);
  });

  it("rejects White DSi when the bag asks for DS Lite White", () => {
    expect(
      priceChartingCatalogAlignsWithTitles(
        "White Nintendo DSi System",
        ["Nintendo DS Lite [White]", "Nintendo DS Lite Blanche"],
        { mediaType: "hardware" },
      ),
    ).toBe(false);
    expect(
      priceChartingCatalogAlignsWithTitles(
        "White Nintendo DS Lite",
        ["Nintendo DS Lite [White]", "Nintendo DS Lite Blanche"],
        { mediaType: "hardware" },
      ),
    ).toBe(true);
  });
});
