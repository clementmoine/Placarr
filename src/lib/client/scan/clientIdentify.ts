/**
 * Full-client identify path: PP-OCR (native band) + on-device embed + f16 NN.
 * Falls back to null so the caller can POST fallback=1 to the server — the
 * OCR stage result is kept separately so its text still reaches the server.
 */
import { shortlistPacksByCentroid } from "@/core/identify/cardEmbeddingSearch";
import { finalizeIdentifyConfidence } from "@/core/identify/identifyConfidence";
import { parseCollectorNumberHint } from "@/core/identify/collectorNumberHint";
import { assetsPackFileUrl } from "@/lib/packAssetUrls";
import {
  embedCardFaceBlobClient,
  isCardEmbedClientReady,
  prefetchCardEmbedClient,
} from "@/lib/client/scan/cardEmbed.client";
import {
  getResidentPack,
  matchClientEmbeddings,
  prefetchClientEmbeddingPacks,
  prioritizePack,
  promotePacksHot,
  type ClientEmbedHit,
  type ClientLoadedPack,
} from "@/lib/client/scan/cardEmbeddingIndex.client";
import type { CollectorBandGrab } from "@/lib/client/scan/grabCollectorBand";
import {
  prefetchPaddleCollectorOcrClient,
  recognizeCollectorOcrClient,
} from "@/lib/client/scan/paddleCollectorOcr.client";

/** OCR stage output — produced once per sample, consumed by client identify
 *  and forwarded (`ocrText`) to the server fallback. */
export type ClientOcrOutcome = {
  text: string;
  status: "ok" | "empty" | "unavailable";
  engine: "ppocr-client" | "none";
  words: ClientIdentifyResult["ocrWords"];
  sourceWidth: number | null;
  sourceHeight: number | null;
};

const NO_OCR: ClientOcrOutcome = {
  text: "",
  status: "unavailable",
  engine: "none",
  words: [],
  sourceWidth: null,
  sourceHeight: null,
};

/**
 * OCR the collector footer. Prefers the native-resolution band cut from the
 * camera (`band`); falls back to cropping the identify thumbnail.
 */
export async function recognizeCollectorBandClient(
  face: Blob,
  band?: CollectorBandGrab | null,
): Promise<ClientOcrOutcome> {
  const ocr = band
    ? await recognizeCollectorOcrClient(band.blob, {
        preCropped: {
          band: band.band,
          sourceWidth: band.sourceWidth,
          sourceHeight: band.sourceHeight,
        },
      })
    : await recognizeCollectorOcrClient(face);
  if (!ocr) return NO_OCR;
  return {
    text: ocr.text,
    status: ocr.text ? "ok" : "empty",
    engine: "ppocr-client",
    words: ocr.words.map((w) => ({
      text: w.text,
      x: w.x,
      y: w.y,
      width: w.width,
      height: w.height,
    })),
    sourceWidth: ocr.sourceWidth,
    sourceHeight: ocr.sourceHeight,
  };
}

export type ClientIdentifyMatch = {
  printKey: string;
  lang: string;
  distance: number;
  faceUrl: string | null;
  packId?: string;
  artRel?: string;
  ambiguous?: boolean;
  method: "embed";
  confidence?: "sure" | "doubt" | "miss";
};

export type ClientIdentifyResult = {
  matches: ClientIdentifyMatch[];
  confidence: "sure" | "doubt" | "miss";
  ocrText: string;
  ocrStatus: string;
  ocrEngine: "ppocr-client" | "none";
  ocrWords: Array<{
    text: string;
    x: number;
    y: number;
    width: number;
    height: number;
  }>;
  ocrSourceWidth: number | null;
  ocrSourceHeight: number | null;
  bestEmbedDistance: number | null;
  bestEmbedKey: string | null;
  path: "client";
};

