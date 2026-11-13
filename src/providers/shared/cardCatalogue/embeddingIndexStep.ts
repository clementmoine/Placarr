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

/** Dense Sync progress: every 1% and at least every 1000 faces. */
export function shouldLogEmbeddingProgress(
  done: number,
  total: number,
  lastPct: number,
  lastDone: number,
): boolean {
  if (done === total) return true;
  const pct = Math.floor((done / Math.max(1, total)) * 100);
  if (pct !== lastPct) return true;
  if (done - lastDone >= 1000) return true;
  return false;
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
  let lastDone = 0;
  const started = Date.now();
  const prior = reuseExisting ? loadCardEmbeddingIndex(packId) : null;
  const meta = await buildCardEmbeddingIndex({
    packId,
    entries: visual.entries,
    limit: opts?.limit,
    reuseExisting,
    onProgress: (done, n) => {
      if (!shouldLogEmbeddingProgress(done, n, lastPct, lastDone)) return;
      lastPct = Math.floor((done / Math.max(1, n)) * 100);
      lastDone = done;
      log(`── card embedding index — ${done}/${n} (${lastPct}%)`);
    },
    onCheckpoint: (vectorCount) => {
      log(`── card embedding index — checkpoint ${vectorCount} vectors`);
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
