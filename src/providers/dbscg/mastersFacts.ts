/**
 * Dragon Ball Super CG — les données de jeu que le catalogue laissait au sol.
 *
 * `staging/dragon-ball-masters-arena/masters_superset.json` est déjà sur disque :
 * 8 600 lignes, 34 champs. Le pack n'en retenait qu'une poignée — rareté,
 * personnage, puissance, couleur — et jetait le reste, dont le **texte de la
 * carte**, le statut tournoi et le verso.
 *
 * Ce module lit le dépôt et n'en garde que ce qui est vérifiable :
 *
 *   - `variants` est ignoré. Il annonce des variantes mais pointe ailleurs :
 *     BT1-005 renvoie vers 3729 = `BT24-086_PR2`, 3735 = `BT24-089_PR`,
 *     473 = `BT11-024` (Lemo) — trois cartes sans rapport. Un champ qui ment
 *     n'entre pas au catalogue.
 *   - `finishes` est `null` sur les 8 585 lignes qui le portent.
 *   - `card_back_skill` vaut `-` sur presque tout : 8 429 valeurs non vides
 *     pour 608 vrais versos. Le tiret est une absence, pas un texte.
 *   - `sort` / `view_count` sont deux compteurs d'affichage du site.
 *   - `is_horizontal` est faux sur les 8 600 lignes. Le champ existe, le dépôt
 *     ne l'a jamais rempli : le porter reviendrait à affirmer qu'aucune carte
 *     n'est en paysage, ce que la source ne dit pas.
 *
 * La rareté est écrite de trois façons par la source — `Uncommon[UC]`,
 * `Uncommon [UC]`, `Common` — donc elle est éclatée en libellé et code plutôt
 * que recopiée telle quelle.
 *
 * Le dépôt est anglophone : ces faits ne portent pas le texte français.
 */
export type DbsCgMastersRow = Record<string, unknown>;

export type DbsCgCardFacts = {
  /** Numéro normalisé : `BT1-005`, `BT24-086-PR2`, `EX06-035`. */
  cardNumber: string;
  /** Numéro tel que la source l'écrit, souligné compris. */
  sourceNumber: string;
  name: string;
  /** `Uncommon`, `Super Rare`… sans le code entre crochets. */
  rarity: string | null;
  /** `UC`, `SR`, `SCR`… */
  rarityCode: string | null;
  cardType: string | null;
  color: string | null;
  series: string | null;
  character: string[];
  era: string[];
  traits: string[];
  keywords: string[];
  power: string | null;
  energyCost: string | null;
  comboCost: string | null;
  comboPower: string | null;
  /** Coût en énergie Z, sur 1 089 cartes seulement. */
  zEnergyCost: string | null;
  /** Texte de la carte, balises retirées. */
  skill: string | null;
  /** Verso — 608 cartes en ont un vrai (Leaders, cartes Unison). */
  back: {
    name: string | null;
    power: string | null;
    skill: string | null;
    character: string[];
    era: string[];
    traits: string[];
  } | null;
  banned: boolean;
  /** `1` quand la carte est limitée à un exemplaire. */
  limitedTo: number | null;
  /** Textes d'errata, balises retirées. */
  erratas: string[];
  /** Ligne non publiée du site source — gardée, jamais présentée comme acquise. */
  draft: boolean;
};

const PLACEHOLDER = new Set(["", "-", "－", "—"]);

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&apos;/g, "'")
    .replace(/&#0*39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&");
}

function text(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const stripped = value.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "");
  // Les errata du dépôt sont encodés deux fois : `card&amp;apos;s Combo`. Une
  // seule passe laisse `&apos;` en clair dans le texte de 201 cartes.
  const clean = decodeEntities(decodeEntities(stripped))
    .replace(/[ \t]+/g, " ")
    .trim();
  return PLACEHOLDER.has(clean) ? null : clean;
}

function list(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const entry of value) {
    const clean = text(entry);
    if (clean && !out.includes(clean)) out.push(clean);
  }
  return out;
}

/**
 * `BT1-005` / `BT24-086_PR2` / `EX06-35` → une seule écriture.
 * Le numéro de carte est complété à trois chiffres, le souligné devient tiret,
 * et le rang de variante perd son zéro de tête (`PR02` et `PR2` sont un seul
 * tirage écrit deux fois selon la source).
 */
