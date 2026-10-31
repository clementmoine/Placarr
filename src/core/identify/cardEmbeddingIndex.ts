/**
 * On-disk CLIP embedding index for a catalogue dataPack.
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
  writeFileSync,
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
import type {
  CollectorNumberHint,
} from "@/core/identify/collectorNumberHint";
import { printKeyMatchesCollectorHint } from "@/core/identify/collectorNumberHint";
import type {
  CardVisualIndexEntry,
  CardVisualMatch,
} from "@/core/identify/cardVisualIndex";
import {
  listCardVisualIndexPackIds,
  loadCardVisualIndex,
} from "@/core/identify/cardVisualIndex";
import { packDataDir } from "@/lib/packPaths";
import { dataRoot } from "@/lib/runtimeData";
import { encodeFloat16Matrix } from "@/lib/shared/float16";

export type CardEmbeddingIndexEntry = {
  printKey: string;
  lang: string;
  set: string;
  card: string;
  artRel: string;
  /** Row index into the Float32 matrix. */
  row: number;
};

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

const META_NAME = "card-embedding-index.json";
const BIN_NAME = "card-embedding-index.f32";
/** Half-precision matrix for on-device IndexedDB shards (same vectors as f32). */
const BIN_F16_NAME = "card-embedding-index.f16";

/** CLIP ONNX already multi-threads; keep workers low to avoid RAM spikes. */
const EMBED_CONCURRENCY = 3;

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

export function loadCardEmbeddingIndex(
  packId: string,
): LoadedIndex | null {
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

    const meta = JSON.parse(
      readFileSync(metaPath, "utf8"),
    ) as CardEmbeddingIndexMeta;
    if (
      meta?.version !== 1 ||
      meta.model !== CARD_EMBED_MODEL ||
      meta.dim !== CARD_EMBED_DIM ||
      !Array.isArray(meta.entries)
    ) {
      return null;
    }
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

function rowVector(
  matrix: Float32Array,
  row: number,
): Float32Array {
  const start = row * CARD_EMBED_DIM;
  return matrix.subarray(start, start + CARD_EMBED_DIM);
}

/**
 * Prefer UI/catalog locale when CLIP distances are within this milli-epsilon
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
      // Preferred lang may win a small CLIP reverse (text-heavy faces).
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
  const maxDistance = opts?.maxDistance ?? 250;
  const minMargin = opts?.minMargin ?? 20;
  // Over-fetch before lang dedupe so preferLang can still win.
  const hits = topKMilliDistances(query, index.matrix, index.meta.entries.length, {
    limit: Math.max(limit * 4, 16),
    maxDistance,
    dim: index.meta.dim || CARD_EMBED_DIM,
  });
  const scored = hitsToMatches(index, hits);
  const top = dedupeByPrintKey(scored, opts?.preferLang).slice(0, limit);
  if (
    top.length >= 2 &&
    top[1]!.distance - top[0]!.distance < minMargin
  ) {
    return top.map((row) => ({ ...row, ambiguous: true }));
  }
  return top;
}

/**
 * Multi-pack CLIP: pack-centroid shortlist → exact scan survivors.
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
  const maxDistance = opts?.maxDistance ?? 250;
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

  let scored: CardVisualMatch[] = [];
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
  if (
    top.length >= 2 &&
    top[1]!.distance - top[0]!.distance < minMargin
  ) {
    return top.map((row) => ({ ...row, ambiguous: true }));
  }
  return top.map(({ ambiguous: _a, ...row }) => row);
}

/**
 * Score only catalogue rows that match an OCR collector hint.
 * Break-glass when global CLIP nearest is the wrong game (soft live crops).
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

/** Stable key: same print + same art file → reusable CLIP vector. */
export function embeddingReuseKey(
  printKey: string,
  artRel: string,
): string {
  return `${printKey}\0${artRel}`;
}

/**
 * Partition visual rows into reusable vectors vs rows that need CLIP.
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
    if (!prev) {
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

/**
 * Build embedding matrix from an existing visual index (same artRel paths).
 * Invoked by Catalogue Sync via {@link runDataPackCardEmbeddingIndex}.
 *
 * With `reuseExisting` (default true), keeps CLIP vectors whose printKey+artRel
 * still match — only new / moved faces are re-encoded.
 */
export async function buildCardEmbeddingIndex(opts: {
  packId: string;
  /** Reuse entries from the dHash visual index when present. */
  entries?: readonly CardVisualIndexEntry[];
  limit?: number;
  /** Keep prior vectors for unchanged printKey+artRel (default true). */
  reuseExisting?: boolean;
  onProgress?: (done: number, total: number) => void;
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
  const { reuse, todo } = partitionEmbeddingWork(
    source,
    prior,
    reuseExisting,
  );

  const packRoot = packDataDir(opts.packId);
  const vectors: Float32Array[] = [];
  const entries: CardEmbeddingIndexEntry[] = [];
  let attempted = 0;
  let firstError: unknown = null;
  const progressTotal = reuse.length + todo.length;

  for (const hit of reuse) {
    const rowIndex = entries.length;
    entries.push({
      printKey: hit.row.printKey,
      lang: hit.row.lang,
      set: hit.row.set,
      card: hit.row.card,
      artRel: hit.row.artRel,
      row: rowIndex,
    });
    vectors.push(hit.vec);
    attempted += 1;
    opts.onProgress?.(attempted, progressTotal);
  }

  const embedded = await mapPool(todo, EMBED_CONCURRENCY, async (row) => {
    try {
      const abs = path.join(packRoot, ...row.artRel.split("/"));
      if (!existsSync(abs)) return null;
      const raw = readFileSync(abs);
      const band = await extractCardArtBand(raw);
      if (!band) return null;
      const vec = await embedArtBandBuffer(band);
      if (!vec || vec.length < CARD_EMBED_DIM) return null;
      return { row, vec: vec.slice(0, CARD_EMBED_DIM) };
    } catch (err) {
      if (!firstError) firstError = err;
      return null;
    } finally {
      attempted += 1;
      opts.onProgress?.(attempted, progressTotal);
    }
  });

  for (const hit of embedded) {
    if (!hit) continue;
    const rowIndex = entries.length;
    entries.push({
      printKey: hit.row.printKey,
      lang: hit.row.lang,
      set: hit.row.set,
      card: hit.row.card,
      artRel: hit.row.artRel,
      row: rowIndex,
    });
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

  const matrix = new Float32Array(entries.length * CARD_EMBED_DIM);
  for (let i = 0; i < vectors.length; i++) {
    matrix.set(vectors[i]!, i * CARD_EMBED_DIM);
  }

  const centroid = computePackCentroid(matrix, entries.length, CARD_EMBED_DIM);
  const meta: CardEmbeddingIndexMeta = {
    version: 1,
    packId: opts.packId,
    model: CARD_EMBED_MODEL,
    dim: CARD_EMBED_DIM,
    builtAt: new Date().toISOString(),
    entries,
    centroid: Array.from(centroid),
  };

  mkdirSync(packRoot, { recursive: true });
  writeFileSync(cardEmbeddingIndexMetaPath(opts.packId), JSON.stringify(meta));
  writeFileSync(
    cardEmbeddingIndexBinPath(opts.packId),
    Buffer.from(matrix.buffer, matrix.byteOffset, matrix.byteLength),
  );
  // On-device shard (~½ RAM) — same vectors; served via /assets/<pack>/…
  const f16 = encodeFloat16Matrix(matrix);
  writeFileSync(
    cardEmbeddingIndexF16Path(opts.packId),
    Buffer.from(f16),
  );
  indexCache.delete(opts.packId);
  return meta;
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
