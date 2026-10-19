/**
 * Libellés admin pour la structure scellée — phrasing lisible, pas de jargon
 * « pool set » / `1×12`.
 */

export function formatSealedRandomContentsLabel(
  node: {
    packs: number;
    cardsPerPack: number;
    pool: string;
    setId?: string;
  },
  fr: boolean,
): string {
  const packs = Math.max(0, Math.floor(node.packs));
  const cards = Math.max(0, Math.floor(node.cardsPerPack));
  const packNoun = fr
    ? packs <= 1
      ? "sachet"
      : "sachets"
    : packs === 1
      ? "pack"
      : "packs";
  const head = fr
    ? `${packs} ${packNoun} de ${cards} cartes`
    : `${packs} ${packNoun} of ${cards} cards`;

  if (node.pool === "set") {
    const setId = node.setId?.trim();
    if (setId) {
      return fr
        ? `${head} tirées au hasard dans le set ${setId}`
        : `${head} drawn at random from set ${setId}`;
    }
    return fr
      ? `${head} tirées au hasard dans le set`
      : `${head} drawn at random from the set`;
  }

  if (node.pool === "unknown") {
    return fr
      ? `${head} (origine du tirage inconnue)`
      : `${head} (unknown random source)`;
  }

  if (node.pool === "listed") {
    return fr
      ? `${head} tirées au hasard (liste connue)`
      : `${head} drawn at random (listed pool)`;
  }

  return head;
}

export function formatSealedStructureUnitLabel(
  unit: { count: number; cardsEach: number; label: string },
  fr: boolean,
): string {
  const count = Math.max(0, Math.floor(unit.count));
  const cards = Math.max(0, Math.floor(unit.cardsEach));
  const label = unit.label.trim() || (fr ? "unité" : "unit");
  return fr
    ? `${count} × ${label} · ${cards} cartes chacune (listes à inventarier)`
    : `${count} × ${label} · ${cards} cards each (lists not inventoried)`;
}

export function formatRandomPoolScopeLabel(
  scope: string,
  setCode: string | null | undefined,
  fr: boolean,
): string {
  const code = setCode?.trim() || "";
  switch (scope) {
    case "set":
      return fr
        ? code
          ? `cartes au hasard du set ${code}`
          : "cartes au hasard du set"
        : code
          ? `random cards from set ${code}`
          : "random cards from the set";
    case "listed":
      return fr
        ? "cartes au hasard (liste connue)"
        : "random cards (listed pool)";
    case "none":
      return fr
        ? "aucune au niveau de ce produit"
        : "none at this product level";
    case "unknown":
      return fr ? "inconnue" : "unknown";
    default:
      return scope;
  }
}