export function normalizeDbsCgNumber(raw: string): string {
  return String(raw ?? "")
    .toUpperCase()
    .trim()
    .replace(/_/g, "-")
    .replace(
      /^([A-Z]+\d*)-(\d+)/,
      (_m, set: string, num: string) => `${set}-${num.padStart(3, "0")}`,
    )
    .replace(
      /-([A-Z]+)0*(\d+)$/,
      (_m, tag: string, rank: string) => `-${tag}${rank}`,
    );
}

/** Le numéro de base, suffixe de réimpression retiré : `BT1-005-PR2` → `BT1-005`. */
export function dbsCgBaseNumber(raw: string): string {
  const match = /^([A-Z]+\d*-\d+)/.exec(normalizeDbsCgNumber(raw));
  return match?.[1] ?? normalizeDbsCgNumber(raw);
}

/** `Special Rare[SPR]`, `Uncommon [UC]`, `Common` → libellé + code. */
export function splitDbsCgRarity(raw: unknown): {
  rarity: string | null;
  rarityCode: string | null;
} {
  const value = text(raw);
  if (!value) return { rarity: null, rarityCode: null };
  const match = /^(.*?)\s*\[([^\]]+)\]$/.exec(value);
  if (!match) return { rarity: value, rarityCode: null };
  return {
    rarity: match[1]!.trim() || null,
    rarityCode: match[2]!.trim().toUpperCase() || null,
  };
}

function backOf(row: DbsCgMastersRow): DbsCgCardFacts["back"] {
  const name = text(row.card_back_name);
  const skill = text(row.card_back_skill_unstyled) ?? text(row.card_back_skill);
  const character = list(row.card_back_character);
  const era = list(row.card_back_era);
  const traits = list(row.card_back_traits);
  const power = text(row.card_back_power);
  if (!name && !skill && !power && !character.length && !traits.length) {
    return null;
  }
  return { name, power, skill, character, era, traits };
}

export function parseDbsCgMastersRow(
  row: DbsCgMastersRow,
): DbsCgCardFacts | null {
  const sourceNumber = text(row.card_number);
  const name = text(row.card_name);
  if (!sourceNumber || !name) return null;
  const { rarity, rarityCode } = splitDbsCgRarity(row.card_rarity);
  return {
    cardNumber: normalizeDbsCgNumber(sourceNumber),
    sourceNumber,
    name,
    rarity,
    rarityCode,
    cardType: text(row.card_type),
    color: text(row.card_color),
    series: text(row.card_series),
    character: list(row.card_character),
    era: list(row.card_era),
    traits: list(row.card_traits),
    keywords: list(row.keywords),
    power: text(row.card_power),
    energyCost: text(row.card_energy_cost),
    comboCost: text(row.card_combo_cost),
    comboPower: text(row.card_combo_power),
    zEnergyCost: text(row.z_energy_cost),
    skill: text(row.card_skill_unstyled) ?? text(row.card_skill),
    back: backOf(row),
    banned: row.is_banned === true,
    limitedTo:
      row.is_limited === true && typeof row.limited_to === "number"
        ? row.limited_to
        : null,
    erratas: Array.isArray(row.erratas)
      ? row.erratas
          .flatMap((entry) =>
            entry && typeof entry === "object"
              ? Object.values(entry as Record<string, unknown>)
              : [entry],
          )
          .map(text)
          .filter((v): v is string => Boolean(v))
      : [],
    draft: text(row.status)?.toLowerCase() === "draft",
  };
}

export function parseDbsCgMastersSuperset(payload: unknown): DbsCgCardFacts[] {
  const rows =
    payload && typeof payload === "object"
      ? (Object.values(payload as Record<string, unknown>) as DbsCgMastersRow[])
      : [];
  const out: DbsCgCardFacts[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const card = parseDbsCgMastersRow(row);
    if (!card || seen.has(card.cardNumber)) continue;
    seen.add(card.cardNumber);
    out.push(card);
  }
  return out.sort((a, b) => a.cardNumber.localeCompare(b.cardNumber));
}
