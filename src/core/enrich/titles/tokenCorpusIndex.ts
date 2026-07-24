/**
 * Durable title-token DF index (offline RawName refresh).
 * Scan path loads an existing file only — never queries Prisma at resolve time.
 */
import { existsSync, readFileSync, promises as fs } from "node:fs";
import path from "node:path";

import {
  buildTokenDocumentFrequency,
  type CorpusTokenStats,
} from "@/core/enrich/titles/tokenCorpusIdf";

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

function cacheDir(): string {
  return (
    process.env.TOKEN_CORPUS_CACHE_DIR?.trim() ||
    path.join(process.cwd(), ".cache", "title-idf")
  );
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

export function parseTokenCorpusStats(
  raw: unknown,
): CorpusTokenStats | null {
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

export async function writeTokenCorpusIndex(
  stats: CorpusTokenStats,
  filePath = tokenCorpusIndexPath(),
): Promise<string> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const payload = serializeTokenCorpusStats(stats);
  await fs.writeFile(filePath, `${JSON.stringify(payload)}\n`, "utf8");
  memoryStats = stats;
  loadedPath = filePath;
  return filePath;
}

export async function loadTokenCorpusIndex(
  filePath = tokenCorpusIndexPath(),
): Promise<CorpusTokenStats | null> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const stats = parseTokenCorpusStats(JSON.parse(raw));
    memoryStats = stats;
    loadedPath = filePath;
    return stats;
  } catch {
    memoryStats = null;
    loadedPath = filePath;
    return null;
  }
}

/**
 * Lazy open of the prebuilt index. Missing / corrupt file ⇒ null (safe:
 * unknown tokens stay as signal).
 */
export function getGlobalCorpusTokenStats(): CorpusTokenStats | null {
  if (memoryStats !== undefined) return memoryStats;

  const filePath = tokenCorpusIndexPath();
  if (!existsSync(filePath)) {
    memoryStats = null;
    loadedPath = filePath;
    return null;
  }

  try {
    // Sync read keeps resolve paths free of async; index is small JSON.
    const raw = readFileSync(filePath, "utf8");
    memoryStats = parseTokenCorpusStats(JSON.parse(raw));
    loadedPath = filePath;
    return memoryStats;
  } catch {
    memoryStats = null;
    loadedPath = filePath;
    return null;
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
}

export function __setTokenCorpusIndexForTests(
  stats: CorpusTokenStats | null,
): void {
  memoryStats = stats;
  loadedPath = "memory://test";
}

export function __tokenCorpusIndexPathsForTests() {
  return {
    cacheDir: cacheDir(),
    indexPath: tokenCorpusIndexPath(),
    loadedPath,
    exists: existsSync,
  };
}
