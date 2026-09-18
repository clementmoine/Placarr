import { describe, expect, it } from "vitest";

import { PROVIDER_MODULES } from "@/core/catalog/catalog";
import {
  createEmptyBarcodeLookupPayload,
  type BarcodeLookupPayload,
} from "@/core/identify/lookup/payload";
import { barcodeLookupSlotDefaults } from "@/core/catalog/barcodeLookupSlots";

const espritjeuModule = PROVIDER_MODULES.find(
  (module) => module.info.id === "espritjeu",
)!;

describe("espritjeu extractScanPriceOffers", () => {
  it("emits a new offer with the barcode productUrl as sourceUrl", () => {
    const payload: BarcodeLookupPayload = {
      ...createEmptyBarcodeLookupPayload(barcodeLookupSlotDefaults()),
      espritjeu: {
        title: "Black Stories",
        priceCents: 990,
        productUrl: "https://www.espritjeu.com/jeux/black-stories.html",
      },
    };

    const offers = espritjeuModule.extractScanPriceOffers!(
      payload,
      "boardgames",
    );
    expect(offers).toHaveLength(1);
    expect(offers[0]?.sourceUrl).toContain("espritjeu.com");
  });
});
