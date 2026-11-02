/**
 * Full-client identify path: PP-OCR (native band) + on-device embed + f16 NN.
 * Falls back to null so the caller can POST fallback=1 to the server — the
 * OCR stage result is kept separately so its text still reaches the server.
 */
import { shortlistPacksByCentroid } from "@/core/identify/cardEmbeddingSearch";
import { finalizeIdentifyConfidence } from "@/core/identify/identifyConfidence";
import { parseCollectorNumberHint } from "@/core/identify/collectorNumberHint";
import { identifyMatchFaceUrl } from "@/lib/packAssetUrls";
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
  residentPackIds,
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
  /**
   * The collector line was found at the *other* end of the card: it is lying
   * on its side the other way, or pushed under the lens upside down. The
   * embed then starts from the face turned the same way round.
   */
  halfTurn: boolean;
};

const NO_OCR: ClientOcrOutcome = {
  text: "",
  status: "unavailable",
  engine: "none",
  words: [],
  sourceWidth: null,
  sourceHeight: null,
  halfTurn: false,
};

async function readBand(
  face: Blob,
  band: CollectorBandGrab | null | undefined,
  halfTurn: boolean,
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
    halfTurn,
  };
}

/**
 * OCR the collector footer. Prefers the native-resolution band cut from the
 * camera (`band`); falls back to cropping the identify thumbnail.
 *
 * `bandHalfTurn` is the same footer taken from the other end of the card.
 * The engine reads one way up only — no orientation model — and a card lying
 * on its side or pushed under the lens upside down puts its collector line at
 * the other end. Read there too when the first band yields no number, and
 * keep the read that produced one: the number itself arbitrates, nothing is
 * assumed about how the card was laid down.
 */
export async function recognizeCollectorBandClient(
  face: Blob,
  band?: CollectorBandGrab | null,
  bandHalfTurn?: CollectorBandGrab | null,
): Promise<ClientOcrOutcome> {
  const first = await readBand(face, band, false);
  let best = first;
  if (bandHalfTurn && !parseCollectorNumberHint(first.text)) {
    const second = await readBand(face, bandHalfTurn, true);
    if (parseCollectorNumberHint(second.text)) best = second;
  }
  if (parseCollectorNumberHint(best.text)) return best;

  // No footer number — read the nameplate. Title/description is a clue
  // (unique verso, objects without a collector line), never a sure alone.
  const title = await recognizeCollectorOcrClient(face, { role: "title" });
  if (!title?.text) return best;
  return {
    text: [title.text, best.text].filter(Boolean).join(" ").trim(),
    status: "ok",
    engine: "ppocr-client",
    words: [
      ...title.words.map((w) => ({
        text: w.text,
        x: w.x,
        y: w.y,
        width: w.width,
        height: w.height,
      })),
      ...best.words,
    ],
    sourceWidth: best.sourceWidth ?? title.sourceWidth,
    sourceHeight: best.sourceHeight ?? title.sourceHeight,
    halfTurn: best.halfTurn,
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
  // Display only. The indexed file — a `/prints/…/thumb` rebuilt from the
  // key misses every set code that itself contains a hyphen.
  const faceUrl = hit.packId
    ? identifyMatchFaceUrl({
        pack: hit.packId,
        artRel: hit.artRel,
        printKey: hit.printKey,
        lang: hit.lang,
      })
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

function finalizeHits(
  rawHits: ClientEmbedHit[],
  ocrText: string,
): MatchAttempt {
  const hint = parseCollectorNumberHint(ocrText);
  const finalized = finalizeIdentifyConfidence(
    rawHits.map((h) => ({ printKey: h.printKey, distance: h.distance })),
    "embed",
    { ocrReinforced: Boolean(hint) },
  );
  return { rawHits, finalized };
}

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
  return finalizeHits(rawHits, ocrText);
}

/**
 * Rematch against every resident pack in scope. The centroid shortlist is
 * cheap but can drop a small pack (Ninja Ranks, 281 faces) whose centroid
 * sits far from a glare-heavy phone frame — then every orientation "misses"
 * inside the wrong games. Same distance gate, just more shelves.
 */
function matchAllResidentInScope(
  query: Float32Array,
  scope: readonly ClientPackManifest[],
  ocrText: string,
): MatchAttempt | null {
  const allowed = new Set(scope.map((m) => m.packId));
  const packs: ClientLoadedPack[] = [];
  for (const id of residentPackIds()) {
    if (!allowed.has(id)) continue;
    const pack = getResidentPack(id);
    if (pack) packs.push(pack);
  }
  if (!packs.length) return null;
  const rawHits = matchClientEmbeddings(query, packs, {
    limit: 8,
    maxDistance: 450,
    ocrText,
  });
  promotePacksHot(packs.map((p) => p.meta.packId));
  return finalizeHits(rawHits, ocrText);
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

  // OCR half-turn tells us which end held the collector line; start there so
  // a card pushed in upside down does not pay an extra embed on the hot path.
  const startTurn = ocr.halfTurn ? 2 : 0;
  const query = await embedCardFaceBlobClient(blob, {
    quarterTurns: startTurn,
  });
  if (!query) return null;

  let attempt = await matchQuery(query, scope, ocrText);
  if (!attempt) return null;
  let bestQuery = query;
  if (attempt.finalized.confidence === "miss") {
    // Camera-native face can still be a quarter-turn off the catalogue scan:
    // a 63:88 card on its side, or a landscape print held the other way.
    // Try the three remaining orientations before an honest miss — never a
    // looser distance gate.
    for (const turn of [1, 2, 3]) {
      const quarterTurns = (startTurn + turn) % 4;
      const rotated = await embedCardFaceBlobClient(blob, { quarterTurns });
      const alt = rotated ? await matchQuery(rotated, scope, ocrText) : null;
      if (alt && alt.finalized.confidence !== "miss") {
        attempt = alt;
        if (rotated) bestQuery = rotated;
        break;
      }
    }
  }
  if (attempt.finalized.confidence === "miss") {
    const wide = matchAllResidentInScope(bestQuery, scope, ocrText);
    if (wide && wide.finalized.confidence !== "miss") attempt = wide;
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
