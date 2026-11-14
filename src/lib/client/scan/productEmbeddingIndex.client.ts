/**
 * On-device sealed product embedding shards (full-frame DINOv2).
 * Separate IDB from card shards — same packId can publish both.
 */
import {
  computePackCentroid,
  shortlistPacksByCentroid,
  topKMilliDistances,
  type EmbeddingMatrix,
} from "@/core/identify/cardEmbeddingSearch";
import {
  expandProductEmbeddingEntries,
  type ProductEmbeddingIndexEntry,
  type ProductEmbeddingIndexEntryWire,
} from "@/core/identify/productEmbeddingEntry";
import { decodeFloat16MatrixChunked, float16View } from "@/lib/shared/float16";
import {
  assetsPackFileUrl,
  PRODUCT_EMBED_SHARD_FILES,
} from "@/lib/packAssetUrls";
import {
  clientEmbedDim,
  clientEmbedModelId,
} from "@/lib/client/scan/cardEmbed.client";

export type ClientProductMeta = {
  version: 1;
  packId: string;
  model: string;
  dim: number;
  builtAt: string;
  cropMode?: "full";
  entries: ProductEmbeddingIndexEntry[];
  centroid?: number[];
};

export type ClientLoadedProductPack = {
  meta: ClientProductMeta;
  matrix: EmbeddingMatrix;
  centroid: Float32Array;
};

export type ClientProductHit = {
  productKey: string;
  lang: string;
  slug: string;
  distance: number;
  artRel: string;
  packId: string;
  method: "embed";
};

const IDB_NAME = "placarr-product-embed-shards";
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

function parseMeta(raw: unknown): ClientProductMeta | null {
  if (!raw || typeof raw !== "object") return null;
  const m = raw as Partial<ClientProductMeta> & {
    entries?: (ProductEmbeddingIndexEntry | ProductEmbeddingIndexEntryWire)[];
  };
  if (!m.entries?.length || !m.dim) return null;
  const entries = expandProductEmbeddingEntries(m.entries);
  if (!entries.length) return null;
  return {
    version: 1,
    packId: typeof m.packId === "string" ? m.packId : "",
    model: typeof m.model === "string" ? m.model : "",
    dim: m.dim,
    builtAt: typeof m.builtAt === "string" ? m.builtAt : "",
    cropMode: "full",
    entries,
    ...(Array.isArray(m.centroid) ? { centroid: m.centroid } : {}),
  };
}

async function materialize(
  meta: ClientProductMeta,
  buf: ArrayBuffer,
): Promise<ClientLoadedProductPack> {
  const half = float16View(buf);
  const matrix: EmbeddingMatrix = half
    ? half
    : await decodeFloat16MatrixChunked(new Uint16Array(buf));
  const centroid = meta.centroid?.length
    ? Float32Array.from(meta.centroid)
    : computePackCentroid(matrix, meta.entries.length, meta.dim);
  return { meta, matrix, centroid };
}

const memory = new Map<string, ClientLoadedProductPack>();
const inflight = new Map<string, Promise<ClientLoadedProductPack | null>>();
const queue: string[] = [];
let pumping = false;

export function getResidentProductPack(
  packId: string,
): ClientLoadedProductPack | null {
  return memory.get(packId) ?? null;
}

export function residentProductPackIds(): string[] {
  return [...memory.keys()];
}

export function resetClientProductEmbeddingMemory(): void {
  memory.clear();
  inflight.clear();
  queue.length = 0;
}

/** Tests: inject a resident product shard. */
export function admitProductShardForTests(
  meta: ClientProductMeta,
  matrix: Float32Array,
): ClientLoadedProductPack {
  const pack: ClientLoadedProductPack = {
    meta,
    matrix,
    centroid: computePackCentroid(matrix, meta.entries.length, meta.dim),
  };
  memory.set(meta.packId, pack);
  return pack;
}

const LOW_PRIORITY = { priority: "low" } as RequestInit;

