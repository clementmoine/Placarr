import { describe, expect, it } from "vitest";

import { embeddingCheckpointInterval } from "./embeddingCheckpoint";
import { shouldLogEmbeddingProgress } from "@/providers/shared/cardCatalogue/embeddingIndexStep";

describe("embeddingCheckpointInterval", () => {
  it("uses 1% of todo with a 1000 floor", () => {
    expect(embeddingCheckpointInterval(50_000)).toBe(1000);
    expect(embeddingCheckpointInterval(167_349)).toBe(1674);
    expect(embeddingCheckpointInterval(0)).toBe(1000);
  });

  it("honours a positive test override", () => {
    expect(embeddingCheckpointInterval(167_349, 2)).toBe(2);
  });
});

describe("shouldLogEmbeddingProgress", () => {
  it("fires on every percent and every 1000 faces", () => {
    expect(shouldLogEmbeddingProgress(0, 10_000, -1, 0)).toBe(true);
    expect(shouldLogEmbeddingProgress(50, 10_000, 0, 0)).toBe(false);
    expect(shouldLogEmbeddingProgress(100, 10_000, 0, 0)).toBe(true); // 1%
    expect(shouldLogEmbeddingProgress(1500, 10_000, 1, 100)).toBe(true); // +1000
    expect(shouldLogEmbeddingProgress(10_000, 10_000, 99, 9900)).toBe(true);
  });
});
