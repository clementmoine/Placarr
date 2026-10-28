import path from "node:path";

import {
  packSyncedSourcePath,
  resolvePackSyncedSourcePath,
} from "@/lib/packPaths";

export const NARUTO_DATA_CARDDASS_PACK_ID = "naruto/data-carddass";
export const NARUTO_DATA_CARDDASS_EFFECT_PACK_ID = "naruto-data-carddass";
export const NARUTO_DATA_CARDDASS_PROVIDER_ID = "narutodatacarddass";
/** Arcade Bandai — pas le jeu de table Carddass NI/TE/TA. */
export const NARUTO_DATA_CARDDASS_PRINT_GAME = "datacarddass";

export function narutoDataCarddassCuratedDir(): string {
  return path.join(
    process.cwd(),
    "src",
    "providers",
    "naruto",
    NARUTO_DATA_CARDDASS_PROVIDER_ID,
    "curated",
  );
}

/** Write target under `dataRoot()`. */
export function narutoDataCarddassSyncedSourcePath(fileName: string): string {
  return packSyncedSourcePath(NARUTO_DATA_CARDDASS_PACK_ID, fileName);
}

/** Read path — falls back to repo `cwd/data` when `PLACARR_DATA_DIR` is empty. */
export function narutoDataCarddassSourcePath(fileName: string): string {
  return resolvePackSyncedSourcePath(NARUTO_DATA_CARDDASS_PACK_ID, fileName);
}
