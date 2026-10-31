/**
 * Fast exact embedding gallery search — contiguous Float32 matrix, no native ANN.
 *
 * At ~166k×512 vectors, a tight JS scan + pack-centroid shortlist beats
 * adding hnsw/faiss (native deps) while keeping identical recall when the
 * centroid gate fail-opens to a full scan.
 */
import {
  CARD_EMBED_DIM,
  cosineSimilarity,
  cosineToDistance,
  l2Normalize,
} from "@/core/identify/embedMath";

export type EmbeddingHit = {
  row: number;
  distance: number;
};

/**
 * Mean of all rows, L2-normalized — coarse pack fingerprint for multi-pack
 * shortlisting (discovery-based pack ids, never provider literals).
 */
export function computePackCentroid(
  matrix: Float32Array,
  rows: number,
  dim: number = CARD_EMBED_DIM,
): Float32Array {
  const centroid = new Float32Array(dim);
  if (rows <= 0) return centroid;
  for (let r = 0; r < rows; r++) {
    const start = r * dim;
    for (let d = 0; d < dim; d++) {
      centroid[d]! += matrix[start + d]!;
    }
  }
  for (let d = 0; d < dim; d++) centroid[d]! /= rows;
  return l2Normalize(centroid);
}

/** Dot product of query against matrix row `row` (assumes both ~unit). */
export function rowDot(
  query: Float32Array,
  matrix: Float32Array,
  row: number,
  dim: number = CARD_EMBED_DIM,
): number {
  const start = row * dim;
  let dot = 0;
  const n = Math.min(dim, query.length);
  for (let d = 0; d < n; d++) {
    dot += query[d]! * matrix[start + d]!;
  }
  return dot;
}

/**
 * Exact top‑k by milli-dissimilarity over a contiguous embedding matrix.
 * Avoids per-row object alloc until a row survives `maxDistance`.
 */
export function topKMilliDistances(
  query: Float32Array,
  matrix: Float32Array,
  rows: number,
  opts?: {
    limit?: number;
    maxDistance?: number;
    dim?: number;
  },
): EmbeddingHit[] {
  const limit = Math.max(1, opts?.limit ?? 5);
  const maxDistance = opts?.maxDistance ?? 450;
  const dim = opts?.dim ?? CARD_EMBED_DIM;
  if (rows <= 0 || query.length < dim) return [];

  // Fixed buffer of best hits (sorted ascending by distance).
  const best: EmbeddingHit[] = [];
  const consider = (row: number, distance: number) => {
    if (distance > maxDistance) return;
    if (best.length < limit) {
      best.push({ row, distance });
      best.sort((a, b) => a.distance - b.distance || a.row - b.row);
      return;
    }
    const worst = best[best.length - 1]!;
    if (distance > worst.distance) return;
    if (distance === worst.distance && row >= worst.row) return;
    best[best.length - 1] = { row, distance };
    best.sort((a, b) => a.distance - b.distance || a.row - b.row);
  };

  for (let row = 0; row < rows; row++) {
    const cos = rowDot(query, matrix, row, dim);
    consider(row, cosineToDistance(cos));
  }
  return best;
}

/**
 * Packs whose centroid is near the query — wide gate, caller fail-opens.
 * Always returns at least `minPacks` (or all) ordered by centroid distance.
 */
export function shortlistPacksByCentroid<
  T extends { centroid: Float32Array; packId: string },
>(
  query: Float32Array,
  packs: readonly T[],
  opts?: {
    minPacks?: number;
    /** Keep packs within this milli of the best centroid. */
    margin?: number;
  },
): T[] {
  if (!packs.length) return [];
  const minPacks = opts?.minPacks ?? 6;
  const margin = opts?.margin ?? 140;
  const ranked = packs
    .map((pack) => ({
      pack,
      distance: cosineToDistance(cosineSimilarity(query, pack.centroid)),
    }))
    .sort((a, b) => a.distance - b.distance);
  const best = ranked[0]!.distance;
  const out: T[] = [];
  for (let i = 0; i < ranked.length; i++) {
    const row = ranked[i]!;
    if (i < minPacks || row.distance <= best + margin) {
      out.push(row.pack);
    }
  }
  return out;
}
