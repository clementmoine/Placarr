import path from "node:path";

/** Disk / admin pack — under the Dragon Ball franchise tree. */
export const DBS_LAMINCARDS_PACK_ID = "dbs/lamincards";
export const DBS_LAMINCARDS_EFFECT_PACK_ID = "dbs-lamincards";
export const DBS_LAMINCARDS_PROVIDER_ID = "dbslamincards";
/** printKey game slug — distinct from Bandai Masters (`dbscg`) / Fusion World. */
export const DBS_LAMINCARDS_PRINT_GAME = "dbslamincards";

export function dbsLamincardsCuratedDir(): string {
  return path.join(
    process.cwd(),
    "src",
    "providers",
    DBS_LAMINCARDS_PROVIDER_ID,
    "curated",
  );
}
