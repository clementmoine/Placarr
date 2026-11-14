/**
 * Disk status for camera identify indexes (dHash visual + CLIP embed).
 *
 * Admin corpora list calls this for **every** pack — must stay cheap:
 * never JSON.parse the full visual index, never load embedding f32 matrices.
 * Counts = `"printKey"` occurrences; stale = mtime / presence.
 */
import { existsSync, readFileSync, statSync } from "node:fs";

import {
  cardEmbeddingIndexBinPath,
  cardEmbeddingIndexMetaPath,
} from "@/core/identify/cardEmbeddingIndex";
import {
  cardVisualIndexCountPath,
  cardVisualIndexPath,
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

type StatusCache = {
  visualMtime: number;
  embedMetaMtime: number;
  embedBinMtime: number;
  status: CardIdentifyIndexStatus;
};

const statusCache = new Map<string, StatusCache>();

function countPrintKeyOccurrences(filePath: string): number {
  let text: string;
  try {
    text = readFileSync(filePath, "utf8");
  } catch {
    return 0;
  }
  let n = 0;
  let i = 0;
  const needle = '"printKey"';
  while ((i = text.indexOf(needle, i)) !== -1) {
    n += 1;
    i += needle.length;
  }
  return n;
}

/** Prefer `.count` sidecar written with the visual index. */
function readVisualEntryCount(packId: string, visualPath: string): number {
  const countPath = cardVisualIndexCountPath(packId);
  try {
    if (
      existsSync(countPath) &&
      mtimeOrZero(countPath) >= mtimeOrZero(visualPath)
    ) {
      const raw = readFileSync(countPath, "utf8").trim();
      const n = Number(raw);
      if (Number.isFinite(n) && n >= 0) return Math.floor(n);
    }
  } catch {
    /* fall through */
  }
  return countPrintKeyOccurrences(visualPath);
}

function peekEmbeddingModel(metaPath: string): string | null {
  try {
    // Model is near the top of the meta file — read a small prefix.
    const fd = readFileSync(metaPath, "utf8");
    const head = fd.slice(0, 512);
    const m = /"model"\s*:\s*"([^"]+)"/.exec(head);
    return m?.[1] ?? null;
  } catch {
    return null;
  }
}

function mtimeOrZero(filePath: string): number {
  try {
    return existsSync(filePath) ? statSync(filePath).mtimeMs : 0;
  } catch {
    return 0;
  }
}

export function cardIdentifyIndexStatus(
  packId: string,
): CardIdentifyIndexStatus {
  const visualPath = cardVisualIndexPath(packId);
  const embedMetaPath = cardEmbeddingIndexMetaPath(packId);
  const embedBinPath = cardEmbeddingIndexBinPath(packId);

  const visualMtime = mtimeOrZero(visualPath);
  const embedMetaMtime = mtimeOrZero(embedMetaPath);
  const embedBinMtime = mtimeOrZero(embedBinPath);

  const cached = statusCache.get(packId);
  if (
    cached &&
    cached.visualMtime === visualMtime &&
    cached.embedMetaMtime === embedMetaMtime &&
    cached.embedBinMtime === embedBinMtime
  ) {
    return cached.status;
  }

  const visualEntries =
    visualMtime > 0 ? readVisualEntryCount(packId, visualPath) : 0;
  const hasEmbedFiles = embedMetaMtime > 0 && embedBinMtime > 0;
  const embeddingEntries = hasEmbedFiles
    ? countPrintKeyOccurrences(embedMetaPath)
    : 0;
  const embeddingModel =
    embedMetaMtime > 0 ? peekEmbeddingModel(embedMetaPath) : null;

  let embeddingsStale = false;
  if (visualEntries > 0) {
    if (embeddingEntries === 0 || embeddingEntries !== visualEntries) {
      embeddingsStale = true;
    } else if (visualMtime > embedMetaMtime) {
      embeddingsStale = true;
    }
  }

  const status: CardIdentifyIndexStatus = {
    visualEntries,
    embeddingEntries,
    embeddingModel,
    embeddingsStale,
    hasVisual: visualEntries > 0,
  };
  statusCache.set(packId, {
    visualMtime,
    embedMetaMtime,
    embedBinMtime,
    status,
  });
  return status;
}

/** Test helper — drop memoized status. */
export function clearCardIdentifyIndexStatusCache(): void {
  statusCache.clear();
}
