/**
 * On-device float16 embedding shards (IndexedDB) + NN shortlist.
 *
 * Packs served under `/assets/<pack>/card-embedding-index.f16` + `.json`.
 * Same topK / centroid logic as server `cardEmbeddingSearch`.
 */
import { cosineToDistance } from "@/core/identify/embedMath";
import {
  computePackCentroid,
  shortlistPacksByCentroid,
  topKMilliDistances,
} from "@/core/identify/cardEmbeddingSearch";
import type { CardEmbeddingIndexEntry } from "@/core/identify/cardEmbeddingIndex";
import {
  parseCollectorNumberHint,
  printKeyMatchesCollectorHint,
  type CollectorNumberHint,
} from "@/core/identify/collectorNumberHint";
import { decodeFloat16Matrix } from "@/lib/shared/float16";
import { assetsPackFileUrl } from "@/lib/packAssetUrls";
import {
  clientEmbedDim,
  clientEmbedModelId,
} from "@/lib/client/scan/cardEmbed.client";

export type ClientEmbeddingMeta = {
  version: 1;
  packId: string;
  model: string;
  dim: number;
  builtAt: string;
  entries: CardEmbeddingIndexEntry[];
  /** Optional L2 centroid (f32 JSON) for shortlist without decoding full matrix. */
  centroid?: number[];
};

export type ClientLoadedPack = {
  meta: ClientEmbeddingMeta;
  matrix: Float32Array;
  centroid: Float32Array;
};

const IDB_NAME = "placarr-embed-shards";
const IDB_STORE = "packs";
const IDB_VERSION = 1;

type IdbRecord = {
  packId: string;
  model: string;
  dim: number;
  builtAt: string;
  metaJson: string;
  matrixF16: ArrayBuffer;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE, { keyPath: "packId" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("idb open failed"));
  });
}

async function idbGet(packId: string): Promise<IdbRecord | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readonly");
    const req = tx.objectStore(IDB_STORE).get(packId);
    req.onsuccess = () => resolve((req.result as IdbRecord) ?? null);
    req.onerror = () => reject(req.error);
  });
}

async function idbPut(rec: IdbRecord): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).put(rec);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

const memory = new Map<string, ClientLoadedPack>();

function materialize(
  meta: ClientEmbeddingMeta,
  matrix: Float32Array,
): ClientLoadedPack {
  const rows = meta.entries.length;
  const centroid =
    meta.centroid && meta.centroid.length === meta.dim
      ? Float32Array.from(meta.centroid)
      : computePackCentroid(matrix, rows, meta.dim);
  return { meta, matrix, centroid };
}

async function fetchPackShard(
  packId: string,
): Promise<ClientLoadedPack | null> {
  const metaUrl = assetsPackFileUrl(packId, "card-embedding-index.json");
  const binUrl = assetsPackFileUrl(packId, "card-embedding-index.f16");
  try {
    const [metaRes, binRes] = await Promise.all([
      fetch(metaUrl, { cache: "force-cache" }),
      fetch(binUrl, { cache: "force-cache" }),
    ]);
    if (!metaRes.ok || !binRes.ok) return null;
    const meta = (await metaRes.json()) as ClientEmbeddingMeta;
    if (!meta?.entries?.length || !meta.dim) return null;
    const expectedModel = clientEmbedModelId();
    // Soft: allow legacy CLIP shards only when model matches what's loaded.
    if (meta.model && meta.model !== expectedModel) {
      console.warn(
        `[embed-index.client] model mismatch pack=${packId} index=${meta.model} client=${expectedModel}`,
      );
      return null;
    }
    const buf = await binRes.arrayBuffer();
    const matrix = decodeFloat16Matrix(buf, meta.entries.length * meta.dim);
    const packed = materialize(meta, matrix);
    await idbPut({
      packId,
      model: meta.model,
      dim: meta.dim,
      builtAt: meta.builtAt,
      metaJson: JSON.stringify(meta),
      matrixF16: buf.slice(0),
    });
    return packed;
  } catch (err) {
    console.warn("[embed-index.client] fetch failed", packId, err);
    return null;
  }
}

async function loadFromIdb(packId: string): Promise<ClientLoadedPack | null> {
  try {
    const rec = await idbGet(packId);
    if (!rec) return null;
    if (rec.model !== clientEmbedModelId()) return null;
    const meta = JSON.parse(rec.metaJson) as ClientEmbeddingMeta;
    const matrix = decodeFloat16Matrix(
      rec.matrixF16,
      meta.entries.length * meta.dim,
    );
    return materialize(meta, matrix);
  } catch {
    return null;
  }
}

/** Load one pack (memory → IDB → network). */
export async function loadClientEmbeddingPack(
  packId: string,
): Promise<ClientLoadedPack | null> {
  const hit = memory.get(packId);
  if (hit) return hit;
  const fromIdb = await loadFromIdb(packId);
  if (fromIdb) {
    memory.set(packId, fromIdb);
    return fromIdb;
  }
  const fetched = await fetchPackShard(packId);
  if (fetched) memory.set(packId, fetched);
  return fetched;
}

