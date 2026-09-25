import path from "node:path";

export const YUGIOH_PACK_ID = "yugioh";
export const YUGIOH_EFFECT_PACK_ID = "yugioh";
export const YUGIOH_PROVIDER_ID = "yugioh";
export const YUGIOH_PRINT_GAME = "yugioh";

export function yugiohCuratedDir(): string {
  return path.join(
    process.cwd(),
    "src",
    "providers",
    YUGIOH_PROVIDER_ID,
    "curated",
  );
}
