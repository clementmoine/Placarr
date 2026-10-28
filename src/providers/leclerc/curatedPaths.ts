import { existsSync } from "node:fs";
import path from "node:path";

import {
  packSyncedSourcePath,
  packSyncedSourcesDir,
  resolvePackSyncedSourcePath,
} from "@/lib/packPaths";

/** Family pack id for shared deals + synced source ledgers. */
export const LECLERC_FAMILY_PACK_ID = "leclerc";

/** Shared curated assets (backs, packshots) — server-only (`node:path`). */
export function leclercCuratedDir(): string {
  return path.join(process.cwd(), "src", "providers", "leclerc", "curated");
}

/** Synced crawl ledgers — write target under `data/leclerc/sources/`. */
export function leclercSyncedSourcePath(fileName: string): string {
  return packSyncedSourcePath(LECLERC_FAMILY_PACK_ID, fileName);
}

/** Read path — falls back to repo `cwd/data` when `PLACARR_DATA_DIR` is empty. */
export function leclercSourcePath(fileName: string): string {
  return resolvePackSyncedSourcePath(LECLERC_FAMILY_PACK_ID, fileName);
}

/** Read dir for synced ledgers (prefer live dataRoot, else repo fixtures). */
export function leclercSyncedSourcesDir(): string {
  const primary = packSyncedSourcesDir(LECLERC_FAMILY_PACK_ID);
  if (existsSync(primary)) return primary;
  const repo = path.join(process.cwd(), "data", "leclerc", "sources");
  if (existsSync(repo)) return repo;
  return primary;
}
