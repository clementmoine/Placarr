/**
 * Vocabulaire d'équivalence FR↔EN pour le matching de titres.
 *
 * RÈGLE (voir docs/word_list_audit.md) : uniquement des équivalences de
 * DICTIONNAIRE (couleurs, mots communs) — jamais le sous-titre ou le nom d'un
 * produit précis. L'équivalence par-produit vient des DONNÉES : alternate
 * names / regionalTitles des providers (IGDB, ScreenScraper, LaunchBox…),
 * comparés via les jeux d'alias des deux côtés du match.
 *
 * Les variantes d'orthographe (accents, consonnes finales doublées « Pitt » →
 * « Pit ») sont traitées structurellement par `normalizeEquivalentToken`, pas
 * par des paires nommées.
 */
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
  ["legende", "legend"],
];

/** Multi-word FR/EN phrases — dictionary-level only, same rule as above. */
export const TITLE_PHRASE_EQUIVALENT_GROUPS: readonly (readonly string[])[] = [
  ["le film : le jeu vidéo", "le film le jeu video", "movie video game"],
  [
    "naissance d'un nouveau monde",
    "naissance d’un nouveau monde",
    "birth of a new world",
    "birth of a new World",
  ],
  ["la saga americaine", "la saga américaine", "the american saga"],
];

/** Dedupe stylized doubled tail consonants ("Pitt" → "Pit", "Zapp" → "Zap"). */
export function dedupeTokenTailConsonants(word: string): string {
  return word
    .replace(/tt$/i, "t")
    .replace(/pp$/i, "p")
    .replace(/ff$/i, "f")
    .replace(/ck$/i, "k");
}

/**
 * Forme canonique d'un token pour l'équivalence : accents retirés, casse
 * neutralisée, consonne finale dédoublée. Structurel — aucune liste.
 */
function normalizeEquivalentToken(token: string): string {
  return dedupeTokenTailConsonants(
    token.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase(),
  );
}

function groupHasToken(group: readonly string[], normalized: string): boolean {
  return group.some((entry) => normalizeEquivalentToken(entry) === normalized);
}

export function titleTokensEquivalent(a: string, b: string): boolean {
  const normalizedA = normalizeEquivalentToken(a);
  const normalizedB = normalizeEquivalentToken(b);
  if (normalizedA === normalizedB) return true;
  return TITLE_TOKEN_EQUIVALENT_GROUPS.some(
    (group) =>
      groupHasToken(group, normalizedA) && groupHasToken(group, normalizedB),
  );
}

export function titleTokenPresentInSet(
  token: string,
  titleTokens: Set<string>,
): boolean {
  if (titleTokens.has(token)) return true;
  for (const candidate of titleTokens) {
    if (titleTokensEquivalent(token, candidate)) return true;
  }
  return false;
}
