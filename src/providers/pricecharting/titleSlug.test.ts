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

  it("emits possessive-stripped and Pro Skater short titles for PC slugs", () => {
    expect(
      expandPriceChartingLookupTitles("Tony Hawk's American Wasteland"),
    ).toEqual(
      expect.arrayContaining([
        "Tony Hawk's American Wasteland",
        "Tony Hawk American Wasteland",
      ]),
    );
    expect(expandPriceChartingLookupTitles("Tony Hawk's Pro Skater 4")).toEqual(
      expect.arrayContaining([
        "Tony Hawk's Pro Skater 4",
        "Tony Hawk Pro Skater 4",
        "Tony Hawk 4",
      ]),
    );
  });

  it("collapses decimal versions for PriceCharting slugs (2.0 → 20)", () => {
    expect(expandPriceChartingLookupTitles("Colin McRae Rally 2.0")).toEqual(
      expect.arrayContaining(["Colin McRae Rally 2.0", "Colin McRae Rally 20"]),
    );
    expect(
      expandPriceChartingLookupTitles("Colin McRae Rally 2.0"),
    ).not.toEqual(expect.arrayContaining(["Colin McRae Rally II.0"]));
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
  it("ne invente plus d'URL /game/ — search jusqu'à scrape vérifié", () => {
    const link = buildPriceChartingCatalogLink({
      mediaType: "games",
      title: "Assassin's Creed III",
      shelfName: "Xbox 360",
      barcode: "3307215659290",
    });
    expect(link.isDirect).toBe(false);
    expect(link.url).toContain("search-products");
    expect(link.url).toContain("videogames");
    expect(decodeURIComponent(link.url)).toContain("Assassin's Creed III");
  });

  it("utilise une recherche pour un double pack Xbox 360", () => {
    const link = buildPriceChartingCatalogLink({
      mediaType: "games",
      title: "Halo Reach / Fable III",
      fallbackTitle: "Halo Reach / Fable III",
      shelfName: "Xbox 360",
    });
    expect(link.isDirect).toBe(false);
    expect(link.url).toContain("search-products");
    expect(decodeURIComponent(link.url)).toContain("Halo Reach / Fable III");
  });
});
