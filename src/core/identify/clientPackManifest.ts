/**
 * What the phone needs to know about every on-device shard *before*
 * downloading any of them: size, freshness and the pack centroid.
 *
 * With centroids in hand the client can shortlist packs for a query it has
 * already embedded, pull only those shards, and answer from the server for
 * anything not yet resident — instead of downloading 100 MB on camera open.
 */
import { existsSync, statSync } from "node:fs";

import {
  cardEmbeddingIndexF16Path,
  listCardEmbeddingIndexPackIds,
  loadCardEmbeddingIndex,
} from "@/core/identify/cardEmbeddingIndex";

export type ClientPackManifestEntry = {
  packId: string;
  /** Vector count. */
  entries: number;
  dim: number;
  builtAt: string;
  /** Size of the f16 shard on the wire, bytes. */
  bytesF16: number;
  /** L2 centroid, rounded to 4 decimals (≈ 3 KB per pack). */
  centroid: number[];
};

/** Smallest first: cheap packs become resident while the big ones stream. */
export function orderManifestForPrefetch<T extends { bytesF16: number }>(
  packs: readonly T[],
): T[] {
  return [...packs].sort((a, b) => a.bytesF16 - b.bytesF16);
}

export function buildClientPackManifest(): ClientPackManifestEntry[] {
  const out: ClientPackManifestEntry[] = [];
  for (const packId of listCardEmbeddingIndexPackIds()) {
    const index = loadCardEmbeddingIndex(packId);
    if (!index?.meta.entries.length) continue;
    const f16 = cardEmbeddingIndexF16Path(packId);
    if (!existsSync(f16)) continue;
    out.push({
      packId,
      entries: index.meta.entries.length,
      dim: index.meta.dim,
      builtAt: index.meta.builtAt,
      bytesF16: statSync(f16).size,
      centroid: Array.from(index.centroid, (v) => Math.round(v * 1e4) / 1e4),
    });
  }
  return orderManifestForPrefetch(out);
}
