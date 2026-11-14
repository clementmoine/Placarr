import { describe, expect, it } from "vitest";

import {
  finalizeProductIdentifyConfidence,
  fuseCardAndProductIdentify,
} from "@/core/identify/productIdentifyFuse";

describe("finalizeProductIdentifyConfidence", () => {
  it("marks a clear packshot sure", () => {
    const result = finalizeProductIdentifyConfidence([
      { productKey: "lorcana::into-the-inklands-booster", distance: 150 },
      { productKey: "lorcana::other", distance: 280 },
    ]);
    expect(result.confidence).toBe("sure");
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0]!.productKey).toBe(
      "lorcana::into-the-inklands-booster",
    );
  });

  it("refuses sure when margin is thin", () => {
    const result = finalizeProductIdentifyConfidence([
      { productKey: "bleach::booster-s1", distance: 160 },
      { productKey: "bleach::display-s1", distance: 200 },
    ]);
    expect(result.confidence).toBe("doubt");
    expect(result.matches.every((m) => m.ambiguous)).toBe(true);
  });

  it("misses far neighbors", () => {
    expect(
      finalizeProductIdentifyConfidence([
        { productKey: "x::a", distance: 420 },
      ]).confidence,
    ).toBe("miss");
  });
});

describe("fuseCardAndProductIdentify", () => {
  it("soft card alone (booster→DBS 282) + clear product → product", () => {
    const fused = fuseCardAndProductIdentify(
      [
        {
          printKey: "dbscg:bt24-001",
          distance: 282,
          confidence: "doubt",
        },
      ],
      [
        {
          productKey: "lorcana::into-the-inklands-booster",
          distance: 148,
          packId: "lorcana",
          slug: "into-the-inklands-booster",
        },
        {
          productKey: "lorcana::other-booster",
          distance: 310,
        },
      ],
    );
    expect(fused.kind).toBe("product");
    expect(fused.confidence).toBe("sure");
    expect(fused.shortlist).toEqual([
      expect.objectContaining({
        kind: "product",
        productKey: "lorcana::into-the-inklands-booster",
      }),
    ]);
    expect(fused.cards).toEqual([]);
  });

  it("sure card alone stays card", () => {
    const fused = fuseCardAndProductIdentify(
      [
        {
          printKey: "narutoranks:nr-001",
          distance: 120,
          confidence: "sure",
        },
      ],
      [],
    );
    expect(fused).toMatchObject({
      kind: "card",
      confidence: "sure",
    });
    expect(fused.shortlist[0]).toMatchObject({
      kind: "card",
      printKey: "narutoranks:nr-001",
    });
  });

  it("sure product vs sure card near conflict → doubt", () => {
    const fused = fuseCardAndProductIdentify(
      [
        {
          printKey: "lorcana:iti-001",
          distance: 160,
          confidence: "sure",
        },
      ],
      [
        {
          productKey: "lorcana::into-the-inklands-booster",
          distance: 170,
        },
      ],
    );
    expect(fused.kind).toBe("doubt");
    expect(fused.confidence).toBe("doubt");
    expect(fused.shortlist.map((row) => row.kind).sort()).toEqual([
      "card",
      "product",
    ]);
  });

  it("sure product clearly closer than sure card → product", () => {
    const fused = fuseCardAndProductIdentify(
      [
        {
          printKey: "dbscg:bt1-001",
          distance: 220,
          confidence: "sure",
        },
      ],
      [
        {
          productKey: "lorcana::into-the-inklands-booster",
          distance: 90,
        },
      ],
    );
    expect(fused.kind).toBe("product");
    expect(fused.confidence).toBe("sure");
  });

  it("miss when neither side has a usable hit", () => {
    expect(fuseCardAndProductIdentify([], []).kind).toBe("miss");
    expect(
      fuseCardAndProductIdentify(
        [{ printKey: "x:y", distance: 500, confidence: "miss" }],
        [{ productKey: "a::b", distance: 500 }],
      ).kind,
    ).toBe("miss");
  });
});
