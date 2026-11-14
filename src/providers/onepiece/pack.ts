import path from "node:path";

export const ONEPIECE_PACK_ID = "onepiece";
export const ONEPIECE_EFFECT_PACK_ID = "onepiece";
export const ONEPIECE_PROVIDER_ID = "onepiece";
export const ONEPIECE_PRINT_GAME = "onepiece";

export function onepieceCuratedDir(): string {
  return path.join(
    process.cwd(),
    "src",
    "providers",
    ONEPIECE_PROVIDER_ID,
    "curated",
  );
}