function withFaceUrl(hit: ClientEmbedHit): ClientIdentifyMatch {
  const faceUrl =
    hit.packId && hit.artRel
      ? assetsPackFileUrl(
          hit.packId,
          ...hit.artRel.split(/[/\\]/).filter(Boolean),
        )
      : null;
  return {
    printKey: hit.printKey,
    lang: hit.lang,
    distance: hit.distance,
    faceUrl,
    packId: hit.packId,
    artRel: hit.artRel,
    method: "embed",
  };
}

export type ClientPackManifest = {
  packId: string;
  entries: number;
  dim: number;
  builtAt: string;
  bytesF16: number;
  centroid: Float32Array;
};

let manifestPromise: Promise<ClientPackManifest[]> | null = null;

function parseManifest(body: unknown): ClientPackManifest[] {
  const raw = (body as { packs?: unknown })?.packs;
  if (!Array.isArray(raw)) return [];
  const out: ClientPackManifest[] = [];
  for (const p of raw) {
    if (!p || typeof p !== "object") continue;
    const m = p as Partial<Record<keyof ClientPackManifest, unknown>>;
    if (typeof m.packId !== "string" || !Array.isArray(m.centroid)) continue;
    out.push({
      packId: m.packId,
      entries: typeof m.entries === "number" ? m.entries : 0,
      dim: typeof m.dim === "number" ? m.dim : m.centroid.length,
      builtAt: typeof m.builtAt === "string" ? m.builtAt : "",
      bytesF16: typeof m.bytesF16 === "number" ? m.bytesF16 : 0,
      centroid: Float32Array.from(m.centroid as number[]),
    });
  }
  return out;
}

/**
 * Pack manifest (size + centroid per pack, cheapest first) — asked once per
 * session, soft-fail to none (identify then falls back to the server route,
 * never to a guess).
 */
export function resolveClientIdentifyPacks(): Promise<ClientPackManifest[]> {
  if (!manifestPromise) {
    manifestPromise = (async () => {
      try {
        const res = await fetch("/api/identify/packs", { cache: "no-store" });
        if (!res.ok) return [];
        return parseManifest(await res.json());
      } catch {
        return [];
      }
    })();
    // Let a later camera session retry after a transient failure.
    void manifestPromise.then((packs) => {
      if (!packs.length) manifestPromise = null;
    });
  }
  return manifestPromise;
}

/** Pack ids with shards (manifest order). */
export async function resolveClientIdentifyPackIds(): Promise<string[]> {
  return (await resolveClientIdentifyPacks()).map((p) => p.packId);
}

/** Tests: forget the cached manifest. */
export function resetClientIdentifyPackIds(): void {
  manifestPromise = null;
}

/**
 * Warm the engines (camera start). Resolves when OCR + DINOv2 are built;
 * shards then stream in the background, cheapest first, and the centroid
 * shortlist pulls any pack a query needs ahead of the queue.
 */
export async function prefetchClientIdentify(
  packIds: readonly string[] = [],
): Promise<void> {
  const shards = (async () => {
    const ids = packIds.length
      ? [...packIds]
      : await resolveClientIdentifyPackIds();
    if (ids.length) void prefetchClientEmbeddingPacks(ids);
  })();
  await Promise.all([
    prefetchPaddleCollectorOcrClient(),
    prefetchCardEmbedClient(),
    shards,
  ]);
}

/** Centroid shortlist over the manifest: which packs this query needs. */
export function shortlistManifest(
  query: Float32Array,
  manifest: readonly ClientPackManifest[],
): ClientPackManifest[] {
  return shortlistPacksByCentroid(query, manifest, {
    minPacks: Math.min(4, manifest.length),
    margin: 200,
  });
}

type MatchAttempt = {
  rawHits: ClientEmbedHit[];
  finalized: ReturnType<typeof finalizeIdentifyConfidence>;
};

/**
 * Shortlist the packs this query lands near, match inside them and score the
 * confidence. Null means the client cannot answer right now (a shard it needs
 * is not resident yet) — never a partial-coverage answer.
 */
