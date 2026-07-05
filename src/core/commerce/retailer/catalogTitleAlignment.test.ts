import { describe, expect, it } from "vitest";

import {
  catalogTitleAlignedWithItem,
  catalogTitleFromProductUrl,
  retailerCatalogTitleContradictsItem,
} from "./catalogTitleAlignment";

describe("catalogTitleAlignedWithItem", () => {
  it("rejects a single-token edition suffix", () => {
    expect(
      catalogTitleAlignedWithItem("Black Stories", "Black Stories Fantastique"),
    ).toBe(false);
  });

  it("accepts the base title", () => {
    expect(
      catalogTitleAlignedWithItem("Black Stories", "Iello Black Stories"),
    ).toBe(true);
  });
});

describe("retailerCatalogTitleContradictsItem", () => {
  it("flags Chasse aux Livres fantastique slug for Black Stories", () => {
    expect(
      retailerCatalogTitleContradictsItem({
        productUrl:
          "https://www.chasse-aux-livres.fr/prix/B071ZXH7MV/black-stories-fantastique",
        itemTitle: "Black Stories",
      }),
    ).toBe(true);
  });

  it("flags a generic Black Stories slug when the item is a specific edition", () => {
    expect(
      retailerCatalogTitleContradictsItem({
        productUrl:
          "https://www.le-passe-temps.com/defis-rigolades-delires/3740-black-stories.html",
        itemTitle: "Black Stories - Femmes Fatales",
      }),
    ).toBe(true);
  });

  it("flags a LeDénicheur product title for a different edition", () => {
    expect(
      retailerCatalogTitleContradictsItem({
        productTitle: "Black Stories: Funny Death Edition 2",
        itemTitle: "Black Stories - Femmes Fatales",
      }),
    ).toBe(true);
  });

  it("does not reject URLs without a readable slug title", () => {
    expect(
      retailerCatalogTitleContradictsItem({
        productUrl: "https://boardgamegeek.com/boardgame/18803",
        itemTitle: "Black Stories",
      }),
    ).toBe(false);
    expect(
      retailerCatalogTitleContradictsItem({
        productUrl: "https://www.wikidata.org/wiki/Q880571",
        itemTitle: "Black Stories",
      }),
    ).toBe(false);
  });
});

describe("catalogTitleFromProductUrl", () => {
  it("derives a title from the last path segment", () => {
    expect(
      catalogTitleFromProductUrl(
        "https://www.chasse-aux-livres.fr/prix/B071ZXH7MV/black-stories-fantastique",
      ),
    ).toBe("black stories fantastique");
  });

  it("strips a numeric PrestaShop prefix from the slug", () => {
    expect(
      catalogTitleFromProductUrl(
        "https://www.le-passe-temps.com/defis-rigolades-delires/3740-black-stories.html",
      ),
    ).toBe("black stories");
  });
});
