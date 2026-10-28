import path from "node:path";

import { packSyncedSourcePath } from "@/lib/packPaths";

export const NARUTO_KAYOU_PACK_ID = "naruto/kayou";
export const NARUTO_KAYOU_EFFECT_PACK_ID = "naruto-kayou";
export const NARUTO_KAYOU_PROVIDER_ID = "narutokayou";
/** Jeu distinct du Carddass / Mythos — collectible CN, pas un TCG jouable. */
export const NARUTO_KAYOU_PRINT_GAME = "kayou";
/** Titres EN — pages tracker en anglais. */
export const KAYOU_TITLE_LANG = "en";

export function narutoKayouCuratedDir(): string {
  return path.join(
    process.cwd(),
    "src",
    "providers",
    "naruto",
    NARUTO_KAYOU_PROVIDER_ID,
    "curated",
  );
}

/** Synced crawl ledgers — `data/naruto/kayou/sources/<file>`. */
export function narutoKayouSyncedSourcePath(fileName: string): string {
  return packSyncedSourcePath(NARUTO_KAYOU_PACK_ID, fileName);
}
