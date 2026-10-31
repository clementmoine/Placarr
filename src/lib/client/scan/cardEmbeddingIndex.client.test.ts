import { describe, expect, it } from "vitest";

import { l2Normalize } from "@/core/identify/embedMath";
import {
  matchClientEmbeddings,
  resetClientEmbeddingMemory,
  type ClientLoadedPack,
} from "@/lib/client/scan/cardEmbeddingIndex.client";
import { encodeFloat16Matrix, decodeFloat16Matrix } from "@/lib/shared/float16";

function packFixture(): ClientLoadedPack {
  const dim = 4;
  const rows = 3;
  // Three unit-ish vectors; query will match row 1.
  const matrix = new Float32Array(rows * dim);
  matrix.set(l2Normalize(Float32Array.from([1, 0, 0, 0])), 0);
  matrix.set(l2Normalize(Float32Array.from([0.1, 0.9, 0, 0])), dim);
  matrix.set(l2Normalize(Float32Array.from([0, 0, 1, 0])), dim * 2);
  const f16 = encodeFloat16Matrix(matrix);
  const decoded = decodeFloat16Matrix(f16, rows * dim);
  return {
    meta: {
      version: 1,
      packId: "test/pack",
      model: "Xenova/mobileclip_s0",
      dim,
      builtAt: "2026-01-01T00:00:00.000Z",
      entries: [
        {
          printKey: "game:a-1",
          lang: "en",
          set: "a",
          card: "1",
          artRel: "cards/en/a/1/art.webp",
          row: 0,
        },
        {
          printKey: "game:b-2",
          lang: "en",
          set: "b",
          card: "2",
          artRel: "cards/en/b/2/art.webp",
          row: 1,
        },
        {
          printKey: "game:c-3",
          lang: "en",
          set: "c",
          card: "3",
          artRel: "cards/en/c/3/art.webp",
          row: 2,
        },
      ],
    },
    matrix: decoded,
    centroid: l2Normalize(Float32Array.from([0.4, 0.4, 0.4, 0])),
  };
}

describe("matchClientEmbeddings (f16 matrix)", () => {
  it("returns nearest neighbour by milli-distance", () => {
    resetClientEmbeddingMemory();
    const pack = packFixture();
    const query = l2Normalize(Float32Array.from([0.05, 0.95, 0, 0]));
    const hits = matchClientEmbeddings(query, [pack], {
      limit: 2,
      maxDistance: 500,
    });
    expect(hits[0]?.printKey).toBe("game:b-2");
    expect(hits[0]?.method).toBe("embed");
  });

  it("break-glass OCR hint can surface a set+number row", () => {
    resetClientEmbeddingMemory();
    const pack = packFixture();
    // Query near row 0 so global NN is a-1; OCR asks for card 3.
    const query = l2Normalize(Float32Array.from([1, 0, 0, 0]));
    const hits = matchClientEmbeddings(query, [pack], {
      limit: 3,
      maxDistance: 1000,
      ocrText: "#3",
    });
    expect(hits.some((h) => h.printKey === "game:c-3")).toBe(true);
  });
});
