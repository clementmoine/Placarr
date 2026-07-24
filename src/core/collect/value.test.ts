import { describe, expect, it } from "vitest";

import {
  getEstimatedItemValueCents,
  getItemValueEstimate,
} from "@/core/collect/value";

describe("getEstimatedItemValueCents", () => {
  it("falls back to new price for used games when no used market data exists", () => {
    expect(
      getEstimatedItemValueCents({
        condition: "used",
        shelfType: "games",
        priceNew: 2728,
        priceUsed: null,
        priceUsedCIB: null,
      }),
    ).toBe(2728);
  });

  it("prefers used CIB over new for used games", () => {
    expect(
      getEstimatedItemValueCents({
        condition: "used",
        shelfType: "games",
        priceNew: 2351,
        priceUsed: null,
        priceUsedCIB: 1671,
      }),
    ).toBe(1671);
  });
});

describe("getItemValueEstimate", () => {
  it("falls back to the catalog estimate only when no observed price exists", () => {
    expect(
      getItemValueEstimate({
        condition: "used",
        shelfType: "books",
        priceNew: null,
        priceUsed: null,
        priceUsedCIB: null,
        priceEstimated: 750,
      }),
    ).toEqual({ cents: 750, isEstimate: true });

    expect(
      getItemValueEstimate({
        condition: "used",
        shelfType: "books",
        priceNew: null,
        priceUsed: 300,
        priceUsedCIB: null,
        priceEstimated: 750,
      }),
    ).toEqual({ cents: 300, isEstimate: false });
  });

  it("halves the estimate for damaged items and keeps the flag", () => {
    expect(
      getItemValueEstimate({
        condition: "damaged",
        shelfType: "books",
        priceEstimated: 750,
      }),
    ).toEqual({ cents: 375, isEstimate: true });
  });

  it("prefers loose cartridge/disc price when condition is loose", () => {
    expect(
      getItemValueEstimate({
        condition: "loose",
        shelfType: "games",
        priceNew: 4000,
        priceUsed: 900,
        priceUsedCIB: 2800,
      }),
    ).toEqual({ cents: 900, isEstimate: false });
  });

  it("prefers PriceCharting loose for hardware consoles out of box", () => {
    expect(
      getItemValueEstimate({
        condition: "loose",
        shelfType: "hardware",
        priceNew: 30000,
        priceUsed: 18000,
        priceUsedCIB: 22000,
      }),
    ).toEqual({ cents: 18000, isEstimate: false });
  });

  it("does not treat CIB / retail used as a loose observed price", () => {
    expect(
      getItemValueEstimate({
        condition: "loose",
        shelfType: "games",
        priceNew: 4000,
        priceUsed: null,
        priceUsedCIB: 5000,
        priceEstimated: 1200,
      }),
    ).toEqual({ cents: 1200, isEstimate: true });
  });

  it("uses boxed CIB as a ~estimate for loose games when nothing else exists", () => {
    expect(
      getItemValueEstimate({
        condition: "loose",
        shelfType: "games",
        priceNew: 4000,
        priceUsed: null,
        priceUsedCIB: 5000,
      }),
    ).toEqual({ cents: 5000, isEstimate: true });
  });

  it("returns null without condition or any price", () => {
    expect(getItemValueEstimate({ priceEstimated: 750 })).toBeNull();
    expect(
      getItemValueEstimate({ condition: "used", shelfType: "books" }),
    ).toBeNull();
  });
});
