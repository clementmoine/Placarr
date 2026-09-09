import path from "node:path";

export const NARUTO_ULTRA_PACK_ID = "naruto/ultra-challenge";
export const NARUTO_ULTRA_EFFECT_PACK_ID = "naruto-ultra-challenge";
export const NARUTO_ULTRA_PROVIDER_ID = "narutoultra";

export function narutoUltraCuratedDir(): string {
  return path.join(
    process.cwd(),
    "src",
    "providers",
    NARUTO_ULTRA_PROVIDER_ID,
    "curated",
  );
}
