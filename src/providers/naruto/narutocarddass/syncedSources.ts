/**
 * Synced Carddass ledgers under `data/naruto/carddass/sources/`.
 * Digs / attested maps stay in `curated/sources/` (static import OK).
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { definePackSyncedSources } from "@/providers/shared/syncedSources";

import { NARUTO_PACK_ID } from "./packs";
import type { NarutoCarddassSyncedLedgers } from "./syncedSourceTypes";

const cache = new Map<string, unknown>();
const synced = definePackSyncedSources(NARUTO_PACK_ID);

function curatedSourcesDir(): string {
  return path.join(
    process.cwd(),
    "src",
    "providers",
    "naruto",
    "narutocarddass",
    "curated",
    "sources",
  );
}

/** Write target under `dataRoot()`. */
export const narutoCarddassSyncedSourcePath = synced.syncedSourcePath;

/**
 * Prefer synced data/ copy (incl. repo fallback when `PLACARR_DATA_DIR` is an
 * empty stub); then curated dig/attestation path.
 */
export function narutoCarddassSourcePath(fileName: string): string {
  const resolved = synced.sourcePath(fileName);
  if (existsSync(resolved)) return resolved;
  return path.join(curatedSourcesDir(), fileName);
}

/**
 * Cached JSON parse of a ledger: the synced `data/` copy when a Sync has
 * written one, else the versioned `curated/sources/` copy (ADR-006 — the
 * ledgers no Sync can rewrite are versioned, so boot never depends on data/).
 */
export function readNarutoCarddassSyncedSource<
  K extends keyof NarutoCarddassSyncedLedgers,
>(fileName: K): NarutoCarddassSyncedLedgers[K];
/** Ledger hors registre (Sync seule) : type explicite, `unknown` par défaut. */
export function readNarutoCarddassSyncedSource<T = unknown>(
  fileName: string,
): T;
export function readNarutoCarddassSyncedSource(fileName: string): unknown {
  const hit = cache.get(fileName);
  if (hit !== undefined) return hit;
  const p = narutoCarddassSourcePath(fileName);
  if (!existsSync(p)) {
    throw new Error(`missing synced Carddass source: ${fileName} (${p})`);
  }
  const data: unknown = JSON.parse(readFileSync(p, "utf8"));
  cache.set(fileName, data);
  return data;
}

/**
 * Ledger produced by a Sync step (lives only in data/): `null` until that step
 * has run once, so a fresh clone boots and the caller degrades to empty.
 */
export function readNarutoCarddassSyncedSourceIfPresent<T = unknown>(
  fileName: string,
): T | null {
  if (cache.has(fileName)) return cache.get(fileName) as T;
  if (!existsSync(narutoCarddassSourcePath(fileName))) return null;
  return readNarutoCarddassSyncedSource<T>(fileName);
}

/** Test helper — drop cache between cases that rewrite data/. */
export function resetNarutoCarddassSyncedSourceCache(): void {
  cache.clear();
}
