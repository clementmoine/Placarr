/**
 * Synced Carddass ledgers under `data/naruto/carddass/sources/`.
 * Digs / attested maps stay in `curated/sources/` (static import OK).
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { definePackSyncedSources } from "@/providers/shared/syncedSources";

import { NARUTO_PACK_ID } from "./packs";

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

/** Cached JSON parse of a synced (rejouable) ledger. */
export function readNarutoCarddassSyncedSource<T = any>(
  fileName: string,
): T {
  const hit = cache.get(fileName);
  if (hit !== undefined) return hit as T;
  const p = synced.sourcePath(fileName);
  if (!existsSync(p)) {
    throw new Error(`missing synced Carddass source: ${fileName} (${p})`);
  }
  const data = JSON.parse(readFileSync(p, "utf8")) as T;
  cache.set(fileName, data);
  return data;
}

/** Test helper — drop cache between cases that rewrite data/. */
export function resetNarutoCarddassSyncedSourceCache(): void {
  cache.clear();
}
