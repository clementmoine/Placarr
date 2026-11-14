/**
 * Embedding index rebuild must be a no-op on disk when every vector is
 * reusable — no ONNX, no rewrite, stable mtimes/ETags for the client shards.
 */
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  buildCardEmbeddingIndex,
  cardEmbeddingIndexBinPath,
  cardEmbeddingIndexF16Path,
  cardEmbeddingIndexMetaPath,
  type CardEmbeddingIndexMeta,
} from "./cardEmbeddingIndex";
import type { CardVisualIndexEntry } from "./cardVisualIndex";
import { writeCardVisualIndex } from "./cardVisualIndex";
import { CARD_EMBED_DIM, CARD_EMBED_MODEL, l2Normalize } from "./embedMath";

const PACK = "demo-embed-incremental";
let root: string;
let prevDataDir: string | undefined;

function visualEntry(n: number, fp: string): CardVisualIndexEntry {
  return {
    printKey: `demo:s1-${n}`,
    lang: "fr",
    set: "s1",
    card: String(n),
    artRel: `cards/fr/s1/${n}/art.jpg`,
    hash: "0".repeat(16),
    aHash: "0".repeat(16),
    color: "00",
    fp,
  };
}

beforeAll(() => {
  root = mkdtempSync(path.join(os.tmpdir(), "placarr-embed-"));
  prevDataDir = process.env.PLACARR_DATA_DIR;
  process.env.PLACARR_DATA_DIR = root;
  mkdirSync(path.join(root, PACK), { recursive: true });

  const entries = [visualEntry(1, "a-1"), visualEntry(2, "b-2")];
  writeCardVisualIndex({
    version: 2,
    packId: PACK,
    lang: "fr",
    builtAt: "2026-10-01T00:00:00.000Z",
    entries,
  });

  // Prior embedding index covering both faces (fake but well-formed vectors).
  const matrix = new Float32Array(CARD_EMBED_DIM * 2);
  const v1 = new Float32Array(CARD_EMBED_DIM);
  v1[0] = 1;
  const v2 = new Float32Array(CARD_EMBED_DIM);
  v2[1] = 1;
  matrix.set(l2Normalize(v1), 0);
  matrix.set(l2Normalize(v2), CARD_EMBED_DIM);
  const meta: CardEmbeddingIndexMeta = {
    version: 1,
    packId: PACK,
    model: CARD_EMBED_MODEL,
    dim: CARD_EMBED_DIM,
    builtAt: "2026-10-01T00:00:01.000Z",
    entries: entries.map((e, row) => ({
      printKey: e.printKey,
      lang: e.lang,
      set: e.set,
      card: e.card,
      artRel: e.artRel,
      row,
      fp: e.fp,
    })),
  };
  writeFileSync(cardEmbeddingIndexMetaPath(PACK), JSON.stringify(meta));
  writeFileSync(
    cardEmbeddingIndexBinPath(PACK),
    Buffer.from(matrix.buffer, matrix.byteOffset, matrix.byteLength),
  );
  writeFileSync(cardEmbeddingIndexF16Path(PACK), Buffer.alloc(0));
});

afterAll(() => {
  if (prevDataDir === undefined) delete process.env.PLACARR_DATA_DIR;
  else process.env.PLACARR_DATA_DIR = prevDataDir;
  rmSync(root, { recursive: true, force: true });
});

describe("buildCardEmbeddingIndex (incremental)", () => {
  it("returns the prior index untouched when every vector is reusable", async () => {
    const metaPath = cardEmbeddingIndexMetaPath(PACK);
    const f16Path = cardEmbeddingIndexF16Path(PACK);
    const before = statSync(metaPath).mtimeMs;
    const f16Before = statSync(f16Path).size;

    const meta = await buildCardEmbeddingIndex({ packId: PACK });

    expect(meta.builtAt).toBe("2026-10-01T00:00:01.000Z");
    expect(meta.entries).toHaveLength(2);
    expect(statSync(metaPath).mtimeMs).toBe(before);
    // f16 shard left alone too (would have been regenerated otherwise).
    expect(statSync(f16Path).size).toBe(f16Before);
  });

  it("rewrites when a face fingerprint moved (vector no longer trusted)", async () => {
    writeCardVisualIndex({
      version: 2,
      packId: PACK,
      lang: "fr",
      builtAt: "2026-10-02T00:00:00.000Z",
      entries: [visualEntry(1, "a-1"), visualEntry(2, "b-CHANGED")],
    });
    // Face 2 has no file on disk → cannot be re-encoded → dropped from the
    // new index; the index must still be rewritten (content changed).
    const meta = await buildCardEmbeddingIndex({ packId: PACK });
    expect(meta.builtAt).not.toBe("2026-10-01T00:00:01.000Z");
    expect(meta.entries.map((e) => e.printKey)).toEqual(["demo:s1-1"]);
    expect(statSync(cardEmbeddingIndexF16Path(PACK)).size).toBe(
      CARD_EMBED_DIM * 2,
    );
  });
});
