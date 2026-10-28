import path from "node:path";

import { resolvePackSyncedSourcePath } from "@/lib/packPaths";

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

/** Synced crawl ledgers — `data/naruto/ninja-ranks/sources/<file>`. */
export function narutoRanksSyncedSourcePath(fileName: string): string {
  return resolvePackSyncedSourcePath(NARUTO_RANKS_PACK_ID, fileName);
}
