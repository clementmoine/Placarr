import path from "node:path";

export const MTG_PACK_ID = "mtg";
export const MTG_EFFECT_PACK_ID = "mtg";
export const MTG_PROVIDER_ID = "mtg";
export const MTG_PRINT_GAME = "mtg";

export function mtgCuratedDir(): string {
  return path.join(
    process.cwd(),
    "src",
    "providers",
    MTG_PROVIDER_ID,
    "curated",
  );
}
