/**
 * On-disk DINOv2 embedding index for a catalogue dataPack.
 *
 * Sidecar JSON + Float32 LE matrix (`card-embedding-index.{json,f32}`).
 * Prefer this over dHash when present; caller still requires user confirm.
 */
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
} from "node:fs";
import path from "node:path";

import { extractCardArtBand } from "@/core/enrich/media/imageAssets";
import {
  CARD_EMBED_DIM,
  CARD_EMBED_MODEL,
  cosineSimilarity,
  cosineToDistance,
  embedArtBandBuffer,
} from "@/core/identify/cardEmbed";
import {
  computePackCentroid,
  shortlistPacksByCentroid,
  topKMilliDistances,
} from "@/core/identify/cardEmbeddingSearch";
import type { CollectorNumberHint } from "@/core/identify/collectorNumberHint";
import { printKeyMatchesCollectorHint } from "@/core/identify/collectorNumberHint";
import type {
  CardVisualIndexEntry,
  CardVisualMatch,
} from "@/core/identify/cardVisualIndex";
import {
  listCardVisualIndexPackIds,
  loadCardVisualIndex,
} from "@/core/identify/cardVisualIndex";
import {
  compactEmbeddingEntry,
  expandEmbeddingEntries,
  type CardEmbeddingIndexEntry,
  type CardEmbeddingIndexEntryWire,
} from "@/core/identify/cardEmbeddingEntry";
import { embeddingCheckpointInterval } from "@/core/identify/embeddingCheckpoint";
import { writeFileAtomic } from "@/lib/fs/writeFileAtomic";
import { CARD_EMBED_SHARD_FILES } from "@/lib/packAssetUrls";
import { packDataDir } from "@/lib/packPaths";
import { dataRoot } from "@/lib/runtimeData";
import { encodeFloat16Matrix } from "@/lib/shared/float16";

export type {
  CardEmbeddingIndexEntry,
  CardEmbeddingIndexEntryWire,
} from "@/core/identify/cardEmbeddingEntry";

export type CardEmbeddingIndexMeta = {
  version: 1;
  packId: string;
  model: string;
  dim: number;
  builtAt: string;
  entries: CardEmbeddingIndexEntry[];
  /** Optional L2 pack centroid (f32) for client shortlist without full decode. */
  centroid?: number[];
};

const META_NAME = CARD_EMBED_SHARD_FILES.meta;
const BIN_NAME = "card-embedding-index.f32";
/** Half-precision matrix for on-device IndexedDB shards (same vectors as f32). */
const BIN_F16_NAME = CARD_EMBED_SHARD_FILES.f16;

/** The ONNX encoder already multi-threads; keep workers low to avoid RAM spikes. */
const EMBED_CONCURRENCY = 3;

export { embeddingCheckpointInterval } from "@/core/identify/embeddingCheckpoint";

export type LoadedIndex = {
  meta: CardEmbeddingIndexMeta;
  matrix: Float32Array;
  mtimeMs: number;
  /** L2-normalized mean of all rows — multi-pack shortlist gate. */
  centroid: Float32Array;
  /** entry.row → entry (matrix scan hits map back to catalogue rows). */
  byRow: (CardEmbeddingIndexEntry | undefined)[];
};

/** Fill centroid/byRow for disk loads and unit fixtures. */
export function materializeEmbeddingIndex(partial: {
  meta: CardEmbeddingIndexMeta;
  matrix: Float32Array;
  mtimeMs: number;
}): LoadedIndex {
  const rows = partial.meta.entries.length;
  const byRow: (CardEmbeddingIndexEntry | undefined)[] = new Array(rows);
  for (const entry of partial.meta.entries) {
    if (entry.row >= 0 && entry.row < rows) byRow[entry.row] = entry;
  }
  return {
    ...partial,
    byRow,
    centroid: computePackCentroid(partial.matrix, rows, partial.meta.dim),
  };
}

const indexCache = new Map<string, LoadedIndex>();

export function cardEmbeddingIndexMetaPath(packId: string): string {
  return path.join(packDataDir(packId), META_NAME);
}

export function cardEmbeddingIndexBinPath(packId: string): string {
  return path.join(packDataDir(packId), BIN_NAME);
}

export function cardEmbeddingIndexF16Path(packId: string): string {
  return path.join(packDataDir(packId), BIN_F16_NAME);
}

