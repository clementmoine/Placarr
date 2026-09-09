/**
 * « Qu'est-ce qui existe, et qu'est-ce que j'ai ? » — pour n'importe quelle
 * étagère.
 *
 * Une jointure, rien de plus : le catalogue local dit ce qui existe, les items
 * disent ce qu'on possède. Aucun réseau, aucune connaissance de jeu — on reçoit
 * des ensembles, on rend des comptes.
 *
 * **La langue borne tout.** Compléter « la Série 1 » n'a de sens que dans une
 * langue : ses 182 tirages français et ses 128 anglais ne sont pas la même
 * collection, et un pourcentage qui les mêlerait ne voudrait rien dire. C'est
 * la même règle que partout ailleurs — le set appartient au couple
 * (extension, territoire).
 */

export type ChecklistPrint = {
  printKey: string;
  setId: string;
  /** Ce qu'un collectionneur lit sur la carte : `NI-046`. */
  reference: string;
  title: string;
  thumbnailUrl?: string | null;
  /** Rareté catalogue (`Enchanted`, `commune`, …) — pour les taux de tirage. */
  rarity?: string | null;
};

export type ChecklistSetInput = {
  id: string;
  label: string;
  /** La découpe, quand le jeu en a plusieurs — voir `PrintSetOption.group`. */
  group?: string | null;
  /**
   * Le rang du set dans sa ligne, quand son libellé ne le porte pas.
   *
   * « Quest for Power » est la septième série : trié par son nom il tombe sous
   * Q, entre « Path of Pain » et « Revenge and Rebirth ». Le rang le remet où
   * il est sorti.
   */
  sortKey?: number | null;
};

export type ChecklistCard = ChecklistPrint & {
  /** Déjà sur l'étagère — case cochée à l'affichage. */
  owned: boolean;
};

export type ChecklistSet = ChecklistSetInput & {
  total: number;
  owned: number;
  /** Entre 0 et 100, arrondi. `0` quand le set est vide, jamais `NaN`. */
  completion: number;
  /** Toutes les cartes du set, possédées puis manquantes, ordre de référence. */
  cards: ChecklistCard[];
  /** Sous-ensemble non possédé — ce qu'il reste à chasser / tarifer. */
  missing: ChecklistPrint[];
};

export type ShelfChecklist = {
  language: string | null;
  /**
   * Toutes les extensions du catalogue dans cette langue, ordre de sortie.
   *
   * Une seule liste : commencées, terminées ou pas encore touchées — le
   * pourcentage et les manquantes portent l'état, pas un regroupement à part.
   */
  sets: ChecklistSet[];
  totals: { total: number; owned: number; completion: number };
  /**
   * Extensions que le catalogue annonce mais dont il ne tient **aucune** carte
   * dans cette langue.
   *
   * Ce n'est pas la même chose qu'un set à 0 % : là, c'est notre catalogue qui
   * est incomplet, pas la collection. Une check-list qui les taisait laisserait
   * croire à une complétion qu'elle ne peut pas mesurer.
   */
  setsWithoutCatalogue: ChecklistSetInput[];
};

/**
 * `Premier Chapitre · 21/P1` → `21/P1`, à l'intérieur du bloc de ce set.
 *
 * Les providers rendent une référence qui se suffit hors contexte, nom de
 * l'extension compris. Dans une liste déjà titrée par ce nom, il le répète à
 * chaque ligne et mange la place du titre de la carte.
 */
export function referenceWithinSet(
  reference: string,
  setLabel: string,
): string {
  const label = setLabel.trim();
  if (!label) return reference;
  const trimmed = reference.trim();
  if (!trimmed.toLowerCase().startsWith(label.toLowerCase())) return reference;
  // Le séparateur varie selon le pack : on retire ce qui n'est pas la référence.
  return trimmed.slice(label.length).replace(/^[\s·\-—:]+/, "") || reference;
}

function percent(owned: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((owned / total) * 100);
}

/**
 * Croise le catalogue et la collection.
 *
 * `owned` est un ensemble de `printKey` **déjà filtré sur la langue** par
 * l'appelant : lui seul sait comment ses items la portent, et le faire ici
 * obligerait ce module à connaître le modèle de données.
 */
export function buildShelfChecklist(input: {
  sets: readonly ChecklistSetInput[];
  prints: readonly ChecklistPrint[];
  owned: ReadonlySet<string>;
  language?: string | null;
}): ShelfChecklist {
  const bySet = new Map<string, ChecklistPrint[]>();
  for (const print of input.prints) {
    const rows = bySet.get(print.setId) ?? [];
    rows.push(print);
    bySet.set(print.setId, rows);
  }

  const sets: ChecklistSet[] = [];
  const setsWithoutCatalogue: ChecklistSetInput[] = [];
  let total = 0;
  let owned = 0;

  for (const set of input.sets) {
    const prints = bySet.get(set.id);
    if (!prints?.length) {
      setsWithoutCatalogue.push(set);
      continue;
    }
    const cards = prints
      .map((print) => {
        const reference = referenceWithinSet(print.reference, set.label);
        return {
          ...print,
          reference,
          owned: input.owned.has(print.printKey),
        };
      })
      .sort((a, b) =>
        a.reference.localeCompare(b.reference, "fr", { numeric: true }),
      );
    const missing = cards
      .filter((print) => !print.owned)
      .map(({ owned: _owned, ...print }) => print);
    const held = prints.length - missing.length;
    total += prints.length;
    owned += held;
    sets.push({
      ...set,
      total: prints.length,
      owned: held,
      completion: percent(held, prints.length),
      cards,
      missing,
    });
  }

  /*
    Ordre de sortie quand on le connaît, alphabétique sinon — et numérique,
    pour que « Série 2 » précède « Série 10 ».

    On cherche un set par son nom ou son numéro, jamais par son avancement.
    Un ordre qui change à chaque carte ajoutée se parcourt mal.

    Le rang est ce qui sauve les extensions **nommées** : « Quest for Power »
    est la septième série, et triée par libellé elle tombe sous Q.
  */
  sets.sort((a, b) => {
    /*
      D'abord la découpe (Europe vs 巻ノ…), puis le rang de sortie. Sans ça,
      `s1` et `maki1` (même sortKey) s'entremêlaient, et les sets sans rang
      retombaient sur l'alphabet des libellés (« Archazia » avant « Chapitre »).
    */
    const groupCmp = (a.group ?? "").localeCompare(b.group ?? "", "fr", {
      numeric: true,
    });
    if (groupCmp !== 0) return groupCmp;
    if (a.sortKey != null && b.sortKey != null) return a.sortKey - b.sortKey;
    if (a.sortKey != null) return -1;
    if (b.sortKey != null) return 1;
    return a.label.localeCompare(b.label, "fr", { numeric: true });
  });

  return {
    language: input.language ?? null,
    sets,
    totals: { total, owned, completion: percent(owned, total) },
    setsWithoutCatalogue,
  };
}
