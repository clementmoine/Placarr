/**
 * Synced Card Game ledgers under `data/naruto/cardgame/sources/`.
 * Keep out of `pack.ts` — effects import pack id constants for the client
 * foil graph and must not pull `node:fs` via `@/lib/packPaths`.
 */
import { resolvePackSyncedSourcePath } from "@/lib/packPaths";

import { NARUTO_CARDGAME_PACK_ID } from "./pack";

/** Synced crawl ledgers — `data/naruto/cardgame/sources/<file>`. */
export function narutoCardgameSyncedSourcePath(fileName: string): string {
  return resolvePackSyncedSourcePath(NARUTO_CARDGAME_PACK_ID, fileName);
}
