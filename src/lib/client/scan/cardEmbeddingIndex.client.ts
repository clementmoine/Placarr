/**
 * On-device float16 embedding shards (IndexedDB) + NN shortlist.
 *
 * Packs served under `/assets/<pack>/card-embedding-index.f16` + `.json`.
 * Same topK / centroid logic as server `cardEmbeddingSearch`.
 *
 * Residency: every pack stays in RAM as its f16 shard (zero-copy native
 * `Float16Array` view — ~half the catalogue's f32 size, nothing to decode
 * at load). Packs a query actually scans are then promoted to a bounded
 * LRU of hot f32 copies (`HOT_F32_BUDGET_BYTES`), which read ~6× faster;
 * matching works on either, so identify never waits for memory. A pack
 * becomes resident when the background queue reaches it (cheapest first)
 * or when a query's centroid shortlist asks for it (`prioritizePack`).
 * Nothing here blocks the camera: promotion decodes in yielding chunks,
 * downloads are sequential and low priority, and identify only reads what
 * is already resident (`getResidentPack`).
 *
 * Freshness: an IndexedDB hit is served immediately, then revalidated once
 * per session with a conditional GET on the meta (`If-None-Match`). A 304
 * costs a few hundred bytes; a 200 means Sync published new vectors and the
 * shard is swapped in place.
 */
import { cosineToDistance } from "@/core/identify/embedMath";
import {
  computePackCentroid,
  shortlistPacksByCentroid,
  topKMilliDistances,
  type EmbeddingMatrix,
} from "@/core/identify/cardEmbeddingSearch";
import type { CardEmbeddingIndexEntry } from "@/core/identify/cardEmbeddingIndex";
import {
  parseCollectorNumberHint,
  printKeyMatchesCollectorHint,
  type CollectorNumberHint,
} from "@/core/identify/collectorNumberHint";
import { decodeFloat16MatrixChunked, float16View } from "@/lib/shared/float16";
import { assetsPackFileUrl, CARD_EMBED_SHARD_FILES } from "@/lib/packAssetUrls";
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
  /** What matching reads: hot f32 once promoted, else the resident f16 view. */
  matrix: EmbeddingMatrix;
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
  /** ETag of the meta JSON when fetched — validator for revalidation. */
  etag?: string;
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

/**
 * Hot f32 copies kept beside the f16 residents. 128 MB holds the largest
 * shard (Yu-Gi-Oh ≈ 112 MB f32) or several mid-size packs; the least
 * recently used hot pack is demoted back to its f16 view when a newcomer
 * needs room. A pack whose f32 copy alone exceeds the budget is simply
 * scanned as f16 — slower, never missing.
 */
export const HOT_F32_BUDGET_BYTES = 128 * 1024 * 1024;
let hotBudget = HOT_F32_BUDGET_BYTES;

type Resident = {
  pack: ClientLoadedPack;
  /** f16 view for demotion; null → no Float16Array, f32 only, never demoted. */
  half: Float16Array | null;
  /** Bytes of the hot f32 copy (0 while reading f16). */
  hotBytes: number;
  lastUsed: number;
};
const memory = new Map<string, Resident>();
let clock = 0;

function admit(pack: ClientLoadedPack, half: Float16Array | null): void {
  memory.set(pack.meta.packId, {
    pack,
    half,
    hotBytes: half ? 0 : pack.matrix.byteLength,
    lastUsed: ++clock,
  });
}

/** Resident pack (sync) — the only read path identify is allowed to use. */
export function getResidentPack(packId: string): ClientLoadedPack | null {
  const r = memory.get(packId);
  if (!r) return null;
  r.lastUsed = ++clock;
  return r.pack;
}

export function residentPackIds(): string[] {
  return [...memory.keys()];
}

/** True when the pack is being matched from its f32 copy. */
export function isPackHot(packId: string): boolean {
  const r = memory.get(packId);
  return Boolean(r && r.hotBytes > 0);
}

function hotBytesUsed(): number {
  let used = 0;
  for (const r of memory.values()) used += r.hotBytes;
  return used;
}

function demote(r: Resident): void {
  if (!r.half) return;
  r.pack.matrix = r.half;
  r.hotBytes = 0;
}

const promoting = new Set<string>();

/**
 * Decode a resident pack to f32 (yielding) so its next scan is fast,
 * evicting least recently used hot packs to stay under budget. Called after
 * a query scanned the pack — never on the identify critical path.
 */