export function loadCardEmbeddingIndex(packId: string): LoadedIndex | null {
  const metaPath = cardEmbeddingIndexMetaPath(packId);
  const binPath = cardEmbeddingIndexBinPath(packId);
  if (!existsSync(metaPath) || !existsSync(binPath)) {
    indexCache.delete(packId);
    return null;
  }
  try {
    const mtimeMs = Math.max(
      statSync(metaPath).mtimeMs,
      statSync(binPath).mtimeMs,
    );
    const cached = indexCache.get(packId);
    if (cached && cached.mtimeMs === mtimeMs) return cached;

    const raw = JSON.parse(readFileSync(metaPath, "utf8")) as Omit<
      CardEmbeddingIndexMeta,
      "entries"
    > & {
      entries: (CardEmbeddingIndexEntry | CardEmbeddingIndexEntryWire)[];
    };
    if (
      raw?.version !== 1 ||
      raw.model !== CARD_EMBED_MODEL ||
      raw.dim !== CARD_EMBED_DIM ||
      !Array.isArray(raw.entries)
    ) {
      return null;
    }
    const entries = expandEmbeddingEntries(raw.entries);
    if (entries.length !== raw.entries.length) return null;
    const meta: CardEmbeddingIndexMeta = { ...raw, entries };
    const buf = readFileSync(binPath);
    const expected = meta.entries.length * CARD_EMBED_DIM * 4;
    if (buf.byteLength < expected) return null;
    const matrix = new Float32Array(
      buf.buffer,
      buf.byteOffset,
      meta.entries.length * CARD_EMBED_DIM,
    );
    const loaded = materializeEmbeddingIndex({ meta, matrix, mtimeMs });
    indexCache.set(packId, loaded);
    return loaded;
  } catch {
    indexCache.delete(packId);
    return null;
  }
}

