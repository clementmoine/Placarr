/**
 * On-disk DINOv2 embedding index for sealed packshots.
 *
 * Sidecar JSON + Float32 LE matrix (`product-embedding-index.{json,f32}`).
 * Vectors are **full-frame** — never CARD_ART_BAND. Prefer over dHash when
 * present; caller still requires user confirm.
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

import {
  CARD_EMBED_DIM,
  CARD_EMBED_MODEL,
  cosineSimilarity,
  cosineToDistance,
  embedFullFrameBuffer,
} from "@/core/identify/cardEmbed";
import {
  computePackCentroid,
  shortlistPacksByCentroid,
  topKMilliDistances,
} from "@/core/identify/cardEmbeddingSearch";
import {
  compactProductEmbeddingEntry,
  expandProductEmbeddingEntries,
  type ProductEmbeddingIndexEntry,
  type ProductEmbeddingIndexEntryWire,
} from "@/core/identify/productEmbeddingEntry";
import type {
  ProductVisualIndexEntry,
  ProductVisualMatch,
} from "@/core/identify/productVisualIndex";
import {
  listProductVisualIndexPackIds,
  loadProductVisualIndex,
} from "@/core/identify/productVisualIndex";
import { PRODUCT_EMBED_SHARD_FILES } from "@/lib/packAssetUrls";
import { packDataDir } from "@/lib/packPaths";
import { dataRoot } from "@/lib/runtimeData";
import { encodeFloat16Matrix } from "@/lib/shared/float16";

export type {
  ProductEmbeddingIndexEntry,
  ProductEmbeddingIndexEntryWire,
} from "@/core/identify/productEmbeddingEntry";

export type ProductEmbeddingIndexMeta = {
  version: 1;
  packId: string;
  model: string;
  dim: number;
  /** Always `"full"` — sealed products never use art-band crop. */
  cropMode: "full";
  builtAt: string;
  entries: ProductEmbeddingIndexEntry[];
  centroid?: number[];
};

const META_NAME = PRODUCT_EMBED_SHARD_FILES.meta;
const BIN_NAME = "product-embedding-index.f32";
const BIN_F16_NAME = PRODUCT_EMBED_SHARD_FILES.f16;

const EMBED_CONCURRENCY = 3;

export type LoadedProductIndex = {
  meta: ProductEmbeddingIndexMeta;
  matrix: Float32Array;
  mtimeMs: number;
  centroid: Float32Array;
  byRow: (ProductEmbeddingIndexEntry | undefined)[];
};

export function materializeProductEmbeddingIndex(partial: {
  meta: ProductEmbeddingIndexMeta;
  matrix: Float32Array;
  mtimeMs: number;
}): LoadedProductIndex {
  const rows = partial.meta.entries.length;
  const byRow: (ProductEmbeddingIndexEntry | undefined)[] = new Array(rows);
  for (const entry of partial.meta.entries) {
    if (entry.row >= 0 && entry.row < rows) byRow[entry.row] = entry;
  }
  return {
    ...partial,
    byRow,
    centroid: computePackCentroid(partial.matrix, rows, partial.meta.dim),
  };
}

const indexCache = new Map<string, LoadedProductIndex>();

export function productEmbeddingIndexMetaPath(packId: string): string {
  return path.join(packDataDir(packId), META_NAME);
}

export function productEmbeddingIndexBinPath(packId: string): string {
  return path.join(packDataDir(packId), BIN_NAME);
}

export function productEmbeddingIndexF16Path(packId: string): string {
  return path.join(packDataDir(packId), BIN_F16_NAME);
}