export async function promotePackHot(packId: string): Promise<void> {
  const r = memory.get(packId);
  if (!r || !r.half || r.hotBytes > 0 || promoting.has(packId)) return;
  const bytes = r.half.length * 4;
  if (bytes > hotBudget) return;
  promoting.add(packId);
  try {
    while (hotBytesUsed() + bytes > hotBudget) {
      let victim: Resident | null = null;
      for (const cand of memory.values()) {
        if (cand.hotBytes > 0 && cand.half && cand !== r) {
          if (!victim || cand.lastUsed < victim.lastUsed) victim = cand;
        }
      }
      if (!victim) break;
      demote(victim);
    }
    const f32 = await decodeFloat16MatrixChunked(r.half, r.half.length);
    // The pack may have been swapped (revalidation) while decoding.
    if (memory.get(packId) !== r) return;
    r.pack.matrix = f32;
    r.hotBytes = bytes;
  } catch {
    /* stay on f16 */
  } finally {
    promoting.delete(packId);
  }
}

/** Fire-and-forget promotion for the packs a query just scanned. */
export function promotePacksHot(packIds: readonly string[]): void {
  for (const id of packIds) void promotePackHot(id);
}

/**
 * Resident pack from a raw f16 shard: a zero-copy half view where the
 * browser has `Float16Array`, otherwise a one-off f32 decode.
 */
async function materialize(
  meta: ClientEmbeddingMeta,
  f16: ArrayBuffer,
): Promise<{ pack: ClientLoadedPack; half: Float16Array | null }> {
  const rows = meta.entries.length;
  const half = float16View(f16, rows * meta.dim);
  const matrix: EmbeddingMatrix =
    half ?? (await decodeFloat16MatrixChunked(f16, rows * meta.dim));
  const centroid =
    meta.centroid && meta.centroid.length === meta.dim
      ? Float32Array.from(meta.centroid)
      : computePackCentroid(matrix, rows, meta.dim);
  return { pack: { meta, matrix, centroid }, half };
}

function admitMaterialized(m: {
  pack: ClientLoadedPack;
  half: Float16Array | null;
}): ClientLoadedPack {
  admit(m.pack, m.half);
  return m.pack;
}

function metaUrlFor(packId: string): string {
  return assetsPackFileUrl(packId, CARD_EMBED_SHARD_FILES.meta);
}

/** Parse + store a freshly fetched meta/bin pair. Null when unusable. */
async function installShard(
  packId: string,
  metaRes: Response,
  fetchBin: () => Promise<Response>,
): Promise<Materialized | null> {
  const meta = (await metaRes.json()) as ClientEmbeddingMeta;
  if (!meta?.entries?.length || !meta.dim) return null;
  const expectedModel = clientEmbedModelId();
  // Shards built with another model/dim are unusable → skip pack (honest).
  if (meta.model && meta.model !== expectedModel) {
    console.warn(
      `[embed-index.client] model mismatch pack=${packId} index=${meta.model} client=${expectedModel}`,
    );
    return null;
  }
  const binRes = await fetchBin();
  if (!binRes.ok) return null;
  const buf = await binRes.arrayBuffer();
  const etag = metaRes.headers.get("etag") ?? undefined;
  await idbPut({
    packId,
    model: meta.model,
    dim: meta.dim,
    builtAt: meta.builtAt,
    metaJson: JSON.stringify(meta),
    matrixF16: buf.slice(0),
    ...(etag ? { etag } : {}),
  });
  return materialize(meta, buf);
}

type Materialized = Awaited<ReturnType<typeof materialize>>;

/** Background shard traffic must not starve the camera's own requests. */
const LOW_PRIORITY = { priority: "low" } as RequestInit;

async function fetchPackShard(packId: string): Promise<Materialized | null> {
  const binUrl = assetsPackFileUrl(packId, CARD_EMBED_SHARD_FILES.f16);
  try {
    const metaRes = await fetch(metaUrlFor(packId), {
      cache: "no-cache",
      ...LOW_PRIORITY,
    });
    if (!metaRes.ok) return null;
    return await installShard(packId, metaRes, () =>
      fetch(binUrl, { cache: "no-cache", ...LOW_PRIORITY }),
    );
  } catch (err) {
    console.warn("[embed-index.client] fetch failed", packId, err);
    return null;
  }
}

/** Packs already revalidated against the server this session. */
const revalidated = new Set<string>();

/**
 * Pure decision behind {@link revalidatePackShard}: 304 (or an unchanged
 * `builtAt` when no validator was stored) keeps the IDB copy; a 2xx with a
 * different `builtAt` refreshes; anything else leaves the shard alone.
 */
export function shardRevalidationDecision(input: {
  status: number;
  storedEtag?: string;
  storedBuiltAt: string;
  serverBuiltAt?: string;
}): "keep" | "refresh" {
  if (input.status === 304) return "keep";
  if (input.status < 200 || input.status >= 300) return "keep";
  if (input.storedEtag) return "refresh";
  return input.serverBuiltAt && input.serverBuiltAt !== input.storedBuiltAt
    ? "refresh"
    : "keep";
}

/**
 * Conditional GET on the meta: 304 → shard is current; 200 → Sync published
 * a new index, download + swap. Soft-fail (offline keeps the IDB copy).
 */
