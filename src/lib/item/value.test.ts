import { describe, expect, it } from "vitest";

import { getEstimatedItemValueCents } from "@/lib/item/value";

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
