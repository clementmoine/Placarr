/**
 * Rebuild the DINOv2 embedding index for a catalogue dataPack during Sync.
 *
 * Runs after the dHash visual index. Skips when already as fresh as
 * `card-visual-index.json` (same entry count + newer mtime — the visual step
 * only rewrites its file when a face changed). Otherwise incremental on face
 * fingerprints; untouched index files keep their mtime. Soft-fail at the
 * caller — Sync must not die if ONNX/model download fails.
 */
import { existsSync, statSync } from "node:fs";

import {
  buildCardEmbeddingIndex,
  cardEmbeddingIndexMetaPath,
  loadCardEmbeddingIndex,
  type CardEmbeddingIndexMeta,
} from "@/core/identify/cardEmbeddingIndex";
import {
  cardVisualIndexPath,
  loadCardVisualIndex,
} from "@/core/identify/cardVisualIndex";

function embeddingLooksFresh(packId: string): CardEmbeddingIndexMeta | null {
  const visual = loadCardVisualIndex(packId);
  const loaded = loadCardEmbeddingIndex(packId);
  if (!visual?.entries.length || !loaded?.meta.entries.length) return null;
  if (loaded.meta.entries.length !== visual.entries.length) return null;

  const visualPath = cardVisualIndexPath(packId);
  const embedPath = cardEmbeddingIndexMetaPath(packId);
  if (!existsSync(visualPath) || !existsSync(embedPath)) return null;
  try {
    // Rebuild when the visual index moved ahead of the embedding sidecar.
    if (statSync(visualPath).mtimeMs > statSync(embedPath).mtimeMs) {
      return null;
    }
  } catch {
    return null;
  }
  return loaded.meta;
}

export async function runDataPackCardEmbeddingIndex(
  packId: string,
  opts?: {
    force?: boolean;
    limit?: number;
    onLog?: (line: string) => void;
  },
): Promise<CardEmbeddingIndexMeta | null> {
  const log = opts?.onLog ?? ((line: string) => console.log(line));

  if (!opts?.force && opts?.limit == null) {
    const fresh = embeddingLooksFresh(packId);
    if (fresh) {
      log(
        `── card embedding index — fresh (${fresh.entries.length} vectors, skip)`,
      );
      return fresh;
    }
  }

  const visual = loadCardVisualIndex(packId);
  if (!visual?.entries.length) {
    log("── card embedding index — skip : no visual index yet");
    return null;
  }

  const total =
    opts?.limit != null
      ? Math.min(opts.limit, visual.entries.length)
      : visual.entries.length;
  const reuseExisting = !opts?.force;
  log(
    `── card embedding index — building up to ${total} vectors (DINOv2` +
      (reuseExisting ? ", incremental" : ", full") +
      ")…",
  );

  let lastPct = -1;
  const started = Date.now();
  const prior = reuseExisting ? loadCardEmbeddingIndex(packId) : null;
  const meta = await buildCardEmbeddingIndex({
    packId,
    entries: visual.entries,
    limit: opts?.limit,
    reuseExisting,
    onProgress: (done, n) => {
      const pct = Math.floor((done / Math.max(1, n)) * 100);
      if (pct !== lastPct && (pct % 10 === 0 || done === n)) {
        lastPct = pct;
        log(`── card embedding index — ${done}/${n} (${pct}%)`);
      }
    },
  });

  const unchanged = prior != null && meta.builtAt === prior.meta.builtAt;
  log(
    unchanged
      ? `── card embedding index — ${meta.entries.length} vectors unchanged, not rewritten (${Math.round((Date.now() - started) / 1000)}s)`
      : `── card embedding index — ${meta.entries.length} vectors → card-embedding-index.{json,f32,f16} (${Math.round((Date.now() - started) / 1000)}s)`,
  );
  return meta;
}
