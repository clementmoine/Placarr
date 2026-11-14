import { describe, expect, it } from "vitest";

import { priceProbeContext } from "@/providers/shared/createPrintKeyPriceModule";

import { mtgmarketModule } from "./index";

describe("mtgmarketModule info", () => {
  it("is a scrape-cache EUR reference for Magic", () => {
    expect(mtgmarketModule.info.id).toBe("mtgmarket");
    expect(mtgmarketModule.info.types).toContain("tcg");
    expect(mtgmarketModule.info.capabilities).toContain("price");
    expect(mtgmarketModule.info.referencePriceSource).toBe(true);
    expect(mtgmarketModule.info.evidenceOnlyPriceRefresh).toBe(true);
    expect(mtgmarketModule.info.supplyMode).toBe("scrape_cache");
  });
});

describe("mtgmarketModule.refreshBarcodePriceOffers", () => {
  it("returns empty under evidenceOnly without a warm index", async () => {
    const offers = await mtgmarketModule.refreshBarcodePriceOffers!({
      ...priceProbeContext({
        printKey: "mtg:tdm-1",
        name: "Ugin",
      }),
      evidenceOnly: true,
    });
    expect(offers).toEqual([]);
  });
});
