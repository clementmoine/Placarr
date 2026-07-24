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

  it("rejects generation upgrades on bare console stems", () => {
    expect(
      catalogTitleAlignedWithItem("Nintendo Switch", "Nintendo Switch 2", {
        shelfType: "hardware",
      }),
    ).toBe(false);
    expect(
      catalogTitleAlignedWithItem(
        "PlayStation",
        "Sony PlayStation 5 Slim Digital",
        { shelfType: "hardware" },
      ),
    ).toBe(false);
  });

  it("accepts System chrome and rejects console packs for bare PS2", () => {
    expect(
      catalogTitleAlignedWithItem("PlayStation 2", "Playstation 2 System", {
        shelfType: "hardware",
      }),
    ).toBe(true);
    expect(
      catalogTitleAlignedWithItem(
        "PlayStation 2",
        "Sony Playstation 2 GT3 Racing Pack",
        { shelfType: "hardware" },
      ),
    ).toBe(false);
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

  it("flags a GT3 console pack for bare PlayStation 2 on hardware", () => {
    expect(
      retailerCatalogTitleContradictsItem({
        productUrl:
          "https://www.pricecharting.com/game/playstation-2/sony-playstation-2-gt3-racing-pack",
        productTitle: "Sony Playstation 2 GT3 Racing Pack",
        itemTitle: "PlayStation 2",
        shelfType: "hardware",
      }),
    ).toBe(true);
    expect(
      retailerCatalogTitleContradictsItem({
        productUrl:
          "https://www.pricecharting.com/game/pal-playstation-2/playstation-2-system",
        itemTitle: "PlayStation 2",
        shelfType: "hardware",
      }),
    ).toBe(false);
  });

  it("keeps Xbox 360 Slim 250Go ↔ Slim Console 250GB PriceCharting slugs", () => {
    expect(
      retailerCatalogTitleContradictsItem({
        productUrl:
          "https://www.pricecharting.com/game/xbox-360/xbox-360-slim-console-250gb",
        itemTitle: "Xbox 360 Slim 250Go",
        shelfType: "hardware",
      }),
    ).toBe(false);
    expect(
      retailerCatalogTitleContradictsItem({
        productUrl:
          "https://www.pricecharting.com/game/pal-xbox-360/xbox-360-slim-250gb",
        itemTitle: "Xbox 360 Slim 250Go",
        shelfType: "hardware",
      }),
    ).toBe(false);
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

  it("does not reject PriceCharting search-product catalog chips", () => {
    expect(
      retailerCatalogTitleContradictsItem({
        productUrl:
          "https://www.pricecharting.com/fr/search-products?type=videogames&q=Wrc%204",
        itemTitle: "WRC 4: FIA World Rally Championship",
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

  it("ignores search-products path segments", () => {
    expect(
      catalogTitleFromProductUrl(
        "https://www.pricecharting.com/fr/search-products?type=videogames&q=Wrc%204",
      ),
    ).toBeNull();
  });

  it("uses the Back Market product slug before the trailing UUID", () => {
    expect(
      catalogTitleFromProductUrl(
        "https://www.backmarket.fr/fr-fr/p/console-nintendo-wii-bleu/7383740a-64c1-4b44-aa1c-b65a512979a1?l=11",
      ),
    ).toBe("console nintendo wii bleu");
  });
});

describe("retailerCatalogTitleContradictsItem Back Market", () => {
  it("keeps a matching Back Market /p/{slug}/{uuid} fiche for hardware", () => {
    expect(
      retailerCatalogTitleContradictsItem({
        productUrl:
          "https://www.backmarket.fr/fr-fr/p/console-nintendo-wii-bleu/7383740a-64c1-4b44-aa1c-b65a512979a1?l=11",
        itemTitle: "Nintendo Wii Bleu",
        shelfType: "hardware",
      }),
    ).toBe(false);
  });
});
