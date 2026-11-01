import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CARD_EMBED_MODEL, l2Normalize } from "@/core/identify/embedMath";

const embedState = vi.hoisted(() => ({
  ready: false,
  query: null as Float32Array | null,
  /** What the art band reads when the face is taken half a turn round. */
  upsideDown: null as Float32Array | null,
  reads: [] as boolean[],
}));

vi.mock("@/lib/client/scan/cardEmbed.client", () => ({
  isCardEmbedClientReady: () => embedState.ready,
  prefetchCardEmbedClient: vi.fn(async () => {}),
  embedCardFaceBlobClient: vi.fn(
    async (_blob: Blob, opts?: { upsideDown?: boolean }) => {
      const flipped = opts?.upsideDown === true;
      embedState.reads.push(flipped);
      return flipped ? embedState.upsideDown : embedState.query;
    },
  ),
  clientEmbedDim: () => 4,
  clientEmbedModelId: () => CARD_EMBED_MODEL,
}));

const ocrState = vi.hoisted(() => ({
  /** Blob → text the engine reads off that band. */
  byBlob: new Map<Blob, string>(),
  reads: [] as string[],
}));

vi.mock("@/lib/client/scan/paddleCollectorOcr.client", () => ({
  prefetchPaddleCollectorOcrClient: vi.fn(async () => {}),
  recognizeCollectorOcrClient: vi.fn(async (image: Blob) => {
    const text = ocrState.byBlob.get(image);
    ocrState.reads.push(text ?? "<inconnu>");
    if (text === undefined) return null;
    return {
      text,
      words: [],
      band: { sx: 0, sy: 0, sw: 10, sh: 2 },
      sourceWidth: 10,
      sourceHeight: 14,
      engine: "ppocr-client" as const,
    };
  }),
}));

import {
  admitShardForTests,
  resetClientEmbeddingMemory,
  type ClientEmbeddingMeta,
} from "@/lib/client/scan/cardEmbeddingIndex.client";
import { encodeFloat16Matrix } from "@/lib/shared/float16";
import {
  identifyCardBlobClient,
  recognizeCollectorBandClient,
  resetClientIdentifyPackIds,
  shortlistManifest,
  type ClientPackManifest,
} from "@/lib/client/scan/clientIdentify";
import type { CollectorBandGrab } from "@/lib/client/scan/grabCollectorBand";

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
    embedState.upsideDown = null;
    embedState.reads = [];
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
    // One read is enough when the card is already the right way up.
    expect(embedState.reads).toEqual([false]);
  });
});

describe("identifyCardBlobClient — card presented the other way up", () => {
  beforeEach(() => {
    resetClientEmbeddingMemory();
    resetClientIdentifyPackIds();
    embedState.ready = true;
    embedState.upsideDown = null;
    embedState.reads = [];
    stubManifest([manifest("x", [1, 0, 0, 0]), manifest("y", [0, 1, 0, 0])]);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("recognises the card once the face is read half a turn round", async () => {
    await admitPack("x", [1, 0, 0, 0]);
    await admitPack("y", [0, 1, 0, 0]);
    // Nothing near either pack this way up; the flipped read lands on "x".
    embedState.query = unit([0, 0, 1, 0]);
    embedState.upsideDown = unit([1, 0, 0, 0]);
    const res = await identifyCardBlobClient(new Blob());
    expect(res?.confidence).not.toBe("miss");
    expect(res?.bestEmbedKey).toBe("x:a-1");
    expect(embedState.reads).toEqual([false, true]);
  });

  it("stays an honest miss when neither way up matches", async () => {
    await admitPack("x", [1, 0, 0, 0]);
    await admitPack("y", [0, 1, 0, 0]);
    embedState.query = unit([0, 0, 1, 0]);
    embedState.upsideDown = unit([0, 0, 0, 1]);
    const res = await identifyCardBlobClient(new Blob());
    expect(res?.confidence).toBe("miss");
    expect(embedState.reads).toEqual([false, true]);
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

/** A band grab whose blob the fake engine reads as `text`. */
function bandReading(text: string): CollectorBandGrab {
  const blob = new Blob([text]);
  ocrState.byBlob.set(blob, text);
  return {
    blob,
    band: { sx: 0, sy: 0, sw: 10, sh: 2 },
    sourceWidth: 10,
    sourceHeight: 14,
  };
}

describe("recognizeCollectorBandClient — which end carries the footer", () => {
  beforeEach(() => {
    ocrState.byBlob = new Map();
    ocrState.reads = [];
  });

  it("stops at the first band when it yields a collector number", async () => {
    const res = await recognizeCollectorBandClient(
      new Blob(),
      bandReading("66/204 · FR · 3"),
      bandReading("Disney Lorcana ©Disney"),
    );
    expect(res.text).toContain("66/204");
    expect(res.halfTurn).toBe(false);
    expect(ocrState.reads).toHaveLength(1);
  });

  it("reads the other end when the first yields no number", async () => {
    const res = await recognizeCollectorBandClient(
      new Blob(),
      bandReading("cYanmaG ntaYel"),
      bandReading("66/204 · FR · 3"),
    );
    expect(res.text).toContain("66/204");
    expect(res.halfTurn).toBe(true);
    expect(ocrState.reads).toHaveLength(2);
  });

  it("keeps the first read when neither end yields a number", async () => {
    const res = await recognizeCollectorBandClient(
      new Blob(),
      bandReading("Disney Lorcana"),
      bandReading("cYanmaG ntaYel"),
    );
    expect(res.text).toBe("Disney Lorcana");
    expect(res.halfTurn).toBe(false);
    // Footer both ways, then the nameplate on the face.
    expect(ocrState.reads).toHaveLength(3);
  });

  it("keeps the nameplate when neither footer has a number", async () => {
    const face = new Blob(["face"]);
    ocrState.byBlob.set(face, "Ariel Chanteuse Exceptionnelle");
    const res = await recognizeCollectorBandClient(
      face,
      bandReading("©Disney"),
      bandReading("cYanmaG ntaYel"),
    );
    expect(res.text).toContain("Ariel");
    expect(res.status).toBe("ok");
  });
});

describe("identifyCardBlobClient — the footer tells which way up the card is", () => {
  beforeEach(() => {
    resetClientEmbeddingMemory();
    resetClientIdentifyPackIds();
    embedState.ready = true;
    embedState.query = unit([0, 0, 1, 0]);
    embedState.upsideDown = unit([1, 0, 0, 0]);
    embedState.reads = [];
    stubManifest([manifest("x", [1, 0, 0, 0]), manifest("y", [0, 1, 0, 0])]);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("embeds the face the way the collector number was found, first try", async () => {
    await admitPack("x", [1, 0, 0, 0]);
    await admitPack("y", [0, 1, 0, 0]);
    const res = await identifyCardBlobClient(new Blob(), {
      ocr: {
        text: "66/204 · FR · 3",
        status: "ok",
        engine: "ppocr-client",
        words: [],
        sourceWidth: 10,
        sourceHeight: 14,
        halfTurn: true,
      },
    });
    expect(res?.bestEmbedKey).toBe("x:a-1");
    expect(embedState.reads).toEqual([true]);
  });
});
