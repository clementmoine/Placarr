import { describe, expect, it } from "vitest";

import {
  metadataPriceFallback,
  priceSummaryFromMetadataFacts,
} from "@/core/commerce/pricing/itemDisplay";

describe("metadataPriceFallback", () => {
  it("maps booknode-style neuf/occasion facts to shelf price fields", () => {
    const summary = priceSummaryFromMetadataFacts([
      { kind: "price", label: "Neuf dès", value: "7,30 €", source: "booknode" },
      {
        kind: "price",
        label: "Occasion dès",
        value: "1,98 €",
        source: "booknode",
      },
    ]);

    expect(summary).toEqual({
      priceNew: 730,
      priceUsed: 198,
      priceUsedCIB: null,
    });
  });

  it("maps observed-price facts to new price", () => {
    const fallback = metadataPriceFallback([
      {
        kind: "observed-price",
        label: "ChocoBonPlan",
        value: "79,99 €",
        source: "chocobonplan",
      },
    ]);

    expect(fallback?.priceNew).toBe(7999);
    expect(fallback?.priceUsed).toBeNull();
  });

  it("ignores bedetheque catalog estimate ranges for numeric fallback", () => {
    const summary = priceSummaryFromMetadataFacts([
      {
        kind: "price",
        label: "Estimation",
        value: "de 5 à 10 euros",
        source: "bedetheque",
      },
      {
        kind: "price",
        label: "Estimation",
        value: "moins de 5 euros",
        source: "bedetheque",
      },
      {
        kind: "price",
        label: "Occasion dès",
        value: "11,00 €",
        source: "booknode",
      },
    ]);

    expect(summary).toEqual({
      priceNew: null,
      priceUsed: 1100,
      priceUsedCIB: null,
    });
  });
});
