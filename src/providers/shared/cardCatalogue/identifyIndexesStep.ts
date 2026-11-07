/**
 * Post-Sync identify indexes for a TCG dataPack: dHash then DINOv2.
 * Soft-fails per stage so Sync still completes if embeddings can't load.
 */
import type { CardEmbeddingIndexMeta } from "@/core/identify/cardEmbeddingIndex";
import type { CardVisualIndexFile } from "@/core/identify/cardVisualIndex";

import { runDataPackCardEmbeddingIndex } from "./embeddingIndexStep";
import { runDataPackCardVisualIndex } from "./visualIndexStep";

export async function runDataPackCardIdentifyIndexes(
  packId: string,
  opts?: {
    langs?: readonly string[];
    force?: boolean;
    limit?: number;
    onLog?: (line: string) => void;
  },
): Promise<{
  visual: CardVisualIndexFile | null;
  embedding: CardEmbeddingIndexMeta | null;
}> {
  const log = opts?.onLog ?? ((line: string) => console.log(line));
  let visual: CardVisualIndexFile | null = null;
  let embedding: CardEmbeddingIndexMeta | null = null;

  try {
    visual = await runDataPackCardVisualIndex(packId, {
      langs: opts?.langs,
      force: opts?.force,
      limit: opts?.limit,
      onLog: log,
    });
    if (visual.entries.length) {
      log(
        `── card visual index — ${visual.entries.length} face${visual.entries.length === 1 ? "" : "s"}`,
      );
    }
  } catch (err) {
    log(
      `── card visual index — skip : ${err instanceof Error ? err.message : err}`,
    );
    return { visual: null, embedding: null };
  }

  try {
    embedding = await runDataPackCardEmbeddingIndex(packId, {
      force: opts?.force,
      limit: opts?.limit,
      onLog: log,
    });
  } catch (err) {
    log(
      `── card embedding index — skip : ${err instanceof Error ? err.message : err}`,
    );
  }

  return { visual, embedding };
}
