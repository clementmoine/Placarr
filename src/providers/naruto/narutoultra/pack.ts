import path from "node:path";

import { definePackSyncedSources } from "@/providers/shared/syncedSources";

export const NARUTO_ULTRA_PACK_ID = "naruto/ultra-challenge";
export const NARUTO_ULTRA_EFFECT_PACK_ID = "naruto-ultra-challenge";
export const NARUTO_ULTRA_PROVIDER_ID = "narutoultra";

export function narutoUltraCuratedDir(): string {
  return path.join(
    process.cwd(),
    "src",
    "providers",
    "naruto",
    NARUTO_ULTRA_PROVIDER_ID,
    "curated",
  );
}

const synced = definePackSyncedSources(NARUTO_ULTRA_PACK_ID);
/** Write target under `dataRoot()`. */
export const narutoUltraSyncedSourcePath = synced.syncedSourcePath;
/** Read path — dataRoot first, then repo `cwd/data` fallback. */
export const narutoUltraSourcePath = synced.sourcePath;
