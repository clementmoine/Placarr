/**
 * Disk status for camera identify indexes (dHash visual + CLIP embed).
 * Pure filesystem read — no model load.
 */
import { existsSync, statSync } from "node:fs";

import {
  cardEmbeddingIndexMetaPath,
  loadCardEmbeddingIndex,
} from "@/core/identify/cardEmbeddingIndex";
import {
  cardVisualIndexPath,
  loadCardVisualIndex,
} from "@/core/identify/cardVisualIndex";

export type CardIdentifyIndexStatus = {
  visualEntries: number;
  embeddingEntries: number;
  embeddingModel: string | null;
  /**
   * Visual faces exist but embeddings are missing, count-mismatched, or
   * older than the visual index mtime.
   */
  embeddingsStale: boolean;
  /** At least one face is indexed for dHash / multi-signal. */
  hasVisual: boolean;
};

export function cardIdentifyIndexStatus(
  packId: string,
): CardIdentifyIndexStatus {
  const visual = loadCardVisualIndex(packId);
  const visualEntries = visual?.entries.length ?? 0;
  const embed = loadCardEmbeddingIndex(packId);
  const embeddingEntries = embed?.meta.entries.length ?? 0;
  const embeddingModel = embed?.meta.model ?? null;

  let embeddingsStale = false;
  if (visualEntries > 0) {
    if (embeddingEntries === 0 || embeddingEntries !== visualEntries) {
      embeddingsStale = true;
    } else {
      const visualPath = cardVisualIndexPath(packId);
      const embedPath = cardEmbeddingIndexMetaPath(packId);
      if (existsSync(visualPath) && existsSync(embedPath)) {
        try {
          if (statSync(visualPath).mtimeMs > statSync(embedPath).mtimeMs) {
            embeddingsStale = true;
          }
        } catch {
          embeddingsStale = true;
        }
      } else {
        embeddingsStale = true;
      }
    }
  }

  return {
    visualEntries,
    embeddingEntries,
    embeddingModel,
    embeddingsStale,
    hasVisual: visualEntries > 0,
  };
}
