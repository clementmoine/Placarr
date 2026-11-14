/**
 * Mid-build checkpoints must survive a restart: a second build reuses flushed
 * vectors and only encodes the remaining faces.
 */
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CARD_EMBED_DIM, l2Normalize } from "./embedMath";
import type { CardVisualIndexEntry } from "./cardVisualIndex";
import { writeCardVisualIndex } from "./cardVisualIndex";

vi.mock("@/core/identify/cardEmbed", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./cardEmbed")>();
  return {
    ...actual,
    embedArtBandBuffer: vi.fn(async () => {
      const v = new Float32Array(CARD_EMBED_DIM);
      v[0] = 1;
      return l2Normalize(v);
    }),
  };
});

vi.mock("@/core/enrich/media/imageAssets", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/core/enrich/media/imageAssets")>();
  return {
    ...actual,
    extractCardArtBand: vi.fn(async () => Buffer.from([1, 2, 3])),
  };
});

import { embedArtBandBuffer } from "./cardEmbed";
import {
  buildCardEmbeddingIndex,
  loadCardEmbeddingIndex,
  partitionEmbeddingWork,
  persistCardEmbeddingIndex,
} from "./cardEmbeddingIndex";

const PACK = "demo-embed-checkpoint";
let root: string;
let prevDataDir: string | undefined;

function visualEntry(n: number): CardVisualIndexEntry {
  return {
    printKey: `demo:s1-${n}`,
    lang: "fr",
    set: "s1",
    card: String(n),
    artRel: `cards/fr/s1/${n}/art.jpg`,
    hash: "0".repeat(16),
    aHash: "0".repeat(16),
    color: "00",
    fp: `fp-${n}`,
  };
}

beforeEach(() => {
  root = mkdtempSync(path.join(os.tmpdir(), "placarr-embed-ckpt-"));
  prevDataDir = process.env.PLACARR_DATA_DIR;
  process.env.PLACARR_DATA_DIR = root;
  mkdirSync(path.join(root, PACK), { recursive: true });
  vi.mocked(embedArtBandBuffer).mockClear();
});

afterEach(() => {
  if (prevDataDir === undefined) delete process.env.PLACARR_DATA_DIR;
  else process.env.PLACARR_DATA_DIR = prevDataDir;
  rmSync(root, { recursive: true, force: true });
});

describe("buildCardEmbeddingIndex checkpoints", () => {
  it("flushes mid-run and resumes without re-encoding flushed faces", async () => {
    const entries = [1, 2, 3, 4, 5].map(visualEntry);
    writeCardVisualIndex({
      version: 2,
      packId: PACK,
      lang: "fr",
      builtAt: "2026-11-10T00:00:00.000Z",
      entries,
    });
    for (const e of entries) {
      const dir = path.join(root, PACK, path.dirname(e.artRel));
      mkdirSync(dir, { recursive: true });
      writeFileSync(path.join(root, PACK, e.artRel), Buffer.from([0xff, 0xd8]));
    }

    const checkpoints: number[] = [];
    const meta = await buildCardEmbeddingIndex({
      packId: PACK,
      reuseExisting: false,
      checkpointEvery: 2,
      onCheckpoint: (n) => checkpoints.push(n),
    });
    expect(meta.entries).toHaveLength(5);
    expect(checkpoints.length).toBeGreaterThanOrEqual(1);
    expect(checkpoints[0]).toBeGreaterThanOrEqual(2);

    const full = loadCardEmbeddingIndex(PACK)!;
    // Simulate crash after a mid-checkpoint: only first 2 vectors on disk.
    persistCardEmbeddingIndex(
      PACK,
      full.meta.entries.slice(0, 2).map((e, row) => ({ ...e, row })),
      [
        full.matrix.slice(0, CARD_EMBED_DIM),
        full.matrix.slice(CARD_EMBED_DIM, CARD_EMBED_DIM * 2),
      ],
    );

    const prior = loadCardEmbeddingIndex(PACK)!;
    const { reuse, todo } = partitionEmbeddingWork(entries, prior, true);
    expect(reuse).toHaveLength(2);
    expect(todo).toHaveLength(3);

    vi.mocked(embedArtBandBuffer).mockClear();
    const resumed = await buildCardEmbeddingIndex({
      packId: PACK,
      reuseExisting: true,
      checkpointEvery: 2,
    });
    expect(resumed.entries).toHaveLength(5);
    expect(embedArtBandBuffer).toHaveBeenCalledTimes(3);
  });
});
