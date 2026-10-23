/**
 * Libellés admin pour la structure scellée — phrasing lisible, pas de jargon
 * « pool set » / `1×12` / `structural`.
 */

/** Unité d'ouverture : « pochette » Disney Leclerc, sinon sachet / pack. */
export function sealedOpenUnitNoun(
  opts: { slug?: string | null; fr: boolean; count: number },
): string {
  const slug = (opts.slug ?? "").trim().toLowerCase();
  const n = Math.max(0, Math.floor(opts.count));
  if (slug === "pochette" || slug.startsWith("pochette-")) {
    if (opts.fr) return n <= 1 ? "pochette" : "pochettes";
    return n === 1 ? "packet" : "packets";
  }
  if (opts.fr) return n <= 1 ? "sachet" : "sachets";
  return n === 1 ? "pack" : "packs";
}

export function formatSealedPackCountLabel(
  count: number,
  fr: boolean,
  slug?: string | null,
): string {
  const n = Math.max(0, Math.floor(count));
  return `${n} ${sealedOpenUnitNoun({ slug, fr, count: n })}`;
}

export function formatPackCompositionProvenanceLabel(
  provenance: string | null | undefined,
  fr: boolean,
): string | null {
  const raw = provenance?.trim().toLowerCase();
  if (!raw) return null;
  switch (raw) {
    case "official":
      return fr ? "officielle" : "official";
    case "community":
      return fr ? "communauté" : "community";
    case "estimate":
      return fr ? "estimée" : "estimate";
    case "structural":
      return fr ? "structure connue" : "known structure";
    case "unknown":
      return fr ? "inconnue" : "unknown";
    default:
      return provenance!.trim();
  }
}

const SLOT_ID_LABEL_FR: Record<string, string> = {
  card: "carte",
  fixeez: "Fixeez",
  common: "commune",
  uncommon: "peu commune",
  rare: "rare",
  foil: "foil",
};

const RARITY_LABEL_FR: Record<string, string> = {
  card: "carte",
  fixeez: "Fixeez",
  Fixeez: "Fixeez",
};

/** Slot dédié / partagé — jamais « 4 cartes = carte ou Fixeez ». */
export function formatPackCompositionSlotLabel(
  slot: { id: string; count: number; rarities: readonly string[] },
  fr: boolean,
): string {
  const count = Math.max(0, Math.floor(slot.count));
  const idKey = slot.id.trim().toLowerCase();
  const head =
    fr && idKey === "card"
      ? `${count} ${count <= 1 ? "carte" : "cartes"}`
      : fr && idKey === "fixeez"
        ? `${count} Fixeez`
        : `${count}× ${fr ? SLOT_ID_LABEL_FR[idKey] ?? slot.id : slot.id}`;
  if (!slot.rarities.length) return head;
  const rarityKeys = [
    ...new Set(
      slot.rarities.map((r) => r.trim().toLowerCase()).filter(Boolean),
    ),
  ];
  // Dedicated « card × N » with only card rarity — no « (carte) » echo.
  if (rarityKeys.length === 1 && rarityKeys[0] === idKey) return head;
  const rarityBits = rarityKeys.map((key) =>
    fr ? (RARITY_LABEL_FR[key] ?? key) : key,
  );
  const joiner = fr ? " ou " : " or ";
  return `${head} (${rarityBits.join(joiner)})`;
}

/** Chase hors slots (ex. Fixeez) — possible, non garanti, pas un des N. */
export function formatPackCompositionPossibleChaseLabel(
  labels: readonly string[],
  fr: boolean,
): string | null {
  const cleaned = labels.map((s) => s.trim()).filter(Boolean);
  if (!cleaned.length) return null;
  const list = cleaned.join(fr ? ", " : ", ");
  return fr
    ? `${list} : possible (aléatoire, non garanti — hors des cartes comptées)`
    : `${list}: possible (random, not guaranteed — outside counted cards)`;
}

/** Kind line: « Pochette · disney25 » when slug says so, else registry kind. */
export function formatSealedKindLine(opts: {
  kindLabel: string;
  setCode?: string | null;
  slug?: string | null;
  fr: boolean;
}): string {
  const slug = (opts.slug ?? "").trim().toLowerCase();
  const kind =
    slug === "pochette" || slug.startsWith("pochette-")
      ? opts.fr
        ? "Pochette"
        : "Packet"
      : opts.kindLabel;
  const code = opts.setCode?.trim();
  return code ? `${kind} · ${code}` : kind;
}

export function formatSealedCardsPerOpenUnitLabel(
  cards: number,
  fr: boolean,
  slug?: string | null,
): string {
  const n = Math.max(0, Math.floor(cards));
  const unit = sealedOpenUnitNoun({ slug, fr, count: 1 });
  return fr ? `${n} cartes/${unit}` : `${n} cards/${unit}`;
}

export function formatSealedRandomSectionTitle(
  fr: boolean,
  slug?: string | null,
): string {
  if (!fr) return "Packs / random draws";
  const noun = sealedOpenUnitNoun({ slug, fr, count: 2 });
  return `${noun.charAt(0).toUpperCase()}${noun.slice(1)} / tirages`;
}

export function formatSealedRandomContentsLabel(
  node: {
    packs: number;
    cardsPerPack: number;
    pool: string;
    setId?: string;
    slug?: string | null;
  },
  fr: boolean,
): string {
  const packs = Math.max(0, Math.floor(node.packs));
  const cards = Math.max(0, Math.floor(node.cardsPerPack));
  const packNoun = sealedOpenUnitNoun({
    slug: node.slug,
    fr,
    count: packs,
  });
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
