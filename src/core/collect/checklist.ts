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
};

export type ChecklistSetInput = {
  id: string;
  label: string;
  /** La découpe, quand le jeu en a plusieurs — voir `PrintSetOption.group`. */
  group?: string | null;
};

export type ChecklistSet = ChecklistSetInput & {
  total: number;
  owned: number;
  /** Entre 0 et 100, arrondi. `0` quand le set est vide, jamais `NaN`. */
  completion: number;
  missing: ChecklistPrint[];
};

export type ShelfChecklist = {
  language: string | null;
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
    const missing = prints
      .filter((print) => !input.owned.has(print.printKey))
      .sort((a, b) =>
        a.reference.localeCompare(b.reference, "fr", { numeric: true }),
      );
    const held = prints.length - missing.length;
    total += prints.length;
    owned += held;
    sets.push({
      ...set,
      total: prints.length,
      owned: held,
      completion: percent(held, prints.length),
      missing,
    });
  }

  /*
    Les sets les moins complets d'abord : une check-list se lit pour savoir où
    il reste du travail, pas pour admirer ce qui est fini. À égalité, le plus
    gros passe devant — c'est là qu'il y a le plus à gagner.
  */
  sets.sort((a, b) => a.completion - b.completion || b.total - a.total);

  return {
    language: input.language ?? null,
    sets,
    totals: { total, owned, completion: percent(owned, total) },
    setsWithoutCatalogue,
  };
}
