import { describe, expect, it } from "vitest";

import { allocatePurchasePriceCents } from "./costBasis";

describe("allocatePurchasePriceCents", () => {
  it("splits evenly and gives remainder to the first children", () => {
    expect(
      allocatePurchasePriceCents({ parentPriceCents: 100, childCount: 3 }),
    ).toEqual([34, 33, 33]);
    expect(
      allocatePurchasePriceCents({ parentPriceCents: 24, childCount: 8 }),
    ).toEqual([3, 3, 3, 3, 3, 3, 3, 3]);
  });

  it("returns nulls when the parent has no price", () => {
    expect(
      allocatePurchasePriceCents({ parentPriceCents: null, childCount: 2 }),
    ).toEqual([null, null]);
    expect(
      allocatePurchasePriceCents({ parentPriceCents: -1, childCount: 2 }),
    ).toEqual([null, null]);
  });

  it("handles zero / one child", () => {
    expect(
      allocatePurchasePriceCents({ parentPriceCents: 500, childCount: 0 }),
    ).toEqual([]);
    expect(
      allocatePurchasePriceCents({ parentPriceCents: 500, childCount: 1 }),
    ).toEqual([500]);
  });
});
