/** Shared colour / language token groups for title matching. */
export const TITLE_TOKEN_EQUIVALENT_GROUPS: readonly (readonly string[])[] = [
  ["jaune", "yellow"],
  ["rouge", "red"],
  ["bleu", "blue"],
  ["vert", "green"],
  ["argent", "silver"],
  ["or", "gold"],
  ["noir", "black"],
  ["blanc", "white"],
  ["criquet", "cricket"],
  ["pokemon", "pokémon"],
  ["legende", "legend"],
  ["cretins", "crétins"],
  ["cretin", "crétin"],
  ["pit", "pitt"],
];

/** Multi-word FR/EN subtitle phrases for cross-language provider search. */
export const TITLE_PHRASE_EQUIVALENT_GROUPS: readonly (readonly string[])[] = [
  ["destiny le roi des corrompus", "destiny: the taken king"],
  ["le roi des corrompus", "the taken king"],
  ["roi des corrompus", "taken king"],
  ["les chevaliers de baphomet", "broken sword"],
  ["chevaliers de baphomet", "broken sword"],
  ["la malediction du serpent", "the serpent's curse"],
  ["la malédiction du serpent", "the serpent's curse"],
  ["malediction du serpent", "serpent's curse"],
  ["l'aube du ragnarok", "dawn of ragnarok"],
  ["laube du ragnarok", "dawn of ragnarok"],
  ["aube du ragnarok", "dawn of ragnarok"],
  ["le film : le jeu vidéo", "movie video game"],
  ["le film le jeu video", "movie video game"],
];

export function titleTokensEquivalent(a: string, b: string): boolean {
  if (a === b) return true;
  return TITLE_TOKEN_EQUIVALENT_GROUPS.some(
    (group) => group.includes(a) && group.includes(b),
  );
}

export function titleTokenPresentInSet(
  token: string,
  titleTokens: Set<string>,
): boolean {
  if (titleTokens.has(token)) return true;
  return TITLE_TOKEN_EQUIVALENT_GROUPS.some(
    (group) =>
      group.includes(token) && group.some((alt) => titleTokens.has(alt)),
  );
}
