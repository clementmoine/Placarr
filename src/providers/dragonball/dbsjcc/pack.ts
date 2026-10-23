import path from "node:path";

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