async function matchQuery(
  query: Float32Array,
  scope: readonly ClientPackManifest[],
  ocrText: string,
): Promise<MatchAttempt | null> {
  const wanted = shortlistManifest(query, scope);
  const packs: ClientLoadedPack[] = [];
  let missing = 0;
  for (const m of wanted) {
    const resident = getResidentPack(m.packId);
    if (resident) packs.push(resident);
    else {
      missing += 1;
      prioritizePack(m.packId);
    }
  }
  if (missing || !packs.length) return null;

  const rawHits = matchClientEmbeddings(query, packs, {
    limit: 8,
    maxDistance: 450,
    ocrText,
  });
  // The packs this card lives near get a hot f32 copy for the next frame.
  promotePacksHot(packs.map((p) => p.meta.packId));
  const hint = parseCollectorNumberHint(ocrText);
  const finalized = finalizeIdentifyConfidence(
    rawHits.map((h) => ({ printKey: h.printKey, distance: h.distance })),
    "embed",
    { ocrReinforced: Boolean(hint) },
  );
  return { rawHits, finalized };
}

/**
 * Run on-device identify. Returns null whenever the client stack cannot
 * answer *right now* — model still loading, a shortlisted shard not yet
 * resident — so the caller falls back to the server for this sample instead
 * of waiting. Never a partial-coverage guess.
 */
export async function identifyCardBlobClient(
  blob: Blob,
  opts?: {
    packIds?: string[];
    lang?: string | null;
    /** Precomputed OCR stage (native band). Omit to OCR the thumbnail. */
    ocr?: ClientOcrOutcome | null;
  },
): Promise<ClientIdentifyResult | null> {
  if (!isCardEmbedClientReady()) {
    void prefetchCardEmbedClient();
    return null;
  }
  const manifest = await resolveClientIdentifyPacks();
  const scope = opts?.packIds?.length
    ? manifest.filter((m) => opts.packIds!.includes(m.packId))
    : manifest;
  if (!scope.length) return null;

  const ocr = opts?.ocr ?? (await recognizeCollectorBandClient(blob));
  const ocrText = ocr.text;

  const query = await embedCardFaceBlobClient(blob);
  if (!query) return null;

  let attempt = await matchQuery(query, scope, ocrText);
  if (!attempt) return null;
  if (attempt.finalized.confidence === "miss") {
    // Nothing recognised this way up. A card lying on its side (Lorcana
    // locations, split cards) shows the user no "up", so the face may be
    // rectified half a turn from the catalogue scan — read it once more
    // upside down before giving up. Same gate, so still no lucky guess.
    const flipped = await embedCardFaceBlobClient(blob, { upsideDown: true });
    const alt = flipped ? await matchQuery(flipped, scope, ocrText) : null;
    if (alt && alt.finalized.confidence !== "miss") attempt = alt;
  }
  const { rawHits, finalized } = attempt;

  const matches = finalized.matches
    .map((m) => {
      const hit = rawHits.find((h) => h.printKey === m.printKey);
      if (!hit) return null;
      const ambiguous =
        "ambiguous" in m
          ? Boolean((m as { ambiguous?: boolean }).ambiguous)
          : false;
      return {
        ...withFaceUrl(hit),
        ambiguous: ambiguous || undefined,
        confidence: finalized.confidence,
      };
    })
    .filter(Boolean) as ClientIdentifyMatch[];

  return {
    matches,
    confidence: finalized.confidence,
    ocrText,
    ocrStatus: ocr.status,
    ocrEngine: ocr.engine,
    ocrWords: ocr.words,
    ocrSourceWidth: ocr.sourceWidth,
    ocrSourceHeight: ocr.sourceHeight,
    bestEmbedDistance: rawHits[0]?.distance ?? null,
    bestEmbedKey: rawHits[0]?.printKey ?? null,
    path: "client",
  };
}
