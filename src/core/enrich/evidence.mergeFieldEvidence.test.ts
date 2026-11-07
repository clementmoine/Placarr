import { describe, expect, it } from "vitest";

import { mergeFieldEvidenceForStorage } from "./evidence";

describe("mergeFieldEvidenceForStorage", () => {
  it("preserves catalog evidence when only a marketplace source answers", () => {
    const merged = mergeFieldEvidenceForStorage(
      [
        {
          field: "cover",
          source: "pricecharting",
          value: "https://images.pricecharting.com/ds-lite.jpg",
        },
        {
          field: "title",
          source: "PriceCharting",
          value: "White Nintendo DS Lite",
        },
        {
          field: "external-link:PriceCharting",
          source: "pricecharting",
          value: "Voir la fiche",
          sourceUrl:
            "https://www.pricecharting.com/game/ds/white-nintendo-ds-lite",
        },
      ],
      [
        {
          field: "cover",
          source: "backmarket",
          value: "https://cloudfront.net/bm.jpg",
        },
        {
          field: "title",
          source: "Back Market",
          value: "Nintendo DS Lite - Blanc",
        },
        {
          field: "title",
          source: "MergedEngine",
          value: "Nintendo DS Lite - Blanc",
        },
      ],
    );

    expect(merged.map((row) => `${row.source}:${row.field}`).sort()).toEqual(
      [
        "Back Market:title",
        "MergedEngine:title",
        "PriceCharting:title",
        "backmarket:cover",
        "pricecharting:cover",
        "pricecharting:external-link:PriceCharting",
      ].sort(),
    );
  });

  it("replaces every row for a source that reported again", () => {
    const merged = mergeFieldEvidenceForStorage(
      [
        {
          field: "cover",
          source: "pricecharting",
          value: "https://images.pricecharting.com/old.jpg",
        },
        {
          field: "title",
          source: "pricecharting",
          value: "Old Title",
        },
      ],
      [
        {
          field: "cover",
          source: "pricecharting",
          value: "https://images.pricecharting.com/new.jpg",
        },
      ],
    );

    expect(merged).toEqual([
      {
        field: "cover",
        source: "pricecharting",
        value: "https://images.pricecharting.com/new.jpg",
      },
    ]);
  });
});
