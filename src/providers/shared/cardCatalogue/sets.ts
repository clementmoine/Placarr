/**
 * Mettre au propre une liste d'extensions, quel que soit le catalogue.
 *
 * Chaque pack lit ses sets à sa façon — une table `sets`, un `set_name` porté
 * par le titre, un relevé curé — et c'est légitime : la donnée n'est pas rangée
 * pareil. Ce qui vient **après** l'est : écarter ce qui ne se choisit pas,
 * préfixer le code, trier. Écrit une fois par pack, ça avait déjà divergé.
 *
 * Rien ici ne connaît de catalogue : on reçoit des paires, on rend des paires.
 */
export type SetOption = {
  id: string;
  label: string;
  /** La découpe dont ce set fait partie — voir `PrintSetOption.group`. */
  group?: string;
  /** Les langues dans lesquelles ce set a paru — voir `PrintSetOption`. */
  languages?: string[];
  /**
   * Le rang du set dans sa ligne, **rendu à l'appelant**.
   *
   * Il servait au tri interne puis était jeté. Or c'est la seule chose qui
   * porte l'ordre quand le libellé ne le dit pas : « Quest for Power » est la
   * septième série, et rien dans son nom ne l'annonce. Une check-list qui trie
   * par libellé la range sous Q, entre « Path of Pain » et « Revenge ».
   */
  sortKey?: number;
};

/** Un libellé sans lettre ni chiffre ne se choisit pas — le catalogue Dragon
 * Ball en porte un noté `-`. Le code, lui, désigne toujours quelque chose. */
export function isUsableSetLabel(label: string): boolean {
  return /[\p{L}\p{N}]/u.test(label);
}

/**
 * Parmi les `set_name` portés par les titres d'une extension, garde le plus
 * fréquent **utilisable**.
 *
 * `MIN(set_name)` prenait `-` avant « Promotion Cartes » (ordre lexicographique),
 * et la liste d'extensions affichait alors juste « P ».
 */
export function pickCatalogueSetName(
  names: readonly (string | null | undefined)[],
): string | null {
  return pickCatalogueSetNameByCount(
    names.map((name) => ({ name, count: 1 })),
  );
}

export function pickCatalogueSetNameByCount(
  rows: readonly { name?: string | null; count: number }[],
): string | null {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const name = (row.name ?? "").trim();
    if (!isUsableSetLabel(name)) continue;
    const n = Math.max(0, row.count);
    if (n <= 0) continue;
    counts.set(name, (counts.get(name) ?? 0) + n);
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [name, count] of counts) {
    if (count > bestCount) {
      best = name;
      bestCount = count;
    }
  }
  return best;
}

/**
 * `BT1 — Galactic Battle` : le code d'abord, toujours.
 *
 * Les collectionneurs cherchent BT1 / TB1 / FB01 avant le titre marketing, et
 * plusieurs extensions DBS portent aujourd'hui le même `set_name` erroné —
 * sans le préfixe, la liste était illisible. Si le libellé est déjà le code
 * (ou `CODE — …`), on ne le double pas.
 *
 * `code` override : quand l'id disque ≠ le code lu (ex. deck FR `tempete` →
 * `S11`), on préfixe le code affiché sans renommer l'id.
 */
function labelWithSetCode(
  id: string,
  label: string,
  codeOverride?: string | null,
): string {
  const code = (codeOverride?.trim() || id).toUpperCase();
  const trimmed = label.trim();
  if (!isUsableSetLabel(trimmed)) return code;
  const upper = trimmed.toUpperCase();
  if (upper === code) return code;
  /*
    Uniquement un séparateur typographique après le code — pas un simple
    espace : « Promo (hors série) » commence par les lettres de `promo`, et
    un test trop large laissait le libellé sans préfixe.
  */
  if (
    /^[—–-]/.test(trimmed.slice(code.length).trimStart()) &&
    upper.startsWith(code)
  ) {
    return trimmed;
  }
  return `${code} — ${trimmed}`;
}

