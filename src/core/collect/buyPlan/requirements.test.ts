import { describe, expect, it } from "vitest";

import { buildRequirements, imputeRequirementPrices } from "./requirements";

describe("buildRequirements", () => {
  it("base-set collapses finishes into one hole per printKey", () => {
    const reqs = buildRequirements({
      mode: "base-set",
      rows: [
        {
          rowId: "pk1|Normal",
          printKey: "pk1",
          finish: "Normal",
          priceCents: 100,
          owned: false,
        },
        {
          rowId: "pk1|Foil",
          printKey: "pk1",
          finish: "Foil",
          priceCents: 500,
          owned: false,
        },
        {
          rowId: "pk2|Normal",
          printKey: "pk2",
          finish: "Normal",
          priceCents: 50,
          owned: true,
        },
      ],
    });
    expect(reqs).toHaveLength(1);
    expect(reqs[0]?.id).toBe("pk1");
    expect(reqs[0]?.priceCents).toBe(100);
  });

  it("master-set keeps one hole per row", () => {
    const reqs = buildRequirements({
      mode: "master-set",
      rows: [
        {
          rowId: "pk1|Normal",
          printKey: "pk1",
          finish: "Normal",
          priceCents: 100,
          owned: false,
        },
        {
          rowId: "pk1|Foil",
          printKey: "pk1",
          finish: "Foil",
          priceCents: 500,
          owned: false,
        },
      ],
    });
    expect(reqs).toHaveLength(2);
    expect(reqs.map((r) => r.id).sort()).toEqual(["pk1|Foil", "pk1|Normal"]);
  });
});

describe("imputeRequirementPrices", () => {
  it("fills missing holes with same-rarity median and marks priceImputed", () => {
    const filled = imputeRequirementPrices({
      requirements: [
        {
          id: "a",
          acceptedPrints: ["a"],
          requiredCopies: 1,
          ownedCopies: 0,
          priceCents: null,
          rarity: "commune",
        },
        {
          id: "b",
          acceptedPrints: ["b"],
          requiredCopies: 1,
          ownedCopies: 0,
          priceCents: 500,
          rarity: "commune",
        },
      ],
      reference: [
        { priceCents: 100, rarity: "commune" },
        { priceCents: 300, rarity: "commune" },
        { priceCents: 900, rarity: "holo" },
      ],
    });
    expect(filled[0]).toMatchObject({
      id: "a",
      priceCents: 200,
      priceImputed: true,
    });
    expect(filled[1]).toMatchObject({ id: "b", priceCents: 500 });
    expect(filled[1]?.priceImputed).toBeUndefined();
  });

  it("falls back to overall median when rarity has no priced peers", () => {
    const filled = imputeRequirementPrices({
      requirements: [
        {
          id: "x",
          acceptedPrints: ["x"],
          requiredCopies: 1,
          ownedCopies: 0,
          priceCents: null,
          rarity: "promo",
        },
      ],
      reference: [
        { priceCents: 100, rarity: "commune" },
        { priceCents: 300, rarity: "commune" },
      ],
    });
    expect(filled[0]).toMatchObject({
      priceCents: 200,
      priceImputed: true,
    });
  });
});
