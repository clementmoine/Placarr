import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CARD_EMBED_MODEL, l2Normalize } from "@/core/identify/embedMath";

const embedState = vi.hoisted(() => ({
  ready: false,
  query: null as Float32Array | null,
}));

vi.mock("@/lib/client/scan/cardEmbed.client", () => ({
  isCardEmbedClientReady: () => embedState.ready,
  prefetchCardEmbedClient: vi.fn(async () => {}),
  embedCardFaceBlobClient: vi.fn(async () => embedState.query),
  clientEmbedDim: () => 4,
  clientEmbedModelId: () => CARD_EMBED_MODEL,
}));

vi.mock("@/lib/client/scan/paddleCollectorOcr.client", () => ({
  prefetchPaddleCollectorOcrClient: vi.fn(async () => {}),
  recognizeCollectorOcrClient: vi.fn(async () => null),
}));

import {
  admitShardForTests,
  resetClientEmbeddingMemory,
  type ClientEmbeddingMeta,
} from "@/lib/client/scan/cardEmbeddingIndex.client";
import { encodeFloat16Matrix } from "@/lib/shared/float16";
import {
  identifyCardBlobClient,
  resetClientIdentifyPackIds,
  shortlistManifest,
  type ClientPackManifest,
} from "@/lib/client/scan/clientIdentify";

const dim = 4;
const unit = (v: number[]) => l2Normalize(Float32Array.from(v));

function manifest(packId: string, centroid: number[]): ClientPackManifest {
  return {
    packId,
    entries: 1,
    dim,
    builtAt: "2026-01-01T00:00:00.000Z",
    bytesF16: 8,
    centroid: unit(centroid),
  };
}

/** Make a one-row pack resident the way a loaded f16 shard would be. */
async function admitPack(packId: string, row: number[]): Promise<void> {
  const matrix = new Float32Array(dim);
  matrix.set(unit(row), 0);
  const meta: ClientEmbeddingMeta = {
    version: 1,
    packId,
    model: CARD_EMBED_MODEL,
    dim,
    builtAt: "2026-01-01T00:00:00.000Z",
    entries: [
      {
        printKey: `${packId}:a-1`,
        lang: "en",
        set: "a",
        card: "1",
        artRel: "cards/en/a/1/art.webp",
        row: 0,
      },
    ],
    centroid: Array.from(unit(row)),
  };
  await admitShardForTests(meta, encodeFloat16Matrix(matrix));
}

function stubManifest(packs: ClientPackManifest[]) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      json: async () => ({
        packs: packs.map((p) => ({ ...p, centroid: Array.from(p.centroid) })),
      }),
    })),
  );
}

describe("identifyCardBlobClient — never waits on the first open", () => {
  beforeEach(() => {
    resetClientEmbeddingMemory();
    resetClientIdentifyPackIds();
    embedState.ready = true;
    embedState.query = unit([1, 0, 0, 0]);
    stubManifest([manifest("x", [1, 0, 0, 0]), manifest("y", [0, 1, 0, 0])]);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns null while the embed model is still loading (server answers)", async () => {
    embedState.ready = false;
    expect(await identifyCardBlobClient(new Blob())).toBeNull();
  });

  it("returns null when a shortlisted pack is not resident yet, without blocking", async () => {
    // Only "x" resident; the shortlist (minPacks 2) also wants "y".
    await admitPack("x", [1, 0, 0, 0]);
    const started = performance.now();
    expect(await identifyCardBlobClient(new Blob())).toBeNull();
    expect(performance.now() - started).toBeLessThan(200);
  });

  it("answers on-device once every shortlisted pack is resident", async () => {
    await admitPack("x", [1, 0, 0, 0]);
    await admitPack("y", [0, 1, 0, 0]);
    const res = await identifyCardBlobClient(new Blob());
    expect(res?.path).toBe("client");
    expect(res?.bestEmbedKey).toBe("x:a-1");
  });
});

describe("shortlistManifest", () => {
  it("keeps the nearest centroids (plus margin) from the manifest alone", () => {
    const query = unit([1, 0, 0, 0]);
    const m = [manifest("near", [1, 0.1, 0, 0]), manifest("far", [0, 0, 0, 1])];
    const short = shortlistManifest(query, m);
    expect(short[0]?.packId).toBe("near");
  });
});