async function fetchPack(packId: string): Promise<ClientLoadedProductPack | null> {
  try {
    const metaRes = await fetch(
      assetsPackFileUrl(packId, PRODUCT_EMBED_SHARD_FILES.meta),
      { cache: "no-cache", ...LOW_PRIORITY },
    );
    if (!metaRes.ok) return null;
    const meta = parseMeta(await metaRes.json());
    if (!meta) return null;
    if (meta.model && meta.model !== clientEmbedModelId()) return null;
    const binRes = await fetch(
      assetsPackFileUrl(packId, PRODUCT_EMBED_SHARD_FILES.f16),
      { cache: "no-cache", ...LOW_PRIORITY },
    );
    if (!binRes.ok) return null;
    const buf = await binRes.arrayBuffer();
    await idbPut({
      packId,
      model: meta.model,
      dim: meta.dim,
      builtAt: meta.builtAt,
      metaJson: JSON.stringify(meta),
      matrixF16: buf,
    });
    return materialize(meta, buf);
  } catch (err) {
    console.warn("[product-embed.client] fetch failed", packId, err);
    return null;
  }
}

export function ensureProductPackResident(
  packId: string,
): Promise<ClientLoadedProductPack | null> {
  const hit = getResidentProductPack(packId);
  if (hit) return Promise.resolve(hit);
  const pending = inflight.get(packId);
  if (pending) return pending;
  const job = (async () => {
    try {
      const rec = await idbGet(packId).catch(() => null);
      if (rec && rec.model === clientEmbedModelId()) {
        const meta = parseMeta(JSON.parse(rec.metaJson));
        if (meta) {
          const pack = await materialize(meta, rec.matrixF16);
          memory.set(packId, pack);
          return pack;
        }
      }
      const fetched = await fetchPack(packId);
      if (!fetched) return null;
      memory.set(packId, fetched);
      return fetched;
    } catch {
      return null;
    } finally {
      inflight.delete(packId);
    }
  })();
  inflight.set(packId, job);
  return job;
}

async function pump(): Promise<void> {
  if (pumping) return;
  pumping = true;
  try {
    while (queue.length) {
      const next = queue.shift()!;
      if (getResidentProductPack(next)) continue;
      await ensureProductPackResident(next);
    }
  } finally {
    pumping = false;
  }
}

export function prefetchClientProductEmbeddingPacks(
  packIds: readonly string[],
): Promise<void> {
  for (const id of packIds) {
    if (!queue.includes(id) && !getResidentProductPack(id)) queue.push(id);
  }
  return pump();
}

export function prioritizeProductPack(packId: string): void {
  const at = queue.indexOf(packId);
  if (at >= 0) queue.splice(at, 1);
  if (getResidentProductPack(packId) || inflight.has(packId)) return;
  void ensureProductPackResident(packId);
}

function dedupeProductKey(hits: ClientProductHit[]): ClientProductHit[] {
  const best = new Map<string, ClientProductHit>();
  for (const hit of hits) {
    const prev = best.get(hit.productKey);
    if (!prev || hit.distance < prev.distance) best.set(hit.productKey, hit);
  }
  return [...best.values()].sort((a, b) => a.distance - b.distance);
}

function hitsFromPack(
  query: Float32Array,
  pack: ClientLoadedProductPack,
  limit: number,
  maxDistance: number,
): ClientProductHit[] {
  const rows = pack.meta.entries.length;
  const top = topKMilliDistances(query, pack.matrix, rows, {
    limit,
    maxDistance,
    dim: pack.meta.dim || clientEmbedDim(),
  });
  const out: ClientProductHit[] = [];
  for (const h of top) {
    const entry =
      pack.meta.entries.find((e) => e.row === h.row) ??
      pack.meta.entries[h.row];
    if (!entry) continue;
    out.push({
      productKey: entry.productKey,
      lang: entry.lang,
      slug: entry.slug,
      distance: h.distance,
      artRel: entry.artRel,
      packId: pack.meta.packId,
      method: "embed",
    });
  }
  return out;
}

export function matchClientProductEmbeddings(
  query: Float32Array,
  packs: readonly ClientLoadedProductPack[],
  opts?: { limit?: number; maxDistance?: number },
): ClientProductHit[] {
  const limit = opts?.limit ?? 5;
  const maxDistance = opts?.maxDistance ?? 450;
  if (!packs.length) return [];

  let active = [...packs];
  if (packs.length > 1) {
    const short = shortlistPacksByCentroid(
      query,
      packs.map((p) => ({ packId: p.meta.packId, centroid: p.centroid })),
      { minPacks: Math.min(4, packs.length), margin: 140 },
    );
    if (short.length) {
      const allow = new Set(short.map((s) => s.packId));
      active = packs.filter((p) => allow.has(p.meta.packId));
    }
  }

  const hits: ClientProductHit[] = [];
  for (const pack of active) {
    hits.push(...hitsFromPack(query, pack, limit * 2, maxDistance));
  }
  return dedupeProductKey(hits).slice(0, limit);
}
