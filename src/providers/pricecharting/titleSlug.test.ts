import { describe, expect, it } from "vitest";

import { expandPriceChartingLookupTitles } from "./lookupTitles";
import {
  priceChartingAmpersandTitleSlug,
  priceChartingTitleSlug,
} from "./titleSlug";
import { buildPriceChartingCatalogLink } from "./catalogLink";

describe("expandPriceChartingLookupTitles", () => {
  it("expands slash bundles into ampersand and double-pack variants", () => {
    expect(expandPriceChartingLookupTitles("Halo Reach / Fable III")).toEqual(
      expect.arrayContaining([
        "Halo Reach / Fable III",
        "Halo Reach & Fable III",
        "Halo Reach & Fable 3",
        "Halo Reach & Fable 3 Double Pack",
      ]),
    );
  });
});

describe("priceChartingAmpersandTitleSlug", () => {
  it("keeps ampersands for bundle listings", () => {
    expect(
      priceChartingAmpersandTitleSlug("Halo Reach & Fable 3 Double Pack"),
    ).toBe("halo-reach-&-fable-3-double-pack");
  });
});

describe("priceChartingTitleSlug", () => {
  it("garde l'apostrophe encodée %27 (convention PriceCharting)", () => {
    expect(priceChartingTitleSlug("Assassin's Creed III")).toBe(
      "assassin%27s-creed-iii",
    );
  });

  it("normalise l'apostrophe typographique", () => {
    expect(priceChartingTitleSlug("Luigi’s Mansion")).toBe("luigi%27s-mansion");
  });

  it("conserve le comportement du slug générique hors apostrophe", () => {
    expect(priceChartingTitleSlug("Ratchet & Clank")).toBe("ratchet-and-clank");
    expect(priceChartingTitleSlug("Pokémon Rouge")).toBe("pokemon-rouge");
    expect(priceChartingTitleSlug("Super Monkey Ball")).toBe(
      "super-monkey-ball",
    );
  });

  it("élague apostrophes et tirets en bordure", () => {
    expect(priceChartingTitleSlug("'n Verlore Verstand")).toBe(
      "n-verlore-verstand",
    );
  });
});

describe("buildPriceChartingCatalogLink", () => {
  it("construit l'URL directe avec l'apostrophe encodée", () => {
    expect(
      buildPriceChartingCatalogLink({
        mediaType: "games",
        title: "Assassin's Creed III",
        shelfName: "Xbox 360",
        barcode: "3307215659290",
      }),
    ).toEqual({
      url: "https://www.pricecharting.com/game/pal-xbox-360/assassin%27s-creed-iii",
      isDirect: true,
    });
  });

  it("utilise le slug ampersand pour un double pack Xbox 360", () => {
    expect(
      buildPriceChartingCatalogLink({
        mediaType: "games",
        title: "Halo Reach / Fable III",
        fallbackTitle: "Halo Reach / Fable III",
        shelfName: "Xbox 360",
      }),
    ).toEqual({
      url: "https://www.pricecharting.com/game/pal-xbox-360/halo-reach-&-fable-3-double-pack",
      isDirect: true,
    });
  });
});