export function listCardEmbeddingIndexPackIds(): string[] {
  const root = dataRoot();
  if (!existsSync(root)) return [];
  const found: string[] = [];
  const walk = (rel: string, depth: number) => {
    if (depth > 3) return;
    const abs = rel ? path.join(root, rel) : root;
    let entries;
    try {
      entries = readdirSync(abs, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      if (ent.name.startsWith(".")) continue;
      if (ent.isFile() && ent.name === META_NAME && rel) {
        found.push(rel.split(path.sep).join("/"));
        continue;
      }
      if (ent.isDirectory()) {
        walk(rel ? path.join(rel, ent.name) : ent.name, depth + 1);
      }
    }
  };
  walk("", 0);
  return found.sort();
}

function rowVector(matrix: Float32Array, row: number): Float32Array {
  const start = row * CARD_EMBED_DIM;
  return matrix.subarray(start, start + CARD_EMBED_DIM);
}

/**
 * Prefer UI/catalog locale when embed distances are within this milli-epsilon
 * (FR scan → FR face, not the EN twin of the same printKey).
 */
export const EMBED_LANG_TIE_EPS = 25;

/** Keep best lang per printKey (same art across locales floods the margin). */
export function dedupeByPrintKey(
  rows: CardVisualMatch[],
  preferLang?: string | null,
): CardVisualMatch[] {
  const prefer = preferLang?.trim().toLowerCase() || null;
  const best = new Map<string, CardVisualMatch>();
  for (const row of rows) {
    const prev = best.get(row.printKey);
    if (!prev) {
      best.set(row.printKey, row);
      continue;
    }
    if (row.distance < prev.distance) {
      // Preferred lang may win a small embed reverse (text-heavy faces).
      if (
        prefer &&
        prev.lang === prefer &&
        row.lang !== prefer &&
        prev.distance - row.distance <= EMBED_LANG_TIE_EPS
      ) {
        continue;
      }
      best.set(row.printKey, row);
      continue;
    }
    if (
      prefer &&
      row.lang === prefer &&
      prev.lang !== prefer &&
      row.distance - prev.distance <= EMBED_LANG_TIE_EPS
    ) {
      best.set(row.printKey, row);
    }
  }
  return [...best.values()].sort(
    (a, b) => a.distance - b.distance || a.printKey.localeCompare(b.printKey),
  );
}

function hitsToMatches(
  index: LoadedIndex,
  hits: { row: number; distance: number }[],
): CardVisualMatch[] {
  const scored: CardVisualMatch[] = [];
  for (const hit of hits) {
    const entry = index.byRow[hit.row] ?? index.meta.entries[hit.row];
    if (!entry) continue;
    scored.push({
      printKey: entry.printKey,
      lang: entry.lang,
      distance: hit.distance,
      artRel: entry.artRel,
      packId: index.meta.packId,
    });
  }
  return scored;
}

/** Top‑k nearest by cosine; `distance` = milli-dissimilarity. */
export function matchCardEmbedding(
  query: Float32Array,
  index: LoadedIndex,
  opts?: {
    limit?: number;
    maxDistance?: number;
    minMargin?: number;
    preferLang?: string | null;
  },
): CardVisualMatch[] {
  const limit = opts?.limit ?? 5;
  const maxDistance = opts?.maxDistance ?? 450;
  const minMargin = opts?.minMargin ?? 20;
  // Over-fetch before lang dedupe so preferLang can still win.
  const hits = topKMilliDistances(
    query,
    index.matrix,
    index.meta.entries.length,
    {
      limit: Math.max(limit * 4, 16),
      maxDistance,
      dim: index.meta.dim || CARD_EMBED_DIM,
    },
  );
  const scored = hitsToMatches(index, hits);
  const top = dedupeByPrintKey(scored, opts?.preferLang).slice(0, limit);
  if (top.length >= 2 && top[1]!.distance - top[0]!.distance < minMargin) {
    return top.map((row) => ({ ...row, ambiguous: true }));
  }
  return top;
}

/**
 * Multi-pack embed: pack-centroid shortlist → exact scan survivors.
 * Fail-opens to remaining packs when the shortlist yields nothing under
 * `maxDistance` (honest recall > premature miss).
 */
export function matchCardEmbeddingAcrossPacks(
  query: Float32Array,
  opts?: {
    limit?: number;
    maxDistance?: number;
    minMargin?: number;
    packIds?: string[];
    preferLang?: string | null;
  },
): CardVisualMatch[] {
  const packIds = opts?.packIds ?? listCardEmbeddingIndexPackIds();
  const limit = opts?.limit ?? 5;
  const maxDistance = opts?.maxDistance ?? 450;
  const loaded: LoadedIndex[] = [];
  for (const packId of packIds) {
    const index = loadCardEmbeddingIndex(packId);
    if (!index?.meta.entries.length) continue;
    loaded.push(index);
  }
  if (!loaded.length) return [];

  const shortlisted = shortlistPacksByCentroid(
    query,
    loaded.map((index) => ({
      packId: index.meta.packId,
      centroid: index.centroid,
      index,
    })),
    { minPacks: 6, margin: 140 },
  );
  const shortlistIds = new Set(shortlisted.map((p) => p.packId));

  const scanPack = (index: LoadedIndex): CardVisualMatch[] =>
    matchCardEmbedding(query, index, {
      limit: Math.max(limit, 12),
      maxDistance,
      minMargin: 0,
      preferLang: opts?.preferLang,
    });

  const scored: CardVisualMatch[] = [];
  for (const row of shortlisted) {
    scored.push(...scanPack(row.index));
  }

  // Fail-open: centroid gate missed every in-range neighbor → full scan.
  if (!scored.length) {
    for (const index of loaded) {
      if (shortlistIds.has(index.meta.packId)) continue;
      scored.push(...scanPack(index));
    }
  }

  const top = dedupeByPrintKey(scored, opts?.preferLang).slice(0, limit);
  const minMargin = opts?.minMargin ?? 20;
  if (top.length >= 2 && top[1]!.distance - top[0]!.distance < minMargin) {
    return top.map((row) => ({ ...row, ambiguous: true }));
  }
  return top.map(({ ambiguous: _a, ...row }) => row);
}

/**
 * Score only catalogue rows that match an OCR collector hint.
 * Break-glass when global embed nearest is the wrong game (soft live crops).
 * When the hint carries a set (`107/204 • FR • 2`), require set+number so
 * bare card-number collisions across games do not flood the shortlist.
 */
export function matchCardEmbeddingByCollectorHint(
  query: Float32Array,
  hint: CollectorNumberHint,
  opts?: {
    limit?: number;
    maxDistance?: number;
    packIds?: string[];
    preferLang?: string | null;
  },
): CardVisualMatch[] {
  const packIds = opts?.packIds ?? listCardEmbeddingIndexPackIds();
  const limit = opts?.limit ?? 5;
  const maxDistance = opts?.maxDistance ?? 320;
  const requireSet = Boolean(hint.set);
  const scored: CardVisualMatch[] = [];
  for (const packId of packIds) {
    const index = loadCardEmbeddingIndex(packId);
    if (!index?.meta.entries.length) continue;
    for (const entry of index.meta.entries) {
      if (
        !printKeyMatchesCollectorHint(entry.printKey, hint, entry.card, {
          requireSet,
        })
      ) {
        continue;
      }
      const cos = cosineSimilarity(query, rowVector(index.matrix, entry.row));
      const distance = cosineToDistance(cos);
      if (distance > maxDistance) continue;
      scored.push({
        printKey: entry.printKey,
        lang: entry.lang,
        distance,
        artRel: entry.artRel,
        packId: index.meta.packId,
      });
    }
  }
  return dedupeByPrintKey(scored, opts?.preferLang).slice(0, limit);
}

async function mapPool<T, R>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, Math.max(1, items.length)) },
    async () => {
      while (next < items.length) {
        const index = next++;
        out[index] = await fn(items[index]!, index);
      }
    },
  );
  await Promise.all(workers);
  return out;
}

