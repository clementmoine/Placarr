import path from "node:path";

import { definePackSyncedSources } from "@/providers/shared/syncedSources";

/** Ligne Catalogue / data pack. */
export const NARUTO_RANKS_PACK_ID = "naruto/ninja-ranks";
export const NARUTO_RANKS_EFFECT_PACK_ID = "naruto-ninja-ranks";
export const NARUTO_RANKS_PROVIDER_ID = "narutoranks";

export function narutoRanksCuratedDir(): string {
  return path.join(
    process.cwd(),
    "src",
    "providers",
    "naruto",
    NARUTO_RANKS_PROVIDER_ID,
    "curated",
  );
}

const synced = definePackSyncedSources(NARUTO_RANKS_PACK_ID);
/** Write target under `dataRoot()`. */
export const narutoRanksSyncedSourcePath = synced.syncedSourcePath;
/** Read path — dataRoot first, then repo `cwd/data` fallback. */
export const narutoRanksSourcePath = synced.sourcePath;
