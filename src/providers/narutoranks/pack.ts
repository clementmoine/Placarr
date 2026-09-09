import path from "node:path";

/** Ligne Catalogue / data pack. */
export const NARUTO_RANKS_PACK_ID = "naruto/ninja-ranks";
export const NARUTO_RANKS_EFFECT_PACK_ID = "naruto-ninja-ranks";
export const NARUTO_RANKS_PROVIDER_ID = "narutoranks";

export function narutoRanksCuratedDir(): string {
  return path.join(
    process.cwd(),
    "src",
    "providers",
    NARUTO_RANKS_PROVIDER_ID,
    "curated",
  );
}