export function loadProductEmbeddingIndex(
  packId: string,
): LoadedProductIndex | null {
  const metaPath = productEmbeddingIndexMetaPath(packId);
  const binPath = productEmbeddingIndexBinPath(packId);
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
      ProductEmbeddingIndexMeta,
      "entries"
    > & {
      entries: (ProductEmbeddingIndexEntry | ProductEmbeddingIndexEntryWire)[];
    };
    if (
      raw?.version !== 1 ||
      raw.model !== CARD_EMBED_MODEL ||
      raw.dim !== CARD_EMBED_DIM ||
      raw.cropMode !== "full" ||
      !Array.isArray(raw.entries)
    ) {
      return null;
    }
    const entries = expandProductEmbeddingEntries(raw.entries);
    if (entries.length !== raw.entries.length) return null;
    const meta: ProductEmbeddingIndexMeta = { ...raw, entries };
    const buf = readFileSync(binPath);
    const expected = meta.entries.length * CARD_EMBED_DIM * 4;
    if (buf.byteLength < expected) return null;
    const matrix = new Float32Array(
      buf.buffer,
      buf.byteOffset,
      meta.entries.length * CARD_EMBED_DIM,
    );
    const loaded = materializeProductEmbeddingIndex({ meta, matrix, mtimeMs });
    indexCache.set(packId, loaded);
    return loaded;
  } catch {
    indexCache.delete(packId);
    return null;
  }
}

