import { describe, expect, it } from "vitest";

import type { CompletionPlan } from "./types";
import {
  pricesWithoutImputed,
  withoutImputedPrices,
} from "./withoutImputedPrices";

function basePlan(
  overrides: Partial<CompletionPlan> & {
    singles: CompletionPlan["singles"];
    mixed?: Partial<CompletionPlan["mixed"]>;
  },
): CompletionPlan {
  const singles = overrides.singles;
  return {
    mode: "base-set",
    copiesNeeded: singles.pricedCount + singles.unpricedCount,
    holes: singles.pricedCount + singles.unpricedCount,
    flags: overrides.flags ?? [],
    singles,
    mixed: {
      items: [],
      sealedCents: 1000,
      singlesCents: singles.totalCents,
      totalCents: 1000 + singles.totalCents,
      expectedCardsFromSealed: 0,
      expectedCompletion: 0,
      expectedRemainingCards: singles.lines.length,
      singles: singles.lines,
      stopRule: { minNewCardsPerPack: 0.5 },
      ...overrides.mixed,
    },
    sealed: {
      items: [],
      sealedCents: 0,
      packs: 0,
      expectedRemainingCards: 0,
      unreachableHoles: 0,
      capped: false,
      indeterminate: true,
      target: { maxExpectedRemainingCards: 0.5 },
    },
    skuMetrics: [],
    recommendation: {
      track: "singles",
      reason: "singles_cheapest",
      savingsCents: 0,
      confidence: "low",
    },
    ...overrides,
  };
}

describe("withoutImputedPrices", () => {
  it("leaves a plan without imputed cotes untouched", () => {
    const plan = basePlan({
      singles: {
        totalCents: 500,
        lines: [
          {
            requirementId: "a",
            priceCents: 500,
            priceImputed: false,
            probabilityNeeded: 1,
            expectedCostCents: 500,
          },
        ],
        pricedCount: 1,
        imputedCount: 0,
        unpricedCount: 0,
      },
      flags: [],
    });
    expect(withoutImputedPrices(plan)).toBe(plan);
  });

  it("drops ~ lines from totals and counts them as unpriced", () => {
    const plan = basePlan({
      flags: ["imputedPrices", "partialPrices"],
      singles: {
        totalCents: 800,
        lines: [
          {
            requirementId: "market",
            priceCents: 500,
            priceImputed: false,
            probabilityNeeded: 1,
            expectedCostCents: 500,
          },
          {
            requirementId: "approx",
            priceCents: 300,
            priceImputed: true,
            probabilityNeeded: 1,
            expectedCostCents: 300,
          },
        ],
        pricedCount: 2,
        imputedCount: 1,
        unpricedCount: 1,
      },
    });

    const view = withoutImputedPrices(plan);
    expect(view.singles).toMatchObject({
      totalCents: 500,
      pricedCount: 1,
      imputedCount: 0,
      unpricedCount: 2,
    });
    expect(view.singles.lines.map((l) => l.requirementId)).toEqual(["market"]);
    expect(view.mixed.singlesCents).toBe(500);
    expect(view.mixed.totalCents).toBe(1500);
    expect(view.flags).toContain("partialPrices");
    expect(view.flags).not.toContain("imputedPrices");
  });
});

describe("pricesWithoutImputed", () => {
  it("omits imputed keys", () => {
    expect(
      pricesWithoutImputed(
        { a: 100, b: 200, c: 300 },
        { b: true },
      ),
    ).toEqual({ a: 100, c: 300 });
  });
});
