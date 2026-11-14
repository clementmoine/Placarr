import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import {
  embedArtBandBuffer,
  embedFullFrameBuffer,
} from "@/core/identify/cardEmbed";
import { CARD_EMBED_DIM, CARD_EMBED_MODEL, l2Normalize } from "./embedMath";
import {
  buildProductEmbeddingIndex,
  matchProductEmbedding,
  materializeProductEmbeddingIndex,
  partitionProductEmbeddingWork,
  productEmbeddingIndexMetaPath,
  type ProductEmbeddingIndexMeta,
} from "./productEmbeddingIndex";
import {
  writeProductVisualIndex,
  type ProductVisualIndexEntry,
} from "./productVisualIndex";

vi.mock("@/core/identify/cardEmbed", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/core/identify/cardEmbed")>();
  return {
    ...mod,
    embedFullFrameBuffer: vi.fn(async () => {
      const v = new Float32Array(CARD_EMBED_DIM);
      v[0] = 1;
      return l2Normalize(v);
    }),
    embedArtBandBuffer: vi.fn(async () => {
      throw new Error("product gallery must not use art-band embed");
    }),
    embedCardFaceBuffer: vi.fn(async () => {
      throw new Error("product gallery must not use card-face embed");
    }),
  };
});

const PACK = "demo-product-embed";
let root: string;
let prevDataDir: string | undefined;

function visualEntry(slug: string, fp: string): ProductVisualIndexEntry {
  return {
    productKey: `${PACK}::${slug}`,
    lang: "fr",
    slug,
    artRel: `products/${slug}/fr/art.webp`,
    hash: "0".repeat(16),
    aHash: "0".repeat(16),
    color: "00",
    fp,
  };
}

function unit(values: number[]): Float32Array {
  const v = new Float32Array(CARD_EMBED_DIM);
  for (let i = 0; i < values.length; i++) v[i] = values[i]!;
  return l2Normalize(v);
}

beforeAll(() => {
  root = mkdtempSync(path.join(os.tmpdir(), "placarr-product-embed-"));
  prevDataDir = process.env.PLACARR_DATA_DIR;
  process.env.PLACARR_DATA_DIR = root;
  mkdirSync(path.join(root, PACK), { recursive: true });
});

afterAll(() => {
  if (prevDataDir === undefined) delete process.env.PLACARR_DATA_DIR;
  else process.env.PLACARR_DATA_DIR = prevDataDir;
  rmSync(root, { recursive: true, force: true });
});

describe("partitionProductEmbeddingWork", () => {
  it("reuses vectors when fingerprint matches and cropMode is full", () => {
    const source = [visualEntry("box", "a-1"), visualEntry("etb", "b-2")];
    const matrix = new Float32Array(CARD_EMBED_DIM * 2);
    matrix[0] = 1;
    matrix[CARD_EMBED_DIM + 1] = 1;
    const existing = materializeProductEmbeddingIndex({
      mtimeMs: 0,
      matrix,
      meta: {
        version: 1,
        packId: PACK,
        model: CARD_EMBED_MODEL,
        dim: CARD_EMBED_DIM,
        cropMode: "full",
        builtAt: "2026-11-08T00:00:00.000Z",
        entries: source.map((e, row) => ({
          productKey: e.productKey,
          lang: e.lang,
          slug: e.slug,
          artRel: e.artRel,
          row,
          fp: e.fp,
        })),
      },
    });
    const { reuse, todo } = partitionProductEmbeddingWork(
      source,
      existing,
      true,
    );
    expect(reuse).toHaveLength(2);
    expect(todo).toHaveLength(0);
  });

  it("rejects a prior index that is not full-frame", () => {
    const source = [visualEntry("box", "a-1")];
    const existing = materializeProductEmbeddingIndex({
      mtimeMs: 0,
      matrix: new Float32Array(CARD_EMBED_DIM),
      meta: {
        version: 1,
        packId: PACK,
        model: CARD_EMBED_MODEL,
        dim: CARD_EMBED_DIM,
        cropMode: "full",
        builtAt: "2026-11-08T00:00:00.000Z",
        entries: [
          {
            productKey: source[0]!.productKey,
            lang: "fr",
            slug: "box",
            artRel: source[0]!.artRel,
            row: 0,
            fp: "a-1",
          },
        ],
      },
    });
    // Simulate a corrupt / card-band meta on disk.
    (existing.meta as { cropMode: string }).cropMode = "artBand";
    const { reuse, todo } = partitionProductEmbeddingWork(
      source,
      existing,
      true,
    );
    expect(reuse).toHaveLength(0);
    expect(todo).toHaveLength(1);
  });
});

