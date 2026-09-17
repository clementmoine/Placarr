import path from "node:path";

/** Disk / admin pack. */
export const BLEACH_SCB_PACK_ID = "bleach/scb";
export const BLEACH_SCB_EFFECT_PACK_ID = "bleach-scb";
export const BLEACH_SCB_PROVIDER_ID = "bleachscb";
export const BLEACH_SCB_PRINT_GAME = "bleachscb";

export function bleachScbCuratedDir(): string {
  return path.join(
    process.cwd(),
    "src",
    "providers",
    BLEACH_SCB_PROVIDER_ID,
    "curated",
  );
}
