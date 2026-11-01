import { describe, expect, it } from "vitest";

import { CARD_EMBED_MODEL, l2Normalize } from "@/core/identify/embedMath";
import {
  admitShardForTests,
  getResidentPack,
  HOT_F32_BUDGET_BYTES,
  HOT_F32_BUDGET_CONSTRAINED_BYTES,
  hotBudgetForDevice,
  isPackHot,
  matchClientEmbeddings,
  promotePackHot,
  promotePacksHot,
  residentPackIds,
  resetClientEmbeddingMemory,
  setHotF32BudgetForTests,
  shardRevalidationDecision,
  type ClientEmbeddingMeta,
  type ClientLoadedPack,
} from "@/lib/client/scan/cardEmbeddingIndex.client";
import {
  encodeFloat16Matrix,
  decodeFloat16Matrix,
  float16View,
} from "@/lib/shared/float16";

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

describe("matchClientEmbeddings reads the resident f16 view directly", () => {
  it("gives the same nearest neighbour on Float16Array and Float32Array", () => {
    const pack = packFixture();
    const half = float16View(encodeFloat16Matrix(pack.matrix as Float32Array));
    expect(half).not.toBeNull();
    const query = l2Normalize(Float32Array.from([0.05, 0.95, 0, 0]));
    const f32 = matchClientEmbeddings(query, [pack], { maxDistance: 500 });
    const f16 = matchClientEmbeddings(query, [{ ...pack, matrix: half! }], {
      maxDistance: 500,
    });
    expect(f16[0]?.printKey).toBe(f32[0]?.printKey);
    expect(Math.abs(f16[0]!.distance - f32[0]!.distance)).toBeLessThanOrEqual(
      1,
    );
  });
});

describe("hotBudgetForDevice", () => {
  it("gives desktop-class memory the full budget and everything else the phone one", () => {
    expect(hotBudgetForDevice(8)).toBe(HOT_F32_BUDGET_BYTES);
    expect(hotBudgetForDevice(4)).toBe(HOT_F32_BUDGET_CONSTRAINED_BYTES);
    // Safari / Firefox never report it — every iPhone lands here.
    expect(hotBudgetForDevice(undefined)).toBe(
      HOT_F32_BUDGET_CONSTRAINED_BYTES,
    );
  });
});

describe("resident packs: f16 always, hot f32 bounded", () => {
  const dim = 4;
  function shard(packId: string, rows: number) {
    const matrix = new Float32Array(rows * dim);
    for (let row = 0; row < rows; row++) {
      const v = Float32Array.from(
        { length: dim },
        (_, d) => 1 + ((row * 3 + d) % 5),
      );
      matrix.set(l2Normalize(v), row * dim);
    }
    const meta: ClientEmbeddingMeta = {
      version: 1,
      packId,
      model: CARD_EMBED_MODEL,
      dim,
      builtAt: "2026-01-01T00:00:00.000Z",
      entries: Array.from({ length: rows }, (_, row) => ({
        printKey: `${packId}:a-${row}`,
        lang: "en",
        set: "a",
        card: String(row),
        artRel: `cards/en/a/${row}/art.webp`,
        row,
      })),
      centroid: [1, 0, 0, 0],
    };
    return admitShardForTests(meta, encodeFloat16Matrix(matrix));
  }
  const f32Bytes = (rows: number) => rows * dim * 4;

  it("a loaded shard is resident as f16 without decoding", async () => {
    resetClientEmbeddingMemory();
    const pack = await shard("a", 10);
    expect(getResidentPack("a")).toBe(pack);
    expect(pack.matrix).toBeInstanceOf(Float16Array);
    expect(isPackHot("a")).toBe(false);
  });

  it("promotion swaps in an f32 copy and demotes the LRU hot pack when over budget", async () => {
    resetClientEmbeddingMemory();
    setHotF32BudgetForTests(f32Bytes(25));
    const a = await shard("a", 10);
    const b = await shard("b", 10);
    const c = await shard("c", 10);
    await promotePackHot("a");
    await promotePackHot("b");
    expect(a.matrix).toBeInstanceOf(Float32Array);
    expect(b.matrix).toBeInstanceOf(Float32Array);
    // Touch "a" so "b" is the LRU victim; "c" needs room.
    getResidentPack("a");
    await promotePackHot("c");
    expect(isPackHot("c")).toBe(true);
    expect(isPackHot("a")).toBe(true);
    expect(isPackHot("b")).toBe(false);
    expect(b.matrix).toBeInstanceOf(Float16Array);
    // Demotion never drops residency — identify still reads "b".
    expect(residentPackIds().sort()).toEqual(["a", "b", "c"]);
  });

  it("a burst of promotions never exceeds the budget and never demotes a sibling of the same query", async () => {
    resetClientEmbeddingMemory();
    setHotF32BudgetForTests(f32Bytes(25));
    const ids = ["a", "b", "c", "d", "e"];
    const packs = await Promise.all(ids.map((id) => shard(id, 10)));
    // Fire-and-forget like identify does; wait for the sequential pump.
    promotePacksHot(ids);
    await new Promise((r) => setTimeout(r, 50));
    const hot = ids.filter((id) => isPackHot(id));
    // Nearest first, stop when full: a and b fit (20 rows), c would not.
    expect(hot).toEqual(["a", "b"]);
    let hotBytes = 0;
    for (const p of packs)
      if (p.matrix instanceof Float32Array) hotBytes += p.matrix.byteLength;
    expect(hotBytes).toBeLessThanOrEqual(f32Bytes(25));
    // Same query again: nothing to do, nothing demoted.
    promotePacksHot(ids);
    await new Promise((r) => setTimeout(r, 20));
    expect(ids.filter((id) => isPackHot(id))).toEqual(["a", "b"]);
  });

  it("a later query evicts hot packs the new shortlist does not need", async () => {
    resetClientEmbeddingMemory();
    setHotF32BudgetForTests(f32Bytes(25));
    await shard("old", 10);
    await shard("new", 10);
    await shard("new2", 10);
    promotePacksHot(["old"]);
    await new Promise((r) => setTimeout(r, 20));
    expect(isPackHot("old")).toBe(true);
    promotePacksHot(["new", "new2"]);
    await new Promise((r) => setTimeout(r, 50));
    expect(isPackHot("new")).toBe(true);
    expect(isPackHot("new2")).toBe(true);
    expect(isPackHot("old")).toBe(false);
  });

  it("a pack larger than the whole hot budget stays f16 and still matches", async () => {
    resetClientEmbeddingMemory();
    setHotF32BudgetForTests(f32Bytes(5));
    const huge = await shard("huge", 10);
    await promotePackHot("huge");
    expect(isPackHot("huge")).toBe(false);
    expect(getResidentPack("huge")).toBe(huge);
    const query = l2Normalize(Float32Array.from(huge.matrix.subarray(0, dim)));
    const hits = matchClientEmbeddings(query, [huge], { maxDistance: 1000 });
    expect(hits[0]?.printKey).toBe("huge:a-0");
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
