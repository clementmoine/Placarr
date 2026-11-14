/**
 * Placarr printKey `game` → CardNexus `gameId`(s).
 *
 * Only games with a live CardNexus catalogue entry. Order matters when a
 * print game maps to several catalogues (EN then JA / OCG): first hit wins
 * when the expansion resolves; callers can force a locale via language.
 */

/** CardNexus catalogue game ids we know how to price / enrich. */
export type CardnexusGameId =
  | "lorcana"
  | "pokemon"
  | "pokemon-japan"
  | "ygo"
  | "ygo-ocg"
  | "mtg"
  | "onepiece"
  | "naruto-mythos"
  | "dbs-fusion"
  | "dbs-masters"
  | "fab"
  | "swu"
  | "riftbound"
  | "sorcery"
  | "gundam"
  | "grand-archive"
  | "rise"
  | "cyberpunk"
  | "eoa"
  | "chrono-core"
  | "palworld";

/**
 * Primary Placarr printGame → default CardNexus game (EN / international).
 * Locale forks (pokemon-japan, ygo-ocg) are chosen in {@link cardnexusGameIdsForPrint}.
 */
const PRINT_GAME_TO_CARDNEXUS: Readonly<Record<string, CardnexusGameId>> = {
  lorcana: "lorcana",
  pokemon: "pokemon",
  yugioh: "ygo",
  mtg: "mtg",
  onepiece: "onepiece",
  narutomythos: "naruto-mythos",
  /** Placarr printGame for Mythos TCG (`mythos:…` printKeys). */
  mythos: "naruto-mythos",
  dbsfw: "dbs-fusion",
  dbscg: "dbs-masters",
  /** Reserved for future Placarr lines — mapped so the API is ready. */
  fab: "fab",
  fleshblood: "fab",
  swu: "swu",
  starwarsunlimited: "swu",
  riftbound: "riftbound",
  sorcery: "sorcery",
  gundam: "gundam",
  grandarchive: "grand-archive",
  rise: "rise",
  cyberpunk: "cyberpunk",
  eoa: "eoa",
  echoesofastra: "eoa",
  chronocore: "chrono-core",
  palworld: "palworld",
};

export function cardnexusGameIdForPrintGame(
  printGame: string | null | undefined,
): CardnexusGameId | null {
  const g = printGame?.trim().toLowerCase() ?? "";
  if (!g) return null;
  return PRINT_GAME_TO_CARDNEXUS[g] ?? null;
}

/**
 * Ordered CardNexus catalogues to try for a print.
 * Japanese prints prefer the JA / OCG catalogue; otherwise EN first with a
 * JA fallback so exclusive expansions still resolve.
 */
export function cardnexusGameIdsForPrint(opts: {
  printGame: string | null | undefined;
  language?: string | null;
}): CardnexusGameId[] {
  const printGame = opts.printGame?.trim().toLowerCase() ?? "";
  const lang = opts.language?.trim().toLowerCase() ?? "";
  const primary = cardnexusGameIdForPrintGame(printGame);
  if (!primary) return [];

  if (printGame === "pokemon") {
    if (lang === "ja" || lang === "jp") return ["pokemon-japan"];
    return ["pokemon", "pokemon-japan"];
  }
  if (printGame === "yugioh") {
    if (lang === "ja" || lang === "jp") return ["ygo-ocg", "ygo"];
    return ["ygo", "ygo-ocg"];
  }
  return [primary];
}

export function supportedPrintGames(): readonly string[] {
  return Object.keys(PRINT_GAME_TO_CARDNEXUS);
}

/** Every CardNexus game id we may query (incl. locale forks). */
export function supportedCardnexusGameIds(): readonly CardnexusGameId[] {
  return [
    "lorcana",
    "pokemon",
    "pokemon-japan",
    "ygo",
    "ygo-ocg",
    "mtg",
    "onepiece",
    "naruto-mythos",
    "dbs-fusion",
    "dbs-masters",
    "fab",
    "swu",
    "riftbound",
    "sorcery",
    "gundam",
    "grand-archive",
    "rise",
    "cyberpunk",
    "eoa",
    "chrono-core",
    "palworld",
  ];
}
