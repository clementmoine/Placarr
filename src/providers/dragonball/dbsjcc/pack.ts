import path from "node:path";

import { definePackSyncedSources } from "@/providers/shared/syncedSources";

/** Disk / admin pack — under the Dragon Ball franchise tree. */
export const DBS_JCC_PACK_ID = "dragonball/jcc";
export const DBS_JCC_EFFECT_PACK_ID = "dbs-jcc";
export const DBS_JCC_PROVIDER_ID = "dbsjcc";
/** printKey game slug — distinct from Bandai Masters (`dbscg`) / Fusion World (`dbsfw`) / Lamincards (`dbslamincards`). */
export const DBS_JCC_PRINT_GAME = "dbsjcc";

export function dbsJccCuratedDir(): string {
  return path.join(
    process.cwd(),
    "src",
    "providers",
    "dragonball",
    DBS_JCC_PROVIDER_ID,
    "curated",
  );
}

const synced = definePackSyncedSources(DBS_JCC_PACK_ID);
/** Write target under `dataRoot()`. */
export const dbsJccSyncedSourcePath = synced.syncedSourcePath;
/** Read path — dataRoot first, then repo `cwd/data` fallback. */
export const dbsJccSourcePath = synced.sourcePath;
