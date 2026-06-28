import { describe, expect, it } from "vitest";

import { createEmptyBarcodeLookupPayload } from "@/lib/barcode/lookup/payload";
import { collectScanPriceOffers } from "@/services/provider/barcodePrices";

describe("collectScanPriceOffers", () => {
  it("collects game reference prices from the lookup payload", () => {
    const payload = createEmptyBarcodeLookupPayload();
    payload.pc = {
      title: "Mario Kart Wii",
      prices: {
        priceUsed: 1200,
        priceUsedCIB: 1800,
        priceNew: 2400,
      },
    };

    expect(collectScanPriceOffers(payload, "games")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: "PriceCharting",
          condition: "loose",
          priceCents: 1200,
        }),
        expect.objectContaining({
          source: "PriceCharting",
          condition: "cib",
          priceCents: 1800,
        }),
      ]),
    );
  });

  it("collects retailer prices captured during identification", () => {
    const payload = createEmptyBarcodeLookupPayload();
    payload.amc = [
      { name: "Death Note Tome 1", priceNew: 999, priceUsed: 499 },
    ];

    expect(collectScanPriceOffers(payload, "books")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: "AchatMoinsCher",
          condition: "new",
          priceCents: 999,
        }),
      ]),
    );
  });
});
