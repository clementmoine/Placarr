/**
 * Synced Pokémon ledgers under `data/pokemon/sources/` (McDo Coleka, etc.).
 * Keep out of `paths.ts` — that module is pulled by Live foil index wiring.
 */
import { definePackSyncedSources } from "@/providers/shared/syncedSources";

import { POKEMON_PACK_ID } from "./paths";

const synced = definePackSyncedSources(POKEMON_PACK_ID);
/** Write target under `dataRoot()`. */
export const pokemonSyncedSourcePath = synced.syncedSourcePath;
/** Read path — dataRoot first, then repo `cwd/data` fallback. */
export const pokemonSourcePath = synced.sourcePath;
