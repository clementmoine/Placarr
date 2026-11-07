import { describe, expect, it } from "vitest";

import {
  CARD_EMBED_DIM,
  cosineSimilarity,
  cosineToDistance,
  l2Normalize,
} from "./cardEmbed";
import {
  computePackCentroid,
  shortlistPacksByCentroid,
  topKMilliDistances,
} from "./cardEmbeddingSearch";

function unit(values: number[]): Float32Array {
  const v = new Float32Array(CARD_EMBED_DIM);
  for (let i = 0; i < values.length; i++) v[i] = values[i]!;
  return l2Normalize(v);
}

describe("topKMilliDistances", () => {
  it("matches brute-force ranking", () => {
    const q = unit([1, 0, 0]);
    const a = unit([1, 0, 0]);
    const b = unit([0.9, 0.1, 0]);
    const c = unit([0, 1, 0]);
    const matrix = new Float32Array(3 * CARD_EMBED_DIM);
    matrix.set(a, 0);
    matrix.set(b, CARD_EMBED_DIM);
    matrix.set(c, 2 * CARD_EMBED_DIM);

    const hits = topKMilliDistances(q, matrix, 3, {
      limit: 2,
      maxDistance: 500,
    });
    expect(hits.map((h) => h.row)).toEqual([0, 1]);
    expect(hits[0]!.distance).toBe(cosineToDistance(cosineSimilarity(q, a)));
  });

  it("respects maxDistance", () => {
    const q = unit([1, 0, 0]);
    const far = unit([0, 1, 0]);
    const matrix = new Float32Array(CARD_EMBED_DIM);
    matrix.set(far, 0);
    expect(
      topKMilliDistances(q, matrix, 1, { limit: 3, maxDistance: 50 }),
    ).toEqual([]);
  });
});

describe("shortlistPacksByCentroid", () => {
  it("keeps the nearest packs and at least minPacks", () => {
    const q = unit([1, 0, 0]);
    const packs = [
      { packId: "a", centroid: unit([1, 0, 0]) },
      { packId: "b", centroid: unit([0.8, 0.2, 0]) },
      { packId: "c", centroid: unit([0, 1, 0]) },
      { packId: "d", centroid: unit([0, 0, 1]) },
    ];
    const short = shortlistPacksByCentroid(q, packs, {
      minPacks: 2,
      margin: 50,
    });
    expect(short[0]?.packId).toBe("a");
    expect(short.length).toBeGreaterThanOrEqual(2);
  });
});

describe("computePackCentroid", () => {
  it("points toward the mean of unit rows", () => {
    const a = unit([1, 0, 0]);
    const b = unit([0, 1, 0]);
    const matrix = new Float32Array(2 * CARD_EMBED_DIM);
    matrix.set(a, 0);
    matrix.set(b, CARD_EMBED_DIM);
    const c = computePackCentroid(matrix, 2);
    expect(c[0]).toBeCloseTo(c[1]!, 5);
    expect(Math.hypot(c[0]!, c[1]!)).toBeCloseTo(1, 5);
  });
});
