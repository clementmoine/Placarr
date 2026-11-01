import { describe, expect, it } from "vitest";

import { CARD_EMBED_MODEL, l2Normalize } from "@/core/identify/embedMath";
import {
  admitResidentPackForTests,
  getResidentPack,
  matchClientEmbeddings,
  RESIDENT_BUDGET_BYTES,
  residentPackIds,
  resetClientEmbeddingMemory,
  shardRevalidationDecision,
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
      model: CARD_EMBED_MODEL,
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

describe("resident packs (bounded LRU)", () => {
  function bigPack(packId: string, bytes: number): ClientLoadedPack {
    const base = packFixture();
    return {
      ...base,
      meta: { ...base.meta, packId },
      matrix: new Float32Array(Math.ceil(bytes / 4)),
    };
  }

  it("evicts the least recently used pack once over budget", () => {
    resetClientEmbeddingMemory();
    const half = RESIDENT_BUDGET_BYTES / 2;
    admitResidentPackForTests(bigPack("a", half * 0.6));
    admitResidentPackForTests(bigPack("b", half * 0.6));
    // Touch "a" so "b" becomes the LRU victim.
    expect(getResidentPack("a")).not.toBeNull();
    admitResidentPackForTests(bigPack("c", half * 0.9));
    expect(residentPackIds().sort()).toEqual(["a", "c"]);
    expect(getResidentPack("b")).toBeNull();
  });

  it("still admits a single pack larger than the budget (alone)", () => {
    resetClientEmbeddingMemory();
    admitResidentPackForTests(bigPack("small", 1024));
    admitResidentPackForTests(bigPack("huge", RESIDENT_BUDGET_BYTES * 1.2));
    expect(residentPackIds()).toEqual(["huge"]);
  });
});

describe("shardRevalidationDecision", () => {
  const stored = { storedEtag: '"abc"', storedBuiltAt: "2026-01-01T00:00:00Z" };

  it("keeps the IDB shard on 304 (validator matched)", () => {
    expect(shardRevalidationDecision({ status: 304, ...stored })).toBe("keep");
  });

  it("refreshes when the server has a new index (200 with validator)", () => {
    expect(shardRevalidationDecision({ status: 200, ...stored })).toBe(
      "refresh",
    );
  });

  it("legacy record without ETag: compares builtAt instead", () => {
    const legacy = { status: 200, storedBuiltAt: stored.storedBuiltAt };
    expect(
      shardRevalidationDecision({
        ...legacy,
        serverBuiltAt: stored.storedBuiltAt,
      }),
    ).toBe("keep");
    expect(
      shardRevalidationDecision({
        ...legacy,
        serverBuiltAt: "2026-02-01T00:00:00Z",
      }),
    ).toBe("refresh");
  });

  it("never drops a working shard on server errors / offline", () => {
    expect(shardRevalidationDecision({ status: 500, ...stored })).toBe("keep");
    expect(shardRevalidationDecision({ status: 404, ...stored })).toBe("keep");
  });
});