async function revalidatePackShard(
  packId: string,
  rec: Pick<IdbRecord, "etag" | "builtAt">,
): Promise<void> {
  if (revalidated.has(packId)) return;
  revalidated.add(packId);
  try {
    const headers: Record<string, string> = rec.etag
      ? { "If-None-Match": rec.etag }
      : {};
    const metaRes = await fetch(metaUrlFor(packId), {
      cache: "no-store",
      headers,
    });
    let serverBuiltAt: string | undefined;
    if (metaRes.ok && !rec.etag) {
      // Legacy record without validator: peek builtAt before paying for
      // the matrix.
      const head = (await metaRes.clone().json()) as Pick<
        ClientEmbeddingMeta,
        "builtAt"
      >;
      serverBuiltAt = head?.builtAt;
    }
    const decision = shardRevalidationDecision({
      status: metaRes.status,
      storedEtag: rec.etag,
      storedBuiltAt: rec.builtAt,
      serverBuiltAt,
    });
    if (decision === "keep") return;
    const packed = await installShard(packId, metaRes, () =>
      fetch(assetsPackFileUrl(packId, CARD_EMBED_SHARD_FILES.f16), {
        cache: "no-store",
      }),
    );
    if (packed && memory.has(packId)) admitMaterialized(packed);
  } catch {
    // offline / transient — keep what we have
  }
}

async function loadFromIdb(
  packId: string,
): Promise<{ m: Materialized; rec: IdbRecord } | null> {
  try {
    const rec = await idbGet(packId);
    if (!rec) return null;
    if (rec.model !== clientEmbedModelId()) return null;
    const meta = JSON.parse(rec.metaJson) as ClientEmbeddingMeta;
    return { m: await materialize(meta, rec.matrixF16), rec };
  } catch {
    return null;
  }
}

const inflight = new Map<string, Promise<ClientLoadedPack | null>>();

/**
 * Make one pack resident (memory → IDB → network). Deduplicated per pack;
 * never throws. IDB hits revalidate in the background.
 */
export function ensurePackResident(
  packId: string,
): Promise<ClientLoadedPack | null> {
  const hit = getResidentPack(packId);
  if (hit) return Promise.resolve(hit);
  const pending = inflight.get(packId);
  if (pending) return pending;
  const job = (async () => {
    try {
      const fromIdb = await loadFromIdb(packId);
      if (fromIdb) {
        const pack = admitMaterialized(fromIdb.m);
        void revalidatePackShard(packId, fromIdb.rec);
        return pack;
      }
      const fetched = await fetchPackShard(packId);
      if (!fetched) return null;
      revalidated.add(packId);
      return admitMaterialized(fetched);
    } catch {
      return null;
    } finally {
      inflight.delete(packId);
    }
  })();
  inflight.set(packId, job);
  return job;
}

/** @deprecated alias kept for callers that still think in "load". */
export const loadClientEmbeddingPack = ensurePackResident;

/** Pending background order; head is next. */
const queue: string[] = [];
let pumping = false;

async function pump(): Promise<void> {
  if (pumping) return;
  pumping = true;
  try {
    while (queue.length) {
      const next = queue.shift()!;
      if (getResidentPack(next)) continue;
      await ensurePackResident(next);
    }
  } finally {
    pumping = false;
  }
}

/**
 * Queue packs for background residency in the given order (manifest order
 * = cheapest first). One at a time: a phone on 4G must still get the small
 * packs quickly instead of 29 parallel downloads all finishing late.
 */
export function prefetchClientEmbeddingPacks(
  packIds: readonly string[],
): Promise<void> {
  for (const id of packIds) {
    if (!queue.includes(id) && !getResidentPack(id)) queue.push(id);
  }
  return pump();
}

/**
 * A query's shortlist wants this pack now: move it to the head of the queue
 * and start it immediately (the sequential pump keeps going behind it).
 */
export function prioritizePack(packId: string): void {
  const at = queue.indexOf(packId);
  if (at >= 0) queue.splice(at, 1);
  if (getResidentPack(packId) || inflight.has(packId)) return;
  void ensurePackResident(packId);
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
      margin: 200,
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
  revalidated.clear();
  inflight.clear();
  promoting.clear();
  queue.length = 0;
  hotBudget = HOT_F32_BUDGET_BYTES;
}

/** Tests: shrink the hot budget so eviction is exercised with tiny shards. */
export function setHotF32BudgetForTests(bytes: number): void {
  hotBudget = bytes;
}

/** Tests: make a raw f16 shard resident exactly like a loaded one. */
export async function admitShardForTests(
  meta: ClientEmbeddingMeta,
  f16: ArrayBuffer,
): Promise<ClientLoadedPack> {
  return admitMaterialized(await materialize(meta, f16));
}
