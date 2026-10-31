import { describe, expect, it } from "vitest";

import {
  CARD_EMBED_DIM,
  cosineSimilarity,
  cosineToDistance,
  l2Normalize,
} from "./cardEmbed";
import {
  listCardEmbeddingIndexPackIds,
  matchCardEmbedding,
  materializeEmbeddingIndex,
  partitionEmbeddingWork,
} from "./cardEmbeddingIndex";
import { CARD_EMBED_MODEL } from "./cardEmbed";
import {
  listCardVisualIndexPackIds,
  loadCardVisualIndex,
} from "./cardVisualIndex";

function unit(values: number[]): Float32Array {
  const v = new Float32Array(CARD_EMBED_DIM);
  for (let i = 0; i < values.length; i++) v[i] = values[i]!;
  return l2Normalize(v);
}

describe("cardEmbed math", () => {
  it("cosine of identical unit vectors is ~1", () => {
    const a = unit([1, 0, 0]);
    expect(cosineSimilarity(a, a)).toBeCloseTo(1, 5);
    expect(cosineToDistance(1)).toBe(0);
  });

  it("maps cosine 0.75 → distance 250", () => {
    expect(cosineToDistance(0.75)).toBe(250);
  });
});

describe("matchCardEmbedding", () => {
  it("ranks nearest row and marks tight margins ambiguous", () => {
    const a = unit([1, 0, 0]);
    const b = unit([0.99, 0.01, 0]);
    const c = unit([0, 1, 0]);
    const matrix = new Float32Array(3 * CARD_EMBED_DIM);
    matrix.set(a, 0);
    matrix.set(b, CARD_EMBED_DIM);
    matrix.set(c, 2 * CARD_EMBED_DIM);

    const index = {
      mtimeMs: 0,
      matrix,
      meta: {
        version: 1 as const,
        packId: "lorcana",
        model: "Xenova/clip-vit-base-patch32",
        dim: CARD_EMBED_DIM,
        builtAt: "2026-10-30T00:00:00.000Z",
        entries: [
          {
            printKey: "lorcana:1-1",
            lang: "fr",
            set: "1",
            card: "1",
            artRel: "cards/fr/1/1/art.jpg",
            row: 0,
          },
          {
            printKey: "lorcana:1-2",
            lang: "fr",
            set: "1",
            card: "2",
            artRel: "cards/fr/1/2/art.jpg",
            row: 1,
          },
          {
            printKey: "lorcana:1-3",
            lang: "fr",
            set: "1",
            card: "3",
            artRel: "cards/fr/1/3/art.jpg",
            row: 2,
          },
        ],
      },
    };

    const hits = matchCardEmbedding(a, materializeEmbeddingIndex(index), {
      limit: 3,
      maxDistance: 500,
      minMargin: 50,
    });
    expect(hits[0]?.printKey).toBe("lorcana:1-1");
    expect(hits[0]?.ambiguous).toBe(true);
    expect(hits.map((h) => h.printKey)).toContain("lorcana:1-2");
  });

  it("dedupes the same printKey across langs before margin", () => {
    const a = unit([1, 0, 0]);
    const near = unit([0.999, 0.001, 0]);
    const matrix = new Float32Array(2 * CARD_EMBED_DIM);
    matrix.set(a, 0);
    matrix.set(near, CARD_EMBED_DIM);
    const index = {
      mtimeMs: 0,
      matrix,
      meta: {
        version: 1 as const,
        packId: "lorcana",
        model: "Xenova/clip-vit-base-patch32",
        dim: CARD_EMBED_DIM,
        builtAt: "2026-10-30T00:00:00.000Z",
        entries: [
          {
            printKey: "lorcana:1-1",
            lang: "fr",
            set: "1",
            card: "1",
            artRel: "cards/fr/1/1/art.jpg",
            row: 0,
          },
          {
            printKey: "lorcana:1-1",
            lang: "en",
            set: "1",
            card: "1",
            artRel: "cards/en/1/1/art.jpg",
            row: 1,
          },
        ],
      },
    };
    const hits = matchCardEmbedding(a, materializeEmbeddingIndex(index), {
      limit: 3,
      maxDistance: 500,
      minMargin: 50,
    });
    expect(hits).toHaveLength(1);
    expect(hits[0]?.printKey).toBe("lorcana:1-1");
    expect(hits[0]?.ambiguous).toBeUndefined();
  });

  it("prefers UI lang when CLIP barely favors the other locale", () => {
    const query = unit([1, 0, 0]);
    // EN slightly closer; FR still within EMBED_LANG_TIE_EPS.
    const en = unit([0.9995, 0.0005, 0]);
    const fr = unit([0.998, 0.002, 0]);
    const matrix = new Float32Array(2 * CARD_EMBED_DIM);
    matrix.set(en, 0);
    matrix.set(fr, CARD_EMBED_DIM);
    const index = {
      mtimeMs: 0,
      matrix,
      meta: {
        version: 1 as const,
        packId: "lorcana",
        model: "Xenova/clip-vit-base-patch32",
        dim: CARD_EMBED_DIM,
        builtAt: "2026-10-30T00:00:00.000Z",
        entries: [
          {
            printKey: "lorcana:1-177",
            lang: "en",
            set: "1",
            card: "177",
            artRel: "cards/en/1/177/art.jpg",
            row: 0,
          },
          {
            printKey: "lorcana:1-177",
            lang: "fr",
            set: "1",
            card: "177",
            artRel: "cards/fr/1/177/art.jpg",
            row: 1,
          },
        ],
      },
    };
    const without = matchCardEmbedding(query, materializeEmbeddingIndex(index), {
      limit: 2,
      maxDistance: 500,
      minMargin: 50,
    });
    expect(without[0]?.lang).toBe("en");
    const withFr = matchCardEmbedding(query, materializeEmbeddingIndex(index), {
      limit: 2,
      maxDistance: 500,
      minMargin: 50,
      preferLang: "fr",
    });
    expect(withFr).toHaveLength(1);
    expect(withFr[0]?.lang).toBe("fr");
    expect(withFr[0]?.printKey).toBe("lorcana:1-177");
  });

  it("partitionEmbeddingWork reuses matching printKey+artRel", () => {
    const a = unit([1, 0, 0]);
    const matrix = new Float32Array(CARD_EMBED_DIM);
    matrix.set(a, 0);
    const existing = {
      mtimeMs: 0,
      matrix,
      meta: {
        version: 1 as const,
        packId: "demo",
        model: CARD_EMBED_MODEL,
        dim: CARD_EMBED_DIM,
        builtAt: "2026-10-30T00:00:00.000Z",
        entries: [
          {
            printKey: "demo:1-1",
            lang: "en",
            set: "1",
            card: "1",
            artRel: "cards/en/1/1/art.webp",
            row: 0,
          },
        ],
      },
    };
    const source = [
      {
        printKey: "demo:1-1",
        lang: "en",
        set: "1",
        card: "1",
        artRel: "cards/en/1/1/art.webp",
        hash: "0".repeat(16),
      },
      {
        printKey: "demo:1-2",
        lang: "en",
        set: "1",
        card: "2",
        artRel: "cards/en/1/2/art.webp",
        hash: "1".repeat(16),
      },
    ];
    const { reuse, todo } = partitionEmbeddingWork(source, materializeEmbeddingIndex(existing), true);
    expect(reuse).toHaveLength(1);
    expect(reuse[0]?.row.printKey).toBe("demo:1-1");
    expect(todo.map((r) => r.printKey)).toEqual(["demo:1-2"]);
  });

  it("partitionEmbeddingWork ignores prior when reuse disabled", () => {
    const matrix = new Float32Array(CARD_EMBED_DIM);
    const existing = {
      mtimeMs: 0,
      matrix,
      meta: {
        version: 1 as const,
        packId: "demo",
        model: CARD_EMBED_MODEL,
        dim: CARD_EMBED_DIM,
        builtAt: "2026-10-30T00:00:00.000Z",
        entries: [
          {
            printKey: "demo:1-1",
            lang: "en",
            set: "1",
            card: "1",
            artRel: "a.webp",
            row: 0,
          },
        ],
      },
    };
    const source = [
      {
        printKey: "demo:1-1",
        lang: "en",
        set: "1",
        card: "1",
        artRel: "a.webp",
        hash: "0".repeat(16),
      },
    ];
    const { reuse, todo } = partitionEmbeddingWork(source, materializeEmbeddingIndex(existing), false);
    expect(reuse).toHaveLength(0);
    expect(todo).toHaveLength(1);
  });

  it("stays empty when nothing is close enough", () => {
    const a = unit([1, 0, 0]);
    const far = unit([0, 1, 0]);
    const matrix = new Float32Array(CARD_EMBED_DIM);
    matrix.set(far, 0);
    const index = {
      mtimeMs: 0,
      matrix,
      meta: {
        version: 1 as const,
        packId: "lorcana",
        model: "Xenova/clip-vit-base-patch32",
        dim: CARD_EMBED_DIM,
        builtAt: "2026-10-30T00:00:00.000Z",
        entries: [
          {
            printKey: "lorcana:1-9",
            lang: "fr",
            set: "1",
            card: "9",
            artRel: "cards/fr/1/9/art.jpg",
            row: 0,
          },
        ],
      },
    };
    expect(
      matchCardEmbedding(a, materializeEmbeddingIndex(index), { maxDistance: 50 }),
    ).toEqual([]);
  });
});

describe("embedding coverage (local data)", () => {
  it("keeps a CLIP index for every non-empty visual pack", () => {
    const embedPacks = new Set(listCardEmbeddingIndexPackIds());
    const missing = listCardVisualIndexPackIds().filter((packId) => {
      const visual = loadCardVisualIndex(packId);
      return (visual?.entries.length ?? 0) > 0 && !embedPacks.has(packId);
    });
    expect(missing).toEqual([]);
  });
});
