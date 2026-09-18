import { describe, expect, it } from "vitest";

import { PROVIDER_MODULES } from "@/core/catalog/catalog";
import {
  createEmptyBarcodeLookupPayload,
  type BarcodeLookupPayload,
} from "@/core/identify/lookup/payload";
import { barcodeLookupSlotDefaults } from "@/core/catalog/barcodeLookupSlots";

const okkazeoModule = PROVIDER_MODULES.find(
  (module) => module.info.id === "okkazeo",
)!;

describe("okkazeo extractScanPriceOffers", () => {
  it("emits a used offer with the barcode productUrl as sourceUrl", () => {
    const payload: BarcodeLookupPayload = {
      ...createEmptyBarcodeLookupPayload(barcodeLookupSlotDefaults()),
      okkazeo: {
        title: "Black Stories",
        priceCents: 1200,
        productUrl: "https://www.okkazeo.com/jeu/black-stories/123.html",
      },
    };

    const offers = okkazeoModule.extractScanPriceOffers!(payload, "boardgames");
    expect(offers).toHaveLength(1);
    expect(offers[0]?.condition).toBe("used");
    expect(offers[0]?.sourceUrl).toContain("okkazeo.com");
  });
});
