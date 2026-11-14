/**
 * Post-Sync identify indexes for a TCG dataPack: card dHash → DINOv2, then
 * sealed-product full-frame indexes. Soft-fails per stage so Sync still
 * completes if embeddings can't load.
 */
import type { CardEmbeddingIndexMeta } from "@/core/identify/cardEmbeddingIndex";
import type { CardVisualIndexFile } from "@/core/identify/cardVisualIndex";
import type { ProductEmbeddingIndexMeta } from "@/core/identify/productEmbeddingIndex";
import type { ProductVisualIndexFile } from "@/core/identify/productVisualIndex";

import { runDataPackCardEmbeddingIndex } from "./embeddingIndexStep";
import { runDataPackCardVisualIndex } from "./visualIndexStep";
import { runDataPackProductEmbeddingIndex } from "@/providers/shared/sealedProducts/productEmbeddingIndexStep";
import { runDataPackProductVisualIndex } from "@/providers/shared/sealedProducts/productVisualIndexStep";

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
  productVisual: ProductVisualIndexFile | null;
  productEmbedding: ProductEmbeddingIndexMeta | null;
}> {
  const log = opts?.onLog ?? ((line: string) => console.log(line));
  let visual: CardVisualIndexFile | null = null;
  let embedding: CardEmbeddingIndexMeta | null = null;
  let productVisual: ProductVisualIndexFile | null = null;
  let productEmbedding: ProductEmbeddingIndexMeta | null = null;

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
  }

  if (visual?.entries.length) {
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
  }

  try {
    productVisual = await runDataPackProductVisualIndex(packId, {
      langs: opts?.langs,
      force: opts?.force,
      limit: opts?.limit,
      onLog: log,
    });
  } catch (err) {
    log(
      `── product visual index — skip : ${err instanceof Error ? err.message : err}`,
    );
  }

  if (productVisual?.entries.length) {
    try {
      productEmbedding = await runDataPackProductEmbeddingIndex(packId, {
        force: opts?.force,
        limit: opts?.limit,
        onLog: log,
      });
    } catch (err) {
      log(
        `── product embedding index — skip : ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  return { visual, embedding, productVisual, productEmbedding };
}
