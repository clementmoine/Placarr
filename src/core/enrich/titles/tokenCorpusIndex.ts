/**
 * Durable title-token DF index (offline RawName refresh).
 * Scan path loads an existing file only — never queries Prisma at resolve time.
 */
import { existsSync, readFileSync, statSync, promises as fs } from "node:fs";
import path from "node:path";

import {
  buildTokenDocumentFrequency,
  type CorpusTokenStats,
} from "@/core/enrich/titles/tokenCorpusIdf";
import { titleIdfDir } from "@/lib/runtimeData";

export const TOKEN_CORPUS_INDEX_SCHEMA_VERSION = 1;

type TokenCorpusIndexFile = {
  schemaVersion: number;
  docCount: number;
  /** token → document frequency */
  documentFrequency: Record<string, number>;
  builtAt?: string;
};

let memoryStats: CorpusTokenStats | null | undefined;
let loadedPath: string | null = null;
let loadedMtimeMs: number | null = null;

function cacheDir(): string {
  return titleIdfDir();
}

export function tokenCorpusIndexPath(): string {
  const custom = process.env.TOKEN_CORPUS_INDEX_PATH?.trim();
  if (custom) return custom;
  return path.join(cacheDir(), "token-df.json");
}

export function serializeTokenCorpusStats(
  stats: CorpusTokenStats,
  builtAt = new Date().toISOString(),
): TokenCorpusIndexFile {
  const documentFrequency: Record<string, number> = {};
  for (const [token, df] of stats.documentFrequency) {
    documentFrequency[token] = df;
  }
  return {
    schemaVersion: TOKEN_CORPUS_INDEX_SCHEMA_VERSION,
    docCount: stats.docCount,
    documentFrequency,
    builtAt,
  };
}

export function parseTokenCorpusStats(raw: unknown): CorpusTokenStats | null {
  if (!raw || typeof raw !== "object") return null;
  const file = raw as Partial<TokenCorpusIndexFile>;
  if (file.schemaVersion !== TOKEN_CORPUS_INDEX_SCHEMA_VERSION) return null;
  if (typeof file.docCount !== "number" || file.docCount < 0) return null;
  if (!file.documentFrequency || typeof file.documentFrequency !== "object") {
    return null;
  }

  const documentFrequency = new Map<string, number>();
  for (const [token, df] of Object.entries(file.documentFrequency)) {
    if (typeof df !== "number" || df <= 0) continue;
    const key = token.trim().toLowerCase();
    if (!key) continue;
    documentFrequency.set(key, df);
  }

  return { docCount: file.docCount, documentFrequency };
}

/** Build durable stats from a bag of titles (typically RawName.value). */
export function buildTokenCorpusIndexFromTitles(
  titles: string[],
): CorpusTokenStats {
  return buildTokenDocumentFrequency(titles);
}

function rememberLoaded(
  filePath: string,
  stats: CorpusTokenStats | null,
  mtimeMs: number | null,
): CorpusTokenStats | null {
  memoryStats = stats;
  loadedPath = filePath;
  loadedMtimeMs = mtimeMs;
  return stats;
}

export async function writeTokenCorpusIndex(
  stats: CorpusTokenStats,
  filePath = tokenCorpusIndexPath(),
): Promise<string> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const payload = serializeTokenCorpusStats(stats);
  await fs.writeFile(filePath, `${JSON.stringify(payload)}\n`, "utf8");
  const mtimeMs = existsSync(filePath) ? statSync(filePath).mtimeMs : null;
  rememberLoaded(filePath, stats, mtimeMs);
  return filePath;
}

export async function loadTokenCorpusIndex(
  filePath = tokenCorpusIndexPath(),
): Promise<CorpusTokenStats | null> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const stats = parseTokenCorpusStats(JSON.parse(raw));
    const mtimeMs = existsSync(filePath) ? statSync(filePath).mtimeMs : null;
    return rememberLoaded(filePath, stats, mtimeMs);
  } catch {
    return rememberLoaded(filePath, null, null);
  }
}

/**
 * Lazy open of the prebuilt index. Reloads when the file mtime changes so a
 * background `title-idf:update` is visible without process restart.
 * Missing / corrupt file ⇒ null (safe: unknown tokens stay as signal).
 */
export function getGlobalCorpusTokenStats(): CorpusTokenStats | null {
  // In-memory test override (no durable file).
  if (loadedPath === "memory://test") {
    return memoryStats ?? null;
  }

  const filePath = tokenCorpusIndexPath();
  if (!existsSync(filePath)) {
    return rememberLoaded(filePath, null, null);
  }

  let mtimeMs: number;
  try {
    mtimeMs = statSync(filePath).mtimeMs;
  } catch {
    return rememberLoaded(filePath, null, null);
  }

  if (
    memoryStats !== undefined &&
    loadedPath === filePath &&
    loadedMtimeMs === mtimeMs
  ) {
    return memoryStats;
  }

  try {
    const raw = readFileSync(filePath, "utf8");
    return rememberLoaded(
      filePath,
      parseTokenCorpusStats(JSON.parse(raw)),
      mtimeMs,
    );
  } catch {
    return rememberLoaded(filePath, null, null);
  }
}

/** Prefer durable global DF when present; else in-memory batch stats. */
export function resolveCorpusTokenStats(
  batchStats: CorpusTokenStats,
): CorpusTokenStats {
  const global = getGlobalCorpusTokenStats();
  if (global && global.docCount > 0) return global;
  return batchStats;
}

export function __resetTokenCorpusIndexForTests(): void {
  memoryStats = undefined;
  loadedPath = null;
  loadedMtimeMs = null;
}

export function __setTokenCorpusIndexForTests(
  stats: CorpusTokenStats | null,
): void {
  memoryStats = stats;
  loadedPath = "memory://test";
  loadedMtimeMs = null;
}

export function __tokenCorpusIndexPathsForTests() {
  return {
    cacheDir: cacheDir(),
    indexPath: tokenCorpusIndexPath(),
    loadedPath,
    loadedMtimeMs,
    exists: existsSync,
  };
}