describe("matchProductEmbedding", () => {
  it("ranks nearest productKey and marks tight margins ambiguous", () => {
    const a = unit([1, 0, 0]);
    const b = unit([0.99, 0.01, 0]);
    const matrix = new Float32Array(2 * CARD_EMBED_DIM);
    matrix.set(a, 0);
    matrix.set(b, CARD_EMBED_DIM);
    const index = materializeProductEmbeddingIndex({
      mtimeMs: 0,
      matrix,
      meta: {
        version: 1,
        packId: PACK,
        model: CARD_EMBED_MODEL,
        dim: CARD_EMBED_DIM,
        cropMode: "full",
        builtAt: "2026-11-08T00:00:00.000Z",
        entries: [
          {
            productKey: `${PACK}::box`,
            lang: "fr",
            slug: "box",
            artRel: "products/box/fr/art.webp",
            row: 0,
          },
          {
            productKey: `${PACK}::etb`,
            lang: "fr",
            slug: "etb",
            artRel: "products/etb/fr/art.webp",
            row: 1,
          },
        ],
      },
    });
    const hits = matchProductEmbedding(a, index, {
      limit: 3,
      maxDistance: 500,
      minMargin: 50,
    });
    expect(hits[0]?.productKey).toBe(`${PACK}::box`);
    expect(hits[0]?.ambiguous).toBe(true);
  });
});

describe("buildProductEmbeddingIndex (mocked DINOv2)", () => {
  it("embeds via full-frame only and writes cropMode full meta", async () => {
    const entries = [visualEntry("box", "fp1")];
    writeProductVisualIndex({
      version: 1,
      packId: PACK,
      lang: "fr",
      builtAt: "2026-11-08T00:00:00.000Z",
      entries,
    });
    const artDir = path.join(root, PACK, "products", "box", "fr");
    mkdirSync(artDir, { recursive: true });
    // Tiny jpeg so the path exists; mock skips real decode of the buffer.
    writeFileSync(path.join(artDir, "art.webp"), Buffer.from([0xff, 0xd8, 0xff, 0xd9]));

    vi.mocked(embedFullFrameBuffer).mockClear();
    vi.mocked(embedArtBandBuffer).mockClear();

    const meta = await buildProductEmbeddingIndex({
      packId: PACK,
      reuseExisting: false,
    });

    expect(meta.cropMode).toBe("full");
    expect(meta.entries).toHaveLength(1);
    expect(meta.entries[0]?.productKey).toBe(`${PACK}::box`);
    expect(embedFullFrameBuffer).toHaveBeenCalled();
    expect(embedArtBandBuffer).not.toHaveBeenCalled();
    expect(productEmbeddingIndexMetaPath(PACK)).toContain(
      "product-embedding-index.json",
    );
  });

  it("no-ops when every vector is reusable", async () => {
    const entries = [visualEntry("box", "fp1")];
    writeProductVisualIndex({
      version: 1,
      packId: PACK,
      lang: "fr",
      builtAt: "2026-11-08T00:00:00.000Z",
      entries,
    });
    const matrix = new Float32Array(CARD_EMBED_DIM);
    matrix[0] = 1;
    const prior: ProductEmbeddingIndexMeta = {
      version: 1,
      packId: PACK,
      model: CARD_EMBED_MODEL,
      dim: CARD_EMBED_DIM,
      cropMode: "full",
      builtAt: "2026-11-01T00:00:00.000Z",
      entries: [
        {
          productKey: `${PACK}::box`,
          lang: "fr",
          slug: "box",
          artRel: "products/box/fr/art.webp",
          row: 0,
          fp: "fp1",
        },
      ],
    };
    writeFileSync(
      productEmbeddingIndexMetaPath(PACK),
      JSON.stringify(prior),
    );
    const { productEmbeddingIndexBinPath, productEmbeddingIndexF16Path } =
      await import("./productEmbeddingIndex");
    writeFileSync(
      productEmbeddingIndexBinPath(PACK),
      Buffer.from(matrix.buffer, matrix.byteOffset, matrix.byteLength),
    );
    writeFileSync(productEmbeddingIndexF16Path(PACK), Buffer.alloc(0));

    vi.mocked(embedFullFrameBuffer).mockClear();
    const meta = await buildProductEmbeddingIndex({ packId: PACK });
    expect(meta.builtAt).toBe("2026-11-01T00:00:00.000Z");
    expect(embedFullFrameBuffer).not.toHaveBeenCalled();
  });
});