export type FinalizeSetOptionsInput = {
  id: string;
  /**
   * Code affiché en tête de libellé (`S11 — …`). Défaut = `id` en majuscules.
   * Utile quand l'id disque n'est pas le code collectionneur (deck FR `tempete`).
   */
  code?: string | null;
  /** La découpe dont ce set fait partie — voir `PrintSetOption.group`. */
  group?: string | null;
  /** Les langues dans lesquelles ce set a paru — voir `PrintSetOption`. */
  languages?: readonly string[] | null;
  /** Le nom du set. Vide ou décoratif : le code prend le relais. */
  label?: string | null;
  /**
   * Le rang de ce set dans sa ligne, quand le libellé ne le porte pas.
   *
   * Le tri par libellé suppose que l'ordre se lit dedans — vrai pour
   * « Série 2 » avant « Série 10 », faux dès que le rang est écrit dans une
   * autre numération : les actes 第一幕…第四幕 se rangeaient 一, 三, 二, 四,
   * l'ordre des codes Unicode. Le pack sait compter dans sa langue ; il le dit
   * ici plutôt que de trier lui-même.
   *
   * Absent = à la fin, entre eux par libellé. Une sous-série sans rang y est à
   * sa place.
   */
  sortKey?: number | null;
};

/**
 * Nettoie et trie.
 *
 * - un libellé inutilisable retombe sur le code, en majuscules ;
 * - tout set porte son code en préfixe (`BT1 — …`) : c'est ce qu'on lit sur
 *   la carte, et ça départage les homonymes sans parenthèse en fin de ligne ;
 * - le tri suit `sortKey` quand le pack en donne un, sinon il est numérique et
 *   français, pour que « BT2 — … » précède « BT10 — … ».
 */
export function finalizeSetOptions(
  rows: readonly FinalizeSetOptionsInput[],
): SetOption[] {
  const named: (Omit<SetOption, "sortKey"> & { sortKey: number | null })[] = [];
  for (const row of rows) {
    const id = row.id?.trim();
    if (!id) continue;
    const label = (row.label ?? "").trim();
    named.push({
      id,
      label: labelWithSetCode(
        id,
        isUsableSetLabel(label) ? label : id,
        row.code,
      ),
      sortKey: row.sortKey ?? null,
      ...(row.group ? { group: row.group } : {}),
      ...(row.languages?.length ? { languages: [...row.languages] } : {}),
    });
  }

  return named
    .sort((a, b) => {
      if (a.sortKey !== b.sortKey) {
        if (a.sortKey === null) return 1;
        if (b.sortKey === null) return -1;
        return a.sortKey - b.sortKey;
      }
      return a.label.localeCompare(b.label, "fr", { numeric: true });
    })
    .map(({ id, label, group, languages, sortKey }) => ({
      id,
      label,
      ...(group ? { group } : {}),
      ...(languages ? { languages } : {}),
      ...(sortKey != null ? { sortKey } : {}),
    }));
}

/**
 * Ce qu'une valeur liée peut être. Volontairement étroit : un paramètre SQL
 * n'est pas un objet quelconque, et `unknown` obligeait chaque appelant à le
 * réaffirmer par une assertion.
 */
export type SqlBindValue = string | number | bigint | null;

/**
 * Le SQL qui borne une recherche par extension, avec ou sans mot-clé.
 *
 * Une extension seule est une **question complète** — « montre-moi la Série 1 »
 * — et c'est ainsi qu'on parcourt un set qu'on ne sait pas encore nommer. Le
 * texte, lui, affine. Les deux axes sont indépendants, d'où le `1 = 1` qui
 * neutralise celui qu'on n'utilise pas plutôt que de construire quatre
 * requêtes.
 *
 * Rend aussi les paramètres **dans l'ordre**, parce que les dissocier de la
 * clause est exactement ce qui casse : la requête et ses valeurs se lisent ici
 * au même endroit.
 */
export function setScopedWhere(input: {
  /** Colonne du code de set, telle que ce pack la nomme. */
  setColumn: string;
  setId?: string | null;
  /** Le `OR ...` du texte, sans le `WHERE`. Omis = pas de filtre textuel. */
  textClause?: string | null;
  /** Les valeurs du filtre textuel, dans l'ordre où la clause les attend. */
  textParams?: readonly SqlBindValue[];
}): { where: string; params: SqlBindValue[] } {
  const setId = input.setId?.trim().toLowerCase();
  const hasText = Boolean(input.textClause?.trim());
  return {
    where: `${setId ? `LOWER(${input.setColumn}) = ?` : "1 = 1"}
          AND (${hasText ? input.textClause : "1 = 1"})`,
    params: [
      ...(setId ? [setId] : []),
      ...(hasText ? (input.textParams ?? []) : []),
    ],
  };
}

/**
 * Une recherche sans mot-clé **ni** extension n'est pas une question.
 *
 * Le dire une fois évite que chaque pack décide seul de ce qu'il fait d'une
 * chaîne vide — l'un rendant tout son catalogue, l'autre rien.
 */
export function isAnsweredQuery(
  query: string | null | undefined,
  setId?: string | null,
): boolean {
  return Boolean(query?.trim() || setId?.trim());
}
