import path from "node:path";

export const NARUTO_MYTHOS_PACK_ID = "naruto/mythos";
export const NARUTO_MYTHOS_EFFECT_PACK_ID = "naruto-mythos";
export const NARUTO_MYTHOS_PROVIDER_ID = "narutomythos";
/** Jeu distinct du Carddass / Ranks / Ultra — docs `naruto_carddass_tcg.md`. */
export const NARUTO_MYTHOS_PRINT_GAME = "mythos";

export function narutoMythosCuratedDir(): string {
  return path.join(
    process.cwd(),
    "src",
    "providers",
    NARUTO_MYTHOS_PROVIDER_ID,
    "curated",
  );
}
