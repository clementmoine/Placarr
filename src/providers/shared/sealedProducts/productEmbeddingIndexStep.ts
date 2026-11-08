/**
 * Rebuild the full-frame DINOv2 product embedding index during Sync.
 *
 * Runs after the product visual index. Soft-fail at the caller — Sync must
 * not die if ONNX/model download fails. Never uses CARD_ART_BAND.
 */
import { existsSync, statSync } from "node:fs";

import {
  buildProductEmbeddingIndex,
  loadProductEmbeddingIndex,
  productEmbeddingIndexMetaPath,
  type ProductEmbeddingIndexMeta,
} from "@/core/identify/productEmbeddingIndex";
import {
  loadProductVisualIndex,
  productVisualIndexPath,
} from "@/core/identify/productVisualIndex";

function embeddingLooksFresh(packId: string): ProductEmbeddingIndexMeta | null {
  const visual = loadProductVisualIndex(packId);
  const loaded = loadProductEmbeddingIndex(packId);
  if (!visual?.entries.length || !loaded?.meta.entries.length) return null;
  if (loaded.meta.entries.length !== visual.entries.length) return null;
  if (loaded.meta.cropMode !== "full") return null;

  const visualPath = productVisualIndexPath(packId);
  const embedPath = productEmbeddingIndexMetaPath(packId);
  if (!existsSync(visualPath) || !existsSync(embedPath)) return null;
  try {
    if (statSync(visualPath).mtimeMs > statSync(embedPath).mtimeMs) {
      return null;
    }
  } catch {
    return null;
  }
  return loaded.meta;
}

export async function runDataPackProductEmbeddingIndex(
  packId: string,
  opts?: {
    force?: boolean;
    limit?: number;
    onLog?: (line: string) => void;
  },
): Promise<ProductEmbeddingIndexMeta | null> {
  const log = opts?.onLog ?? ((line: string) => console.log(line));

  if (!opts?.force && opts?.limit == null) {
    const fresh = embeddingLooksFresh(packId);
    if (fresh) {
      log(
        `── product embedding index — fresh (${fresh.entries.length} vectors, skip)`,
      );
      return fresh;
    }
  }

  const visual = loadProductVisualIndex(packId);
  if (!visual?.entries.length) {
    log("── product embedding index — skip : no product visual index yet");
    return null;
  }

  const total =
    opts?.limit != null
      ? Math.min(opts.limit, visual.entries.length)
      : visual.entries.length;
  const reuseExisting = !opts?.force;
  log(
    `── product embedding index — building up to ${total} vectors (DINOv2 full-frame` +
      (reuseExisting ? ", incremental" : ", full") +
      ")…",
  );

  let lastPct = -1;
  const started = Date.now();
  const prior = reuseExisting ? loadProductEmbeddingIndex(packId) : null;
  const meta = await buildProductEmbeddingIndex({
    packId,
    entries: visual.entries,
    limit: opts?.limit,
    reuseExisting,
    onProgress: (done, n) => {
      const pct = Math.floor((done / Math.max(1, n)) * 100);
      if (pct !== lastPct && (pct % 10 === 0 || done === n)) {
        lastPct = pct;
        log(`── product embedding index — ${done}/${n} (${pct}%)`);
      }
    },
  });

  const unchanged = prior != null && meta.builtAt === prior.meta.builtAt;
  log(
    unchanged
      ? `── product embedding index — ${meta.entries.length} vectors unchanged, not rewritten (${Math.round((Date.now() - started) / 1000)}s)`
      : `── product embedding index — ${meta.entries.length} vectors → product-embedding-index.{json,f32,f16} (${Math.round((Date.now() - started) / 1000)}s)`,
  );
  return meta;
}
