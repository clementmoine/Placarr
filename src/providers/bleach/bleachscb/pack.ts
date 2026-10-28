import path from "node:path";

import { definePackSyncedSources } from "@/providers/shared/syncedSources";

/** Disk / admin pack. */
export const BLEACH_SCB_PACK_ID = "bleach/scb";
export const BLEACH_SCB_EFFECT_PACK_ID = "bleach-scb";
export const BLEACH_SCB_PROVIDER_ID = "bleachscb";
export const BLEACH_SCB_PRINT_GAME = "bleachscb";

export function bleachScbCuratedDir(): string {
  return path.join(
    process.cwd(),
    "src",
    "providers",
    "bleach",
    BLEACH_SCB_PROVIDER_ID,
    "curated",
  );
}

const synced = definePackSyncedSources(BLEACH_SCB_PACK_ID);
/** Write target under `dataRoot()`. */
export const bleachScbSyncedSourcePath = synced.syncedSourcePath;
/** Read path — dataRoot first, then repo `cwd/data` fallback. */
export const bleachScbSourcePath = synced.sourcePath;
