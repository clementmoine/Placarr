import path from "node:path";

import { definePackSyncedSources } from "@/providers/shared/syncedSources";

/** Disk / admin pack. */
export const DBH_PACK_ID = "dragonball/heroes";
export const DBH_EFFECT_PACK_ID = "dbs-heroes";
export const DBH_PROVIDER_ID = "dbh";
export const DBH_PRINT_GAME = "dbh";

export function dbhCuratedDir(): string {
  return path.join(
    process.cwd(),
    "src",
    "providers",
    "dragonball",
    DBH_PROVIDER_ID,
    "curated",
  );
}

const synced = definePackSyncedSources(DBH_PACK_ID);
/** Write target under `dataRoot()`. */
export const dbhSyncedSourcePath = synced.syncedSourcePath;
/** Read path — dataRoot first, then repo `cwd/data` fallback. */
export const dbhSourcePath = synced.sourcePath;