/** Stable key: same print + same art file → reusable embed vector. */
export function embeddingReuseKey(printKey: string, artRel: string): string {
  return `${printKey}\0${artRel}`;
}

/**
 * Vector still valid for this face: same print + art file, and the file
 * fingerprint has not moved. A missing fingerprint on either side (legacy
 * index, unreadable stat) does not invalidate — only a *different* one does.
 */
export function embeddingVectorReusable(
  prev: Pick<CardEmbeddingIndexEntry, "fp">,
  row: Pick<CardVisualIndexEntry, "fp">,
): boolean {
  return !prev.fp || !row.fp || prev.fp === row.fp;
}

/**
 * Partition visual rows into reusable vectors vs rows that need encoding.
 * Pure — unit-tested without ONNX.
 */
export function partitionEmbeddingWork(
  source: readonly CardVisualIndexEntry[],
  existing: LoadedIndex | null,
  reuseExisting: boolean,
): {
  reuse: { row: CardVisualIndexEntry; vec: Float32Array }[];
  todo: CardVisualIndexEntry[];
} {
  if (!reuseExisting || !existing?.meta.entries.length) {
    return { reuse: [], todo: [...source] };
  }
  if (
    existing.meta.model !== CARD_EMBED_MODEL ||
    existing.meta.dim !== CARD_EMBED_DIM
  ) {
    return { reuse: [], todo: [...source] };
  }
  const byKey = new Map<string, CardEmbeddingIndexEntry>();
  for (const entry of existing.meta.entries) {
    byKey.set(embeddingReuseKey(entry.printKey, entry.artRel), entry);
  }
  const reuse: { row: CardVisualIndexEntry; vec: Float32Array }[] = [];
  const todo: CardVisualIndexEntry[] = [];
  for (const row of source) {
    const prev = byKey.get(embeddingReuseKey(row.printKey, row.artRel));
    if (!prev || !embeddingVectorReusable(prev, row)) {
      todo.push(row);
      continue;
    }
    const start = prev.row * CARD_EMBED_DIM;
    const end = start + CARD_EMBED_DIM;
    if (end > existing.matrix.length) {
      todo.push(row);
      continue;
    }
    reuse.push({
      row,
      vec: existing.matrix.slice(start, end),
    });
  }
  return { reuse, todo };
}

function entryFromVisual(
  row: CardVisualIndexEntry,
  rowIndex: number,
): CardEmbeddingIndexEntry {
  return {
    printKey: row.printKey,
    lang: row.lang,
    set: row.set,
    card: row.card,
    artRel: row.artRel,
    row: rowIndex,
    ...(row.fp ? { fp: row.fp } : {}),
  };
}

/**
 * Persist card embedding shards (json + f32 + f16). Atomic tmp→rename so a
 * killed Sync never leaves a truncated matrix as the live index.
 */