export function listProductEmbeddingIndexPackIds(): string[] {
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

export const PRODUCT_EMBED_LANG_TIE_EPS = 25;

/** Keep best lang per productKey. */
export function dedupeByProductKey(
  rows: ProductVisualMatch[],
  preferLang?: string | null,
): ProductVisualMatch[] {
  const prefer = preferLang?.trim().toLowerCase() || null;
  const best = new Map<string, ProductVisualMatch>();
  for (const row of rows) {
    const prev = best.get(row.productKey);
    if (!prev) {
      best.set(row.productKey, row);
      continue;
    }
    if (row.distance < prev.distance) {
      if (
        prefer &&
        prev.lang === prefer &&
        row.lang !== prefer &&
        prev.distance - row.distance <= PRODUCT_EMBED_LANG_TIE_EPS
      ) {
        continue;
      }
      best.set(row.productKey, row);
      continue;
    }
    if (
      prefer &&
      row.lang === prefer &&
      prev.lang !== prefer &&
      row.distance - prev.distance <= PRODUCT_EMBED_LANG_TIE_EPS
    ) {
      best.set(row.productKey, row);
    }
  }
  return [...best.values()].sort(
    (a, b) =>
      a.distance - b.distance || a.productKey.localeCompare(b.productKey),
  );
}

function hitsToMatches(
  index: LoadedProductIndex,
  hits: { row: number; distance: number }[],
): ProductVisualMatch[] {
  const scored: ProductVisualMatch[] = [];
  for (const hit of hits) {
    const entry = index.byRow[hit.row] ?? index.meta.entries[hit.row];
    if (!entry) continue;
    scored.push({
      productKey: entry.productKey,
      lang: entry.lang,
      slug: entry.slug,
      distance: hit.distance,
      artRel: entry.artRel,
      packId: index.meta.packId,
    });
  }
  return scored;
}

/** Top‑k nearest by cosine; `distance` = milli-dissimilarity. */
export function matchProductEmbedding(
  query: Float32Array,
  index: LoadedProductIndex,
  opts?: {
    limit?: number;
    maxDistance?: number;
    minMargin?: number;
    preferLang?: string | null;
  },
): ProductVisualMatch[] {
  const limit = opts?.limit ?? 5;
  const maxDistance = opts?.maxDistance ?? 450;
  const minMargin = opts?.minMargin ?? 20;
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
  const top = dedupeByProductKey(scored, opts?.preferLang).slice(0, limit);
  if (top.length >= 2 && top[1]!.distance - top[0]!.distance < minMargin) {
    return top.map((row) => ({ ...row, ambiguous: true }));
  }
  return top;
}

/**
 * Multi-pack product embed: pack-centroid shortlist → exact scan survivors.
 */
export function matchProductEmbeddingAcrossPacks(
  query: Float32Array,
  opts?: {
    limit?: number;
    maxDistance?: number;
    minMargin?: number;
    packIds?: string[];
    preferLang?: string | null;
  },
): ProductVisualMatch[] {
  const packIds = opts?.packIds ?? listProductEmbeddingIndexPackIds();
  const limit = opts?.limit ?? 5;
  const maxDistance = opts?.maxDistance ?? 450;
  const loaded: LoadedProductIndex[] = [];
  for (const packId of packIds) {
    const index = loadProductEmbeddingIndex(packId);
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

  const scanPack = (index: LoadedProductIndex): ProductVisualMatch[] =>
    matchProductEmbedding(query, index, {
      limit: Math.max(limit, 12),
      maxDistance,
      minMargin: 0,
      preferLang: opts?.preferLang,
    });

  const scored: ProductVisualMatch[] = [];
  for (const row of shortlisted) {
    scored.push(...scanPack(row.index));
  }

  if (!scored.length) {
    for (const index of loaded) {
      if (shortlistIds.has(index.meta.packId)) continue;
      scored.push(...scanPack(index));
    }
  }

  const top = dedupeByProductKey(scored, opts?.preferLang).slice(0, limit);
  const minMargin = opts?.minMargin ?? 20;
  if (top.length >= 2 && top[1]!.distance - top[0]!.distance < minMargin) {
    return top.map((row) => ({ ...row, ambiguous: true }));
  }
  return top.map(({ ambiguous: _a, ...row }) => row);
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

export function productEmbeddingReuseKey(
  productKey: string,
  artRel: string,
): string {
  return `${productKey}\0${artRel}`;
}

export function productEmbeddingVectorReusable(
  prev: Pick<ProductEmbeddingIndexEntry, "fp">,
  row: Pick<ProductVisualIndexEntry, "fp">,
): boolean {
  return !prev.fp || !row.fp || prev.fp === row.fp;
}

export function partitionProductEmbeddingWork(
  source: readonly ProductVisualIndexEntry[],
  existing: LoadedProductIndex | null,
  reuseExisting: boolean,
): {
  reuse: { row: ProductVisualIndexEntry; vec: Float32Array }[];
  todo: ProductVisualIndexEntry[];
} {
  if (!reuseExisting || !existing?.meta.entries.length) {
    return { reuse: [], todo: [...source] };
  }
  if (
    existing.meta.model !== CARD_EMBED_MODEL ||
    existing.meta.dim !== CARD_EMBED_DIM ||
    existing.meta.cropMode !== "full"
  ) {
    return { reuse: [], todo: [...source] };
  }
  const byKey = new Map<string, ProductEmbeddingIndexEntry>();
  for (const entry of existing.meta.entries) {
    byKey.set(productEmbeddingReuseKey(entry.productKey, entry.artRel), entry);
  }
  const reuse: { row: ProductVisualIndexEntry; vec: Float32Array }[] = [];
  const todo: ProductVisualIndexEntry[] = [];
  for (const row of source) {
    const prev = byKey.get(
      productEmbeddingReuseKey(row.productKey, row.artRel),
    );
    if (!prev || !productEmbeddingVectorReusable(prev, row)) {
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
 * Build embedding matrix from an existing product visual index.
 * Uses {@link embedFullFrameBuffer} — never art-band crop.
 */
export async function buildProductEmbeddingIndex(opts: {
  packId: string;
  entries?: readonly ProductVisualIndexEntry[];
  limit?: number;
  reuseExisting?: boolean;
  onProgress?: (done: number, total: number) => void;
}): Promise<ProductEmbeddingIndexMeta> {
  const visual =
    opts.entries ?? loadProductVisualIndex(opts.packId)?.entries ?? [];
  const source = opts.limit != null ? visual.slice(0, opts.limit) : visual;
  if (!source.length) {
    throw new Error(
      `buildProductEmbeddingIndex: no visual index entries for ${opts.packId}`,
    );
  }

  const reuseExisting = opts.reuseExisting !== false;
  const prior = reuseExisting ? loadProductEmbeddingIndex(opts.packId) : null;
  const { reuse, todo } = partitionProductEmbeddingWork(
    source,
    prior,
    reuseExisting,
  );

  const packRoot = packDataDir(opts.packId);
  const vectors: Float32Array[] = [];
  const entries: ProductEmbeddingIndexEntry[] = [];
  let attempted = 0;
  let firstError: unknown = null;
  const progressTotal = reuse.length + todo.length;

  for (const hit of reuse) {
    const rowIndex = entries.length;
    entries.push({
      productKey: hit.row.productKey,
      lang: hit.row.lang,
      slug: hit.row.slug,
      artRel: hit.row.artRel,
      row: rowIndex,
      ...(hit.row.fp ? { fp: hit.row.fp } : {}),
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
      // Full-frame DINOv2 — never CARD_ART_BAND / embedArtBandBuffer.
      const vec = await embedFullFrameBuffer(raw);
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
      productKey: hit.row.productKey,
      lang: hit.row.lang,
      slug: hit.row.slug,
      artRel: hit.row.artRel,
      row: rowIndex,
      ...(hit.row.fp ? { fp: hit.row.fp } : {}),
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
      `buildProductEmbeddingIndex: zero embeddings for ${opts.packId}`,
    );
  }

  if (
    prior &&
    embedded.every((hit) => hit == null) &&
    productEmbeddingEntriesEqual(prior.meta.entries, entries)
  ) {
    return prior.meta;
  }

  const matrix = new Float32Array(entries.length * CARD_EMBED_DIM);
  for (let i = 0; i < vectors.length; i++) {
    matrix.set(vectors[i]!, i * CARD_EMBED_DIM);
  }

  const centroid = computePackCentroid(matrix, entries.length, CARD_EMBED_DIM);
  const meta: ProductEmbeddingIndexMeta = {
    version: 1,
    packId: opts.packId,
    model: CARD_EMBED_MODEL,
    dim: CARD_EMBED_DIM,
    cropMode: "full",
    builtAt: new Date().toISOString(),
    entries,
    centroid: Array.from(centroid),
  };

  mkdirSync(packRoot, { recursive: true });
  writeFileSync(
    productEmbeddingIndexMetaPath(opts.packId),
    JSON.stringify({
      ...meta,
      entries: entries.map(compactProductEmbeddingEntry),
    }),
  );
  writeFileSync(
    productEmbeddingIndexBinPath(opts.packId),
    Buffer.from(matrix.buffer, matrix.byteOffset, matrix.byteLength),
  );
  const f16 = encodeFloat16Matrix(matrix);
  writeFileSync(productEmbeddingIndexF16Path(opts.packId), Buffer.from(f16));
  indexCache.delete(opts.packId);
  return meta;
}

export function productEmbeddingEntriesEqual(
  a: readonly ProductEmbeddingIndexEntry[],
  b: readonly ProductEmbeddingIndexEntry[],
): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i]!;
    const y = b[i]!;
    if (
      x.productKey !== y.productKey ||
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

export function productEmbeddingIndexesAvailable(packIds?: string[]): boolean {
  const ids = packIds?.length
    ? packIds
    : listProductEmbeddingIndexPackIds().length
      ? listProductEmbeddingIndexPackIds()
      : listProductVisualIndexPackIds();
  for (const id of ids) {
    if (loadProductEmbeddingIndex(id)?.meta.entries.length) return true;
  }
  return false;
}

/** Cosine distance helper for ad-hoc row scoring (tests / diagnostics). */
export function productRowDistance(
  query: Float32Array,
  index: LoadedProductIndex,
  row: number,
): number {
  const start = row * CARD_EMBED_DIM;
  const vec = index.matrix.subarray(start, start + CARD_EMBED_DIM);
  return cosineToDistance(cosineSimilarity(query, vec));
}
