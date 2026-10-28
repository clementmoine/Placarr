import path from "node:path";

import { packSyncedSourcePath } from "@/lib/packPaths";

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
    "naruto",
    NARUTO_MYTHOS_PROVIDER_ID,
    "curated",
  );
}

export function narutoMythosSyncedSourcePath(fileName: string): string {
  return packSyncedSourcePath(NARUTO_MYTHOS_PACK_ID, fileName);
}
