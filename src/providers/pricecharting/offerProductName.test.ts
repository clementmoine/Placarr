import { describe, expect, it } from "vitest";

import {
  enrichPriceChartingOfferProductName,
  productNameFromPriceChartingGameUrl,
} from "./offerProductName";

describe("productNameFromPriceChartingGameUrl", () => {
  it("turns a game slug into a comparable title", () => {
    expect(
      productNameFromPriceChartingGameUrl(
        "https://www.pricecharting.com/game/pal-playstation-2/fifa-football-2002",
      ),
    ).toBe("fifa football 2002");
    expect(
      productNameFromPriceChartingGameUrl(
        "https://www.pricecharting.com/game/pal-playstation-2/2002-fifa-world-cup",
      ),
    ).toBe("2002 fifa world cup");
  });

  it("returns null for non-game URLs", () => {
    expect(
      productNameFromPriceChartingGameUrl(
        "https://www.pricecharting.com/search-products?q=fifa",
      ),
    ).toBeNull();
  });
});

describe("enrichPriceChartingOfferProductName", () => {
  it("fills productName from sourceUrl when missing", () => {
    expect(
      enrichPriceChartingOfferProductName({
        source: "PriceCharting",
        productName: null,
        sourceUrl:
          "https://www.pricecharting.com/game/pal-playstation-2/fifa-football-2002",
        condition: "cib",
        priceCents: 472,
      }).productName,
    ).toBe("fifa football 2002");
  });

  it("keeps an explicit productName", () => {
    expect(
      enrichPriceChartingOfferProductName({
        source: "PriceCharting",
        productName: "FIFA Football 2002",
        sourceUrl:
          "https://www.pricecharting.com/game/pal-playstation-2/2002-fifa-world-cup",
        condition: "cib",
        priceCents: 874,
      }).productName,
    ).toBe("FIFA Football 2002");
  });
});
