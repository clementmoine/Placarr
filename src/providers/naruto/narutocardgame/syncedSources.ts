/**
 * Synced Card Game ledgers under `data/naruto/cardgame/sources/`.
 * Keep out of `pack.ts` — effects import pack id constants for the client
 * foil graph and must not pull `node:fs` via `@/lib/packPaths`.
 */
import { definePackSyncedSources } from "@/providers/shared/syncedSources";

import { NARUTO_CARDGAME_PACK_ID } from "./pack";

const synced = definePackSyncedSources(NARUTO_CARDGAME_PACK_ID);
/** Write target under `dataRoot()`. */
export const narutoCardgameSyncedSourcePath = synced.syncedSourcePath;
/** Read path — dataRoot first, then repo `cwd/data` fallback. */
export const narutoCardgameSourcePath = synced.sourcePath;
