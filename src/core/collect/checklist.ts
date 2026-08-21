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
  /**
   * Le rang du set dans sa ligne, quand son libellé ne le porte pas.
   *
   * « Quest for Power » est la septième série : trié par son nom il tombe sous
   * Q, entre « Path of Pain » et « Revenge and Rebirth ». Le rang le remet où
   * il est sorti.
   */
  sortKey?: number | null;
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
  /**
   * Les extensions **entamées et pas finies** — celles sur lesquelles il y a
   * quelque chose à faire.
   */
  sets: ChecklistSet[];
  /** Les extensions **terminées**. Elles restent visibles : c'est le résultat. */
  completedSets: ChecklistSet[];
  /**
   * Les extensions dont on ne possède **aucune** carte.
   *
   * À part, jamais mêlées aux autres : sur une étagère Lorcana où l'on ne suit
   * que le Premier Chapitre, treize sets à 0 % noyaient le seul qui compte. Ce
   * n'est pas du travail en cours, c'est une collection qu'on n'a pas
   * commencée — une information, pas une tâche.
   */
  untouchedSets: ChecklistSet[];
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

  const started: ChecklistSet[] = [];
  const completed: ChecklistSet[] = [];
  const untouched: ChecklistSet[] = [];
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
    const row: ChecklistSet = {
      ...set,
      total: prints.length,
      owned: held,
      completion: percent(held, prints.length),
      missing,
    };
    /*
      Trois états, pas un classement : rien commencé, en cours, terminé. Le
      pourcentage sert à lire une ligne, jamais à décider dans quel groupe elle
      tombe — un set à 99 % reste en cours, et c'est ce qui compte.
    */
    if (held === 0) untouched.push(row);
    else if (missing.length === 0) completed.push(row);
    else started.push(row);
  }

  /*
    Dans l'ordre de sortie quand on le connaît, alphabétique sinon — et
    numérique, pour que « Série 2 » précède « Série 10 ».

    C'est la séparation en trois groupes qui porte l'information ; à
    l'intérieur, on cherche un set par son nom ou son numéro, jamais par son
    avancement. Un ordre qui change à chaque carte ajoutée se parcourt mal.

    Le rang est ce qui sauve les extensions **nommées** : « Quest for Power »
    est la septième série, et triée par libellé elle tombe sous Q.
  */
  const inReleaseOrder = (a: ChecklistSet, b: ChecklistSet) => {
    if (a.sortKey != null && b.sortKey != null) return a.sortKey - b.sortKey;
    if (a.sortKey != null) return -1;
    if (b.sortKey != null) return 1;
    return a.label.localeCompare(b.label, "fr", { numeric: true });
  };
  started.sort(inReleaseOrder);
  completed.sort(inReleaseOrder);
  untouched.sort(inReleaseOrder);

  return {
    language: input.language ?? null,
    sets: started,
    completedSets: completed,
    untouchedSets: untouched,
    totals: { total, owned, completion: percent(owned, total) },
    setsWithoutCatalogue,
  };
}
