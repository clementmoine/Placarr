/**
 * Placarr printKey `game` → CardNexus `gameId`.
 * Only games with a live CardNexus catalogue entry.
 */

/** CardNexus catalogue game ids we know how to price. */
export type CardnexusGameId =
  | "lorcana"
  | "pokemon"
  | "pokemon-japan"
  | "ygo"
  | "mtg"
  | "onepiece"
  | "naruto-mythos"
  | "dbs-fusion"
  | "dbs-masters";

const PRINT_GAME_TO_CARDNEXUS: Readonly<Record<string, CardnexusGameId>> = {
  lorcana: "lorcana",
  pokemon: "pokemon",
  yugioh: "ygo",
  mtg: "mtg",
  onepiece: "onepiece",
  narutomythos: "naruto-mythos",
  dbsfw: "dbs-fusion",
  dbscg: "dbs-masters",
};

export function cardnexusGameIdForPrintGame(
  printGame: string | null | undefined,
): CardnexusGameId | null {
  const g = printGame?.trim().toLowerCase() ?? "";
  if (!g) return null;
  return PRINT_GAME_TO_CARDNEXUS[g] ?? null;
}

export function supportedPrintGames(): readonly string[] {
  return Object.keys(PRINT_GAME_TO_CARDNEXUS);
}
