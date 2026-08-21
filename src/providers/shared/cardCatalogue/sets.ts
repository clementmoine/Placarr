/**
 * Mettre au propre une liste d'extensions, quel que soit le catalogue.
 *
 * Chaque pack lit ses sets à sa façon — une table `sets`, un `set_name` porté
 * par le titre, un relevé curé — et c'est légitime : la donnée n'est pas rangée
 * pareil. Ce qui vient **après** l'est : écarter ce qui ne se choisit pas,
 * départager les homonymes, trier. Écrit une fois par pack, ça avait déjà
 * divergé sur les trois points.
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
};

/** Un libellé sans lettre ni chiffre ne se choisit pas — le catalogue Dragon
 * Ball en porte un noté `-`. Le code, lui, désigne toujours quelque chose. */
function isUsableLabel(label: string): boolean {
  return /[\p{L}\p{N}]/u.test(label);
}

export type FinalizeSetOptionsInput = {
  id: string;
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
 * Nettoie, départage et trie.
 *
 * - un libellé inutilisable retombe sur le code, en majuscules ;
 * - deux sets qui portent le **même** nom — un booster réédité, par exemple —
 *   se voient ajouter leur code, et eux seuls : deux entrées identiques dans
 *   une liste ne se départagent pas ;
 * - le tri suit `sortKey` quand le pack en donne un, sinon il est numérique et
 *   français, pour que « Série 2 » précède « Série 10 ».
 */
export function finalizeSetOptions(
  rows: readonly FinalizeSetOptionsInput[],
): SetOption[] {
  const named: (SetOption & { sortKey: number | null })[] = [];
  for (const row of rows) {
    const id = row.id?.trim();
    if (!id) continue;
    const label = (row.label ?? "").trim();
    named.push({
      id,
      label: isUsableLabel(label) ? label : id.toUpperCase(),
      sortKey: row.sortKey ?? null,
      ...(row.group ? { group: row.group } : {}),
      ...(row.languages?.length ? { languages: [...row.languages] } : {}),
    });
  }

  const seen = new Map<string, number>();
  for (const row of named) {
    seen.set(row.label, (seen.get(row.label) ?? 0) + 1);
  }

  return named
    .map((row) =>
      (seen.get(row.label) ?? 0) > 1
        ? { ...row, label: `${row.label} (${row.id.toUpperCase()})` }
        : row,
    )
    .sort((a, b) => {
      if (a.sortKey !== b.sortKey) {
        if (a.sortKey === null) return 1;
        if (b.sortKey === null) return -1;
        return a.sortKey - b.sortKey;
      }
      return a.label.localeCompare(b.label, "fr", { numeric: true });
    })
    .map(({ id, label, group, languages }) => ({
      id,
      label,
      ...(group ? { group } : {}),
      ...(languages ? { languages } : {}),
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
