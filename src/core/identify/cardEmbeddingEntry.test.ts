import { describe, expect, it } from "vitest";

import {
  compactEmbeddingEntry,
  expandEmbeddingEntry,
  expandEmbeddingEntries,
  standardArtRel,
} from "@/core/identify/cardEmbeddingEntry";

describe("cardEmbeddingEntry compact / expand", () => {
  const full = {
    printKey: "dbscg:bt1-001",
    lang: "en",
    set: "bt1",
    card: "001",
    artRel: "cards/en/bt1/001/art.bandai.webp",
    row: 0,
  };

  it("round-trips a standard artRel through short art", () => {
    const wire = compactEmbeddingEntry(full);
    expect(wire.art).toBe("art.bandai.webp");
    expect(wire.artRel).toBeUndefined();
    expect(expandEmbeddingEntry(wire)).toEqual(full);
  });

  it("keeps a non-standard artRel verbatim", () => {
    const odd = {
      ...full,
      artRel: "prints/custom/face.webp",
    };
    const wire = compactEmbeddingEntry(odd);
    expect(wire.art).toBeUndefined();
    expect(wire.artRel).toBe(odd.artRel);
    expect(expandEmbeddingEntry(wire)).toEqual(odd);
  });

  it("still reads legacy full-artRel JSON", () => {
    expect(expandEmbeddingEntry(full)).toEqual(full);
  });

  it("builds the standard path helper", () => {
    expect(standardArtRel("fr", "bt1", "001", "art.webp")).toBe(
      "cards/fr/bt1/001/art.webp",
    );
  });

  it("drops broken wire rows instead of inventing paths", () => {
    expect(
      expandEmbeddingEntries([
        full,
        { printKey: "x", lang: "en", set: "a", card: "1", row: 1 },
      ]),
    ).toEqual([full]);
  });
});
