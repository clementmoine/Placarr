import path from "node:path";

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
    NARUTO_DATA_CARDDASS_PROVIDER_ID,
    "curated",
  );
}