/** Prefetch enabled packs (camera start). Soft-fail per pack. */
export async function prefetchClientEmbeddingPacks(
  packIds: readonly string[],
): Promise<void> {
  await Promise.all(packIds.map((id) => loadClientEmbeddingPack(id)));
}

export type ClientEmbedHit = {
  printKey: string;
  lang: string;
  distance: number;
  artRel: string;
  packId: string;
  method: "embed";
};

function hitsFromPack(
  query: Float32Array,
  pack: ClientLoadedPack,
  limit: number,
  maxDistance: number,
): ClientEmbedHit[] {
  const rows = pack.meta.entries.length;
  const top = topKMilliDistances(query, pack.matrix, rows, {
    limit,
    maxDistance,
    dim: pack.meta.dim || clientEmbedDim(),
  });
  const out: ClientEmbedHit[] = [];
  for (const h of top) {
    const entry = pack.meta.entries.find((e) => e.row === h.row);
    if (!entry) continue;
    out.push({
      printKey: entry.printKey,
      lang: entry.lang,
      distance: h.distance,
      artRel: entry.artRel,
      packId: pack.meta.packId,
      method: "embed",
    });
  }
  return out;
}

/**
 * NN across loaded packs (centroid shortlist when ≥2 packs).
 */
export function matchClientEmbeddings(
  query: Float32Array,
  packs: readonly ClientLoadedPack[],
  opts?: {
    limit?: number;
    maxDistance?: number;
    ocrText?: string | null;
  },
): ClientEmbedHit[] {
  const limit = opts?.limit ?? 5;
  const maxDistance = opts?.maxDistance ?? 320;
  if (!packs.length) return [];

  let active = [...packs];
  if (packs.length > 1) {
    const centroids = packs.map((p) => ({
      packId: p.meta.packId,
      centroid: p.centroid,
    }));
    const short = shortlistPacksByCentroid(query, centroids, {
      minPacks: Math.min(4, packs.length),
      margin: 140,
    });
    if (short.length) {
      const allow = new Set(short.map((s) => s.packId));
      active = packs.filter((p) => allow.has(p.meta.packId));
    }
  }

  let hits: ClientEmbedHit[] = [];
  for (const pack of active) {
    hits.push(...hitsFromPack(query, pack, limit * 2, maxDistance));
  }
  hits.sort((a, b) => a.distance - b.distance);
  hits = dedupePrintKey(hits).slice(0, limit);

  const hint = opts?.ocrText ? parseCollectorNumberHint(opts.ocrText) : null;
  if (hint && (!hits.length || shouldBreakGlass(hits, hint))) {
    const ocrHits = matchByCollectorHint(query, packs, hint, {
      limit,
      maxDistance,
    });
    if (ocrHits.length) {
      hits = dedupePrintKey([...ocrHits, ...hits]).slice(0, limit);
    }
  }
  return hits;
}

function shouldBreakGlass(
  hits: ClientEmbedHit[],
  hint: CollectorNumberHint,
): boolean {
  if (!hits.length) return true;
  const top = hits[0]!;
  return !printKeyMatchesCollectorHint(top.printKey, hint, undefined, {
    requireSet: Boolean(hint.set),
  });
}

function matchByCollectorHint(
  query: Float32Array,
  packs: readonly ClientLoadedPack[],
  hint: CollectorNumberHint,
  opts: { limit: number; maxDistance: number },
): ClientEmbedHit[] {
  const requireSet = Boolean(hint.set);
  const scored: ClientEmbedHit[] = [];
  for (const pack of packs) {
    const dim = pack.meta.dim || clientEmbedDim();
    for (const entry of pack.meta.entries) {
      if (
        !printKeyMatchesCollectorHint(entry.printKey, hint, entry.card, {
          requireSet,
        })
      ) {
        continue;
      }
      const start = entry.row * pack.meta.dim;
      let dot = 0;
      for (let d = 0; d < dim; d++) {
        dot += query[d]! * pack.matrix[start + d]!;
      }
      const distance = cosineToDistance(dot);
      if (distance > opts.maxDistance) continue;
      scored.push({
        printKey: entry.printKey,
        lang: entry.lang,
        distance,
        artRel: entry.artRel,
        packId: pack.meta.packId,
        method: "embed",
      });
    }
  }
  scored.sort((a, b) => a.distance - b.distance);
  return dedupePrintKey(scored).slice(0, opts.limit);
}

function dedupePrintKey(hits: ClientEmbedHit[]): ClientEmbedHit[] {
  const seen = new Set<string>();
  const out: ClientEmbedHit[] = [];
  for (const h of hits) {
    if (seen.has(h.printKey)) continue;
    seen.add(h.printKey);
    out.push(h);
  }
  return out;
}

/** Clear memory cache (tests). */
export function resetClientEmbeddingMemory(): void {
  memory.clear();
}
