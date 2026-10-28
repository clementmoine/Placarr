import path from "node:path";

import {
  packSyncedSourcePath,
  resolvePackSyncedSourcePath,
} from "@/lib/packPaths";

/** Disk / admin pack — under the Dragon Ball franchise tree. */
export const DBS_LAMINCARDS_PACK_ID = "dragonball/lamincards";
export const DBS_LAMINCARDS_EFFECT_PACK_ID = "dbs-lamincards";
export const DBS_LAMINCARDS_PROVIDER_ID = "dbslamincards";
/** printKey game slug — distinct from Bandai Masters (`dbscg`) / Fusion World. */
export const DBS_LAMINCARDS_PRINT_GAME = "dbslamincards";

export function dbsLamincardsCuratedDir(): string {
  return path.join(
    process.cwd(),
    "src",
    "providers",
    "dragonball",
    DBS_LAMINCARDS_PROVIDER_ID,
    "curated",
  );
}

export function dbsLamincardsSyncedSourcePath(fileName: string): string {
  return packSyncedSourcePath(DBS_LAMINCARDS_PACK_ID, fileName);
}

export function dbsLamincardsSourcePath(fileName: string): string {
  return resolvePackSyncedSourcePath(DBS_LAMINCARDS_PACK_ID, fileName);
}
