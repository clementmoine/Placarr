import path from "node:path";

import {
  packSyncedSourcePath,
  resolvePackSyncedSourcePath,
} from "@/lib/packPaths";

export const DBH_PACK_ID = "dragonball/heroes";
export const DBH_EFFECT_PACK_ID = "dbs-heroes";
export const DBH_PROVIDER_ID = "dbh";
export const DBH_PRINT_GAME = "dbh";

export function dbhCuratedDir(): string {
  return path.join(
    process.cwd(),
    "src",
    "providers",
    "dragonball",
    DBH_PROVIDER_ID,
    "curated",
  );
}

export function dbhSyncedSourcePath(fileName: string): string {
  return packSyncedSourcePath(DBH_PACK_ID, fileName);
}

export function dbhSourcePath(fileName: string): string {
  return resolvePackSyncedSourcePath(DBH_PACK_ID, fileName);
}

