import { describe, expect, it } from "vitest";

import { priceProbeContext } from "@/providers/shared/createPrintKeyPriceModule";

import { ygomarketModule } from "./index";

describe("ygomarketModule info", () => {
  it("is a scrape-cache EUR reference for Yu-Gi-Oh!", () => {
    expect(ygomarketModule.info.id).toBe("ygomarket");
    expect(ygomarketModule.info.types).toContain("tcg");
    expect(ygomarketModule.info.capabilities).toContain("price");
    expect(ygomarketModule.info.referencePriceSource).toBe(true);
    expect(ygomarketModule.info.evidenceOnlyPriceRefresh).toBe(true);
    expect(ygomarketModule.info.supplyMode).toBe("scrape_cache");
  });
});

describe("ygomarketModule.refreshBarcodePriceOffers", () => {
  it("returns empty under evidenceOnly without a warm index", async () => {
    const offers = await ygomarketModule.refreshBarcodePriceOffers!({
      ...priceProbeContext({
        printKey: "yugioh:ra03-fr001",
        name: "Sample",
      }),
      evidenceOnly: true,
    });
    expect(offers).toEqual([]);
  });

  it("ignores non-yugioh printKeys", async () => {
    const offers = await ygomarketModule.refreshBarcodePriceOffers!(
      priceProbeContext({
        printKey: "mtg:tdm-1",
        name: "Ugin",
      }),
    );
    expect(offers).toEqual([]);
  });
});