export function persistCardEmbeddingIndex(
  packId: string,
  entries: readonly CardEmbeddingIndexEntry[],
  vectors: readonly Float32Array[],
): CardEmbeddingIndexMeta {
  if (entries.length !== vectors.length) {
    throw new Error(
      `persistCardEmbeddingIndex: entries (${entries.length}) ≠ vectors (${vectors.length})`,
    );
  }
  const matrix = new Float32Array(entries.length * CARD_EMBED_DIM);
  for (let i = 0; i < vectors.length; i++) {
    matrix.set(vectors[i]!, i * CARD_EMBED_DIM);
  }
  const centroid = computePackCentroid(matrix, entries.length, CARD_EMBED_DIM);
  const meta: CardEmbeddingIndexMeta = {
    version: 1,
    packId,
    model: CARD_EMBED_MODEL,
    dim: CARD_EMBED_DIM,
    builtAt: new Date().toISOString(),
    entries: entries.map((e, row) => ({ ...e, row })),
    centroid: Array.from(centroid),
  };
  const packRoot = packDataDir(packId);
  mkdirSync(packRoot, { recursive: true });
  writeFileAtomic(
    cardEmbeddingIndexMetaPath(packId),
    JSON.stringify({
      ...meta,
      entries: meta.entries.map(compactEmbeddingEntry),
    }),
  );
  writeFileAtomic(
    cardEmbeddingIndexBinPath(packId),
    Buffer.from(matrix.buffer, matrix.byteOffset, matrix.byteLength),
  );
  const f16 = encodeFloat16Matrix(matrix);
  writeFileAtomic(cardEmbeddingIndexF16Path(packId), Buffer.from(f16));
  indexCache.delete(packId);
  return meta;
}

/**
 * Build embedding matrix from an existing visual index (same artRel paths).
 * Invoked by Catalogue Sync via {@link runDataPackCardEmbeddingIndex}.
 *
 * With `reuseExisting` (default true), keeps vectors whose printKey+artRel
 * and face fingerprint still match — only new / moved / rewritten faces are
 * re-encoded, and nothing is written when the result equals the prior index.
 *
 * Mid-build checkpoints flush canonical shards so a worker restart can resume
 * via {@link partitionEmbeddingWork} instead of restarting from zero.
 */
