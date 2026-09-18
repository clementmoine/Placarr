import { describe, expect, it } from "vitest";

import { PROVIDER_MODULES } from "@/core/catalog/catalog";
import {
  createEmptyBarcodeLookupPayload,
  type BarcodeLookupPayload,
} from "@/core/identify/lookup/payload";
import { barcodeLookupSlotDefaults } from "@/core/catalog/barcodeLookupSlots";

const playinModule = PROVIDER_MODULES.find(
  (module) => module.info.id === "playin",
)!;

describe("playin extractScanPriceOffers", () => {
  it("emits a new offer with the barcode productUrl as sourceUrl", () => {
    const payload: BarcodeLookupPayload = {
      ...createEmptyBarcodeLookupPayload(barcodeLookupSlotDefaults()),
      playin: {
        title: "Black Stories",
        priceCents: 1050,
        productUrl: "https://www.play-in.com/jeux/black-stories.html",
      },
    };

    const offers = playinModule.extractScanPriceOffers!(payload, "boardgames");
    expect(offers).toHaveLength(1);
    expect(offers[0]?.sourceUrl).toContain("play-in.com");
  });
});
