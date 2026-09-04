import path from "node:path";

export const NARUTO_DEFI_NINJA_PACK_ID = "naruto/defi-ninja";
export const NARUTO_DEFI_NINJA_EFFECT_PACK_ID = "naruto-defi-ninja";
export const NARUTO_DEFI_NINJA_PROVIDER_ID = "narutodefininja";
/** Jeu distinct du Carddass / Ultra Challenge / Mythos / Data Carddass. */
export const NARUTO_DEFI_NINJA_PRINT_GAME = "definija";

export function narutoDefiNinjaCuratedDir(): string {
  return path.join(
    process.cwd(),
    "src",
    "providers",
    NARUTO_DEFI_NINJA_PROVIDER_ID,
    "curated",
  );
}
