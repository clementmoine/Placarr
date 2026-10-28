import path from "node:path";

/**
 * Bandai Card Games — Naruto Card Game (mondial, été 2027).
 * Constants + curated dir only — synced ledger paths live in
 * `syncedSources.ts` so the effects client graph can import pack ids
 * without pulling `node:fs` via `@/lib/packPaths`.
 */
export const NARUTO_CARDGAME_PACK_ID = "naruto/cardgame";
export const NARUTO_CARDGAME_EFFECT_PACK_ID = "naruto-cardgame";
export const NARUTO_CARDGAME_PROVIDER_ID = "narutocardgame";
/** Jeu propre — ne croise pas le Carddass / CCG legacy (`naruto`). */
export const NARUTO_CARDGAME_PRINT_GAME = "narutocardgame";

export function narutoCardgameCuratedDir(): string {
  return path.join(
    process.cwd(),
    "src",
    "providers",
    "naruto",
    NARUTO_CARDGAME_PROVIDER_ID,
    "curated",
  );
}
