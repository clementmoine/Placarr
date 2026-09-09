import path from "node:path";

export const DIGIMON_PACK_ID = "digimon";
export const DIGIMON_EFFECT_PACK_ID = "digimon";
export const DIGIMON_PROVIDER_ID = "digimon";
export const DIGIMON_PRINT_GAME = "digimon";

export function digimonCuratedDir(): string {
  return path.join(
    process.cwd(),
    "src",
    "providers",
    DIGIMON_PROVIDER_ID,
    "curated",
  );
}
