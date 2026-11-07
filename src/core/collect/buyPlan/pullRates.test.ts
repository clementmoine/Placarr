import { describe, expect, it } from "vitest";
import {
  bestPackHitByPrint,
  packsPerHit,
  pullRateRank,
  pullRateScale,
  pullRateTier,
} from "./pullRates";
import type { SealedSku } from "./types";

function sku(partial: Partial<SealedSku> & { slug: string }): SealedSku {
  return {
    name: partial.slug,
    priceCents: 400,
    guaranteed: [],
    guaranteedPartial: false,
    packs: 1,
    packHitByPrint: null,
    provenance: "community",
    ...partial,
  };
}

describe("bestPackHitByPrint", () => {
  it("retient le meilleur taux par carte, ignore les SKUs sans sachet ou sans taux", () => {
    const skus = [
      sku({
        slug: "booster-a",
        packHitByPrint: new Map([
          ["c1", 0.25],
          ["r1", 0.05],
        ]),
      }),
      sku({
        slug: "booster-b",
        packHitByPrint: new Map([
          ["c1", 0.5],
          ["r1", 0.01],
        ]),
      }),
      sku({ slug: "deck", packs: 0, guaranteed: ["c1"] }),
      sku({ slug: "unknown", packs: 1, packHitByPrint: null }),
    ];
    const best = bestPackHitByPrint(skus);
    expect(best.get("c1")).toBe(0.5);
    expect(best.get("r1")).toBe(0.05);
    expect(best.size).toBe(2);
  });

  it("ignore les probabilités nulles", () => {
    const best = bestPackHitByPrint([
      sku({ slug: "b", packHitByPrint: new Map([["x", 0]]) }),
    ]);
    expect(best.has("x")).toBe(false);
  });
});

describe("packsPerHit", () => {
  it.each([
    [0.5, 2],
    [0.25, 4],
    [1 / 12, 12],
    [0.0104, 96],
    [1, 1],
    [2, 1],
  ])("p=%s → 1 sur %s", (p, expected) => {
    expect(packsPerHit(p)).toBe(expected);
  });

  it("null quand inconnu", () => {
    expect(packsPerHit(null)).toBeNull();
    expect(packsPerHit(0)).toBeNull();
    expect(packsPerHit(Number.NaN)).toBeNull();
  });
});

describe("pullRateTier", () => {
  /* Lorcana : commune 13, peu commune 18, rare 26, super rare 38,
     légendaire 60, enchantée 1728 → rang parmi 6 paliers, sur 3 niveaux. */
  const scale = pullRateScale({
    a: 26,
    b: 13,
    c: 1728,
    d: 60,
    e: 38,
    f: 18,
    g: 13,
  });
  it("échelle = N distincts croissants", () => {
    expect(scale).toEqual([13, 18, 26, 38, 60, 1728]);
  });
  it.each([
    [13, 1],
    [18, 1],
    [26, 2],
    [38, 2],
    [60, 3],
    [1728, 3],
  ])("1 sur %s → niveau %s", (n, tier) => {
    expect(pullRateTier(n, scale)).toBe(tier);
  });

  it("ordinal : l'extrême n'écrase pas les paliers intermédiaires", () => {
    expect(pullRateTier(60, [13, 60, 100000])).toBe(2);
  });

  it("deux paliers → 1 et 3 ; trois → 1, 2, 3", () => {
    expect(pullRateTier(10, [10, 20])).toBe(1);
    expect(pullRateTier(20, [10, 20])).toBe(3);
    expect([5, 7, 9].map((n) => pullRateTier(n, [5, 7, 9]))).toEqual([1, 2, 3]);
  });

  it("un seul palier → niveau 1 ; N inconnu de l'échelle → palier suivant", () => {
    expect(pullRateTier(26, [26])).toBe(1);
    expect(pullRateTier(30, [13, 26, 60])).toBe(3);
    expect(pullRateTier(500, [13, 26, 60])).toBe(3);
  });
});

describe("pullRateRank", () => {
  const scale = [13, 18, 26, 38, 60, 1728];
  it("rang 1..count et position 0..1, ordinal", () => {
    expect(pullRateRank(13, scale)).toEqual({ rank: 1, count: 6, position: 0 });
    expect(pullRateRank(26, scale)).toEqual({
      rank: 3,
      count: 6,
      position: 0.4,
    });
    expect(pullRateRank(1728, scale)).toEqual({
      rank: 6,
      count: 6,
      position: 1,
    });
  });
  it("un seul palier → position 0 ; hors échelle → dernier rang", () => {
    expect(pullRateRank(26, [26]).position).toBe(0);
    expect(pullRateRank(9999, scale).rank).toBe(6);
  });
});
