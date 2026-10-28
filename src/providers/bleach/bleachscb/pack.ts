import path from "node:path";

import {
  packSyncedSourcePath,
  resolvePackSyncedSourcePath,
} from "@/lib/packPaths";

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
    "bleach",
    BLEACH_SCB_PROVIDER_ID,
    "curated",
  );
}

export function bleachScbSyncedSourcePath(fileName: string): string {
  return packSyncedSourcePath(BLEACH_SCB_PACK_ID, fileName);
}

export function bleachScbSourcePath(fileName: string): string {
  return resolvePackSyncedSourcePath(BLEACH_SCB_PACK_ID, fileName);
}

