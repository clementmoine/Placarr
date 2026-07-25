import { describe, expect, it } from "vitest";

import {
  ebayMarketplaceQueryVariants,
  ebayPriceSearchQueries,
} from "./searchQueries";

describe("ebayMarketplaceQueryVariants", () => {
  it("adds an accent-stripped variant for magazine titles", () => {
    expect(
      ebayMarketplaceQueryVariants(["Les Trésors de Picsou n°63"]),
    ).toEqual(["Les Trésors de Picsou n°63", "Les Tresors de Picsou N 63"]);
  });
});

describe("ebayPriceSearchQueries", () => {
  it("with a barcode: barcode first, then one title + ascii (≤4)", () => {
    expect(
      ebayPriceSearchQueries(
        "Les Trésors de Picsou n°63",
        ["Les Trésors de Picsou 63", "Ignored second title"],
        "9782012101333",
      ),
    ).toEqual([
      "9782012101333",
      "Les Trésors de Picsou n°63",
      "Les Tresors de Picsou N 63",
    ]);
  });

  it("title-only: two distinct titles + ascii variants, capped at 4", () => {
    expect(
      ebayPriceSearchQueries("Les Trésors de Picsou n°63", [
        "Les trésors de Picsou n°63",
        "Les Trésors de Picsou 63",
      ]),
    ).toEqual([
      "Les Trésors de Picsou n°63",
      "Les Tresors de Picsou N 63",
      "Les Trésors de Picsou 63",
      "Les Tresors de Picsou 63",
    ]);
  });
});