export async function buildCardEmbeddingIndex(opts: {
  packId: string;
  /** Reuse entries from the dHash visual index when present. */
  entries?: readonly CardVisualIndexEntry[];
  limit?: number;
  /** Keep prior vectors for unchanged printKey+artRel (default true). */
  reuseExisting?: boolean;
  onProgress?: (done: number, total: number) => void;
  /** Fired after each mid-run shard flush (vector count on disk). */
  onCheckpoint?: (vectorCount: number) => void;
  /** Test override for checkpoint cadence (production uses 1% / min 1000). */
  checkpointEvery?: number;
}): Promise<CardEmbeddingIndexMeta> {
  const visual =
    opts.entries ?? loadCardVisualIndex(opts.packId)?.entries ?? [];
  const source = opts.limit != null ? visual.slice(0, opts.limit) : visual;
  if (!source.length) {
    throw new Error(
      `buildCardEmbeddingIndex: no visual index entries for ${opts.packId}`,
    );
  }

  const reuseExisting = opts.reuseExisting !== false;
  const prior = reuseExisting ? loadCardEmbeddingIndex(opts.packId) : null;
  const { reuse, todo } = partitionEmbeddingWork(source, prior, reuseExisting);

  const packRoot = packDataDir(opts.packId);
  const progressTotal = reuse.length + todo.length;
  let attempted = 0;
  let firstError: unknown = null;

  for (const _hit of reuse) {
    attempted += 1;
    opts.onProgress?.(attempted, progressTotal);
  }

  type Hit = { row: CardVisualIndexEntry; vec: Float32Array };
  const completed: Hit[] = [];
  const checkpointEvery = embeddingCheckpointInterval(
    todo.length,
    opts.checkpointEvery,
  );
  let todoDone = 0;
  let nextCheckpointAt = checkpointEvery;
  let lastFlushedVectors = -1;
  let flushChain: Promise<void> = Promise.resolve();

  const flushSnapshot = (hits: readonly Hit[], announce: boolean) => {
    const entries: CardEmbeddingIndexEntry[] = [];
    const vectors: Float32Array[] = [];
    for (const hit of reuse) {
      entries.push(entryFromVisual(hit.row, entries.length));
      vectors.push(hit.vec);
    }
    for (const hit of hits) {
      entries.push(entryFromVisual(hit.row, entries.length));
      vectors.push(hit.vec);
    }
    if (!entries.length) return;
    if (entries.length === lastFlushedVectors) return;
    const meta = persistCardEmbeddingIndex(opts.packId, entries, vectors);
    lastFlushedVectors = meta.entries.length;
    if (announce) opts.onCheckpoint?.(meta.entries.length);
  };

  const scheduleCheckpoint = (force: boolean) => {
    const crossed =
      todoDone >= nextCheckpointAt || (force && todoDone > 0);
    if (!crossed && !force) return;
    while (todoDone >= nextCheckpointAt) {
      nextCheckpointAt += checkpointEvery;
    }
    const snapshot = completed.slice();
    flushChain = flushChain.then(() => {
      flushSnapshot(snapshot, true);
    });
  };

  const embedded = await mapPool(todo, EMBED_CONCURRENCY, async (row) => {
    try {
      const abs = path.join(packRoot, ...row.artRel.split("/"));
      if (!existsSync(abs)) return null;
      const raw = readFileSync(abs);
      const band = await extractCardArtBand(raw);
      if (!band) return null;
      const vec = await embedArtBandBuffer(band);
      if (!vec || vec.length < CARD_EMBED_DIM) return null;
      const hit: Hit = { row, vec: vec.slice(0, CARD_EMBED_DIM) };
      completed.push(hit);
      return hit;
    } catch (err) {
      if (!firstError) firstError = err;
      return null;
    } finally {
      todoDone += 1;
      attempted += 1;
      opts.onProgress?.(attempted, progressTotal);
      if (todoDone >= nextCheckpointAt) scheduleCheckpoint(false);
    }
  });

  await flushChain;

  const entries: CardEmbeddingIndexEntry[] = [];
  const vectors: Float32Array[] = [];
  for (const hit of reuse) {
    entries.push(entryFromVisual(hit.row, entries.length));
    vectors.push(hit.vec);
  }
  for (const hit of embedded) {
    if (!hit) continue;
    entries.push(entryFromVisual(hit.row, entries.length));
    vectors.push(hit.vec);
  }

  if (!entries.length && firstError) {
    throw firstError instanceof Error
      ? firstError
      : new Error(String(firstError));
  }

  if (!entries.length) {
    throw new Error(
      `buildCardEmbeddingIndex: zero embeddings for ${opts.packId}`,
    );
  }

  // Nothing encoded and the row list is identical → the files on disk are
  // already this index. Leave them (and their mtimes / ETags) alone.
  if (
    prior &&
    embedded.every((hit) => hit == null) &&
    embeddingEntriesEqual(prior.meta.entries, entries)
  ) {
    return prior.meta;
  }

  if (entries.length === lastFlushedVectors) {
    // Last checkpoint already wrote this exact set — reload meta for builtAt.
    const loaded = loadCardEmbeddingIndex(opts.packId);
    if (loaded && embeddingEntriesEqual(loaded.meta.entries, entries)) {
      return loaded.meta;
    }
  }

  return persistCardEmbeddingIndex(opts.packId, entries, vectors);
}

/** Same rows in the same order (printKey, lang, artRel, fp) — ignores `builtAt`. */
export function embeddingEntriesEqual(
  a: readonly CardEmbeddingIndexEntry[],
  b: readonly CardEmbeddingIndexEntry[],
): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i]!;
    const y = b[i]!;
    if (
      x.printKey !== y.printKey ||
      x.lang !== y.lang ||
      x.artRel !== y.artRel ||
      x.row !== y.row ||
      x.fp !== y.fp
    ) {
      return false;
    }
  }
  return true;
}

/** True when at least one pack in scope has a usable embedding index. */
export function embeddingIndexesAvailable(packIds?: string[]): boolean {
  const ids = packIds?.length
    ? packIds
    : listCardEmbeddingIndexPackIds().length
      ? listCardEmbeddingIndexPackIds()
      : listCardVisualIndexPackIds();
  for (const id of ids) {
    if (loadCardEmbeddingIndex(id)?.meta.entries.length) return true;
  }
  return false;
}
