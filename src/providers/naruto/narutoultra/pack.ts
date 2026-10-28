import path from "node:path";

import { resolvePackSyncedSourcePath } from "@/lib/packPaths";

export const NARUTO_ULTRA_PACK_ID = "naruto/ultra-challenge";
export const NARUTO_ULTRA_EFFECT_PACK_ID = "naruto-ultra-challenge";
export const NARUTO_ULTRA_PROVIDER_ID = "narutoultra";

export function narutoUltraCuratedDir(): string {
  return path.join(
    process.cwd(),
    "src",
    "providers",
    "naruto",
    NARUTO_ULTRA_PROVIDER_ID,
    "curated",
  );
}

/** Synced crawl ledgers — `data/naruto/ultra-challenge/sources/<file>`. */
export function narutoUltraSyncedSourcePath(fileName: string): string {
  return resolvePackSyncedSourcePath(NARUTO_ULTRA_PACK_ID, fileName);
}
