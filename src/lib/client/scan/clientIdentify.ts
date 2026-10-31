/**
 * Full-client identify path: PP-OCR (native band) + on-device embed + f16 NN.
 * Falls back to null so the caller can POST fallback=1 to the server — the
 * OCR stage result is kept separately so its text still reaches the server.
 */
import { finalizeIdentifyConfidence } from "@/core/identify/identifyConfidence";
import { parseCollectorNumberHint } from "@/core/identify/collectorNumberHint";
import { assetsPackFileUrl } from "@/lib/packAssetUrls";
import {
  embedCardFaceBlobClient,
  prefetchCardEmbedClient,
} from "@/lib/client/scan/cardEmbed.client";
import {
  loadClientEmbeddingPack,
  matchClientEmbeddings,
  prefetchClientEmbeddingPacks,
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

let packIdsPromise: Promise<string[]> | null = null;

/**
 * Packs with published shards — asked once per session, soft-fail to none
 * (identify then falls back to the server route, never to a guess).
 */
export function resolveClientIdentifyPackIds(): Promise<string[]> {
  if (!packIdsPromise) {
    packIdsPromise = (async () => {
      try {
        const res = await fetch("/api/identify/packs", { cache: "no-store" });
        if (!res.ok) return [];
        const body = (await res.json()) as { packs?: unknown };
        return Array.isArray(body.packs)
          ? body.packs.filter((p): p is string => typeof p === "string")
          : [];
      } catch {
        return [];
      }
    })();
    // Let a later camera session retry after a transient failure.
    void packIdsPromise.then((ids) => {
      if (!ids.length) packIdsPromise = null;
    });
  }
  return packIdsPromise;
}

/** Tests: forget the cached pack list. */
export function resetClientIdentifyPackIds(): void {
  packIdsPromise = null;
}

/** Warm OCR + DINOv2 + pack shards (camera start). */
export async function prefetchClientIdentify(
  packIds: readonly string[] = [],
): Promise<void> {
  const jobs: Promise<unknown>[] = [
    prefetchPaddleCollectorOcrClient(),
    prefetchCardEmbedClient(),
    (async () => {
      const ids = packIds.length
        ? packIds
        : await resolveClientIdentifyPackIds();
      if (ids.length) await prefetchClientEmbeddingPacks(ids);
    })(),
  ];
  await Promise.all(jobs);
}

/**
 * Run on-device identify. Returns null when client stack can't complete
 * (missing models / shards) — caller should server-fallback automatically.
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
  const ocr = opts?.ocr ?? (await recognizeCollectorBandClient(blob));
  const ocrText = ocr.text;

  const packIds = opts?.packIds?.length
    ? opts.packIds
    : await resolveClientIdentifyPackIds();
  const packs: ClientLoadedPack[] = [];
  for (const id of packIds) {
    const pack = await loadClientEmbeddingPack(id);
    if (pack) packs.push(pack);
  }
  if (!packs.length) return null;

  const query = await embedCardFaceBlobClient(blob);
  if (!query) return null;

  const rawHits = matchClientEmbeddings(query, packs, {
    limit: 8,
    maxDistance: 450,
    ocrText,
  });
  const hint = parseCollectorNumberHint(ocrText);
  const finalized = finalizeIdentifyConfidence(
    rawHits.map((h) => ({
      printKey: h.printKey,
      distance: h.distance,
    })),
    "embed",
    { ocrReinforced: Boolean(hint) },
  );

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
