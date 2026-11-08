import { describe, expect, it } from "vitest";

import {
  compactProductEmbeddingEntry,
  expandProductEmbeddingEntry,
  standardProductArtRel,
} from "./productEmbeddingEntry";

describe("productEmbeddingEntry compact / expand", () => {
  it("compacts standard products/{slug}/{lang}/art paths", () => {
    const entry = {
      productKey: "lorcana::booster-box",
      lang: "fr",
      slug: "booster-box",
      artRel: standardProductArtRel("booster-box", "fr", "art.coleka.webp"),
      row: 3,
      fp: "a-1",
    };
    const wire = compactProductEmbeddingEntry(entry);
    expect(wire.art).toBe("art.coleka.webp");
    expect(wire.artRel).toBeUndefined();
    expect(expandProductEmbeddingEntry(wire)).toEqual(entry);
  });

  it("keeps odd artRel verbatim", () => {
    const entry = {
      productKey: "lorcana::box",
      lang: "fr",
      slug: "box",
      artRel: "products/legacy/box-fr-art.webp",
      row: 0,
    };
    const wire = compactProductEmbeddingEntry(entry);
    expect(wire.artRel).toBe(entry.artRel);
    expect(wire.art).toBeUndefined();
    expect(expandProductEmbeddingEntry(wire)?.artRel).toBe(entry.artRel);
  });
});
