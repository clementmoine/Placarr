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

import {
  parsePrintKey,
  printCollectableKey,
} from "@/core/identify/printKey";

export type ChecklistPrint = {
  printKey: string;
  setId: string;
  /** Ce qu'un collectionneur lit sur la carte : `NI-046`. */
  reference: string;
  title: string;
  thumbnailUrl?: string | null;
  /** Rareté catalogue (`Enchanted`, `commune`, …) — pour les taux de tirage. */
  rarity?: string | null;
  /**
   * Finition catalogue en mode master set (`Silver`, `holo`, …).
   *
   * Absent / `null` hors master set, ou quand le tirage n'offre qu'une face
   * sans choix de finish. En master set, normal et foil sont deux lignes.
   */
  finish?: string | null;
};

/**
 * Clé d'appartenance master set : `printKey|finish`.
 *
 * La langue est déjà filtrée par l'appelant. Sans finish (carte plain seule,
 * ou item sans variante renseignée), le second segment est vide — comme dans
 * le print picker (`ownedRowKey`).
 */
export function checklistOwnedKey(
  printKey: string,
  finish?: string | null,
): string {
  return [
    printKey.trim().toLowerCase(),
    (finish ?? "").trim().toLowerCase(),
  ].join("|");
}

/**
 * Réécrit les clés possédées pour le master set.
 *
 * Normalise la casse. **Ne devine pas** une finition pour `printKey|` (variant
 * vide) : inventer `None` ferait croire qu'on a la normale alors que la copie
 * peut être une foil jamais taguée. Sans finition renseignée, la case master
 * set reste ouverte — c'est le même principe que « foil ≠ normale ».
 *
 * Les maps sont indexées par `printKey` **déjà en minuscules**.
 */
/**
 * Posséder `dbsjcc:part1-d0123` coche aussi `dbsjcc:part9-d0123` quand le
 * catalogue a dupliqué la même carte sous plusieurs sets.
 *
 * Ne touche pas aux numéros set-scoped (Lorcana `1`, One Piece `001`).
 */
export function expandOwnedAcrossSetListings(input: {
  owned: ReadonlySet<string>;
  cataloguePrintKeys: readonly string[];
  masterSet?: boolean;
}): Set<string> {
  const masterSet = Boolean(input.masterSet);
  const ownedCollectables = new Set<string>();
  for (const key of input.owned) {
    const pipe = key.indexOf("|");
    const printKey = (
      masterSet && pipe >= 0 ? key.slice(0, pipe) : key
    ).trim().toLowerCase();
    const finish =
      masterSet && pipe >= 0 ? key.slice(pipe + 1).trim().toLowerCase() : "";
    const collectable = printCollectableKey(printKey);
    if (!collectable) continue;
    ownedCollectables.add(
      masterSet ? `${collectable}|${finish}` : collectable,
    );
  }
  if (ownedCollectables.size === 0) return new Set(input.owned);

  const out = new Set(
    [...input.owned].map((key) => key.trim().toLowerCase()),
  );
  for (const raw of input.cataloguePrintKeys) {
    const printKey = raw.trim().toLowerCase();
    const collectable = printCollectableKey(printKey);
    if (!collectable) continue;
    if (!masterSet) {
      if (ownedCollectables.has(collectable)) out.add(printKey);
      continue;
    }
    for (const owned of ownedCollectables) {
      const sep = owned.lastIndexOf("|");
      if (sep < 0) continue;
      if (owned.slice(0, sep) !== collectable) continue;
      out.add(checklistOwnedKey(printKey, owned.slice(sep + 1)));
    }
  }
  return out;
}

export function resolveMasterSetOwned(input: {
  owned: ReadonlySet<string>;
  /** Finitions catalogue par printKey (minuscules). */
  finishesByPrintKey: ReadonlyMap<string, readonly string[]>;
  /** Plain finishes provider, quand il les annonce. */
  plainFinishesByPrintKey?: ReadonlyMap<string, readonly string[]>;
}): Set<string> {
  void input.finishesByPrintKey;
  void input.plainFinishesByPrintKey;
  const resolved = new Set<string>();
  for (const key of input.owned) {
    const pipe = key.indexOf("|");
    const printKey = (pipe >= 0 ? key.slice(0, pipe) : key).trim().toLowerCase();
    const finish = (pipe >= 0 ? key.slice(pipe + 1) : "").trim().toLowerCase();
    if (!finish) {
      /*
        Variant vide : on garde la clé telle quelle. Elle ne matche une ligne
        catalogue que si cette ligne a aussi `finish` null (pas de choix).
      */
      resolved.add(checklistOwnedKey(printKey, null));
      continue;
    }
    resolved.add(`${printKey}|${finish}`);
  }
  return resolved;
}

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
  /** Symbole set devant le libellé — voir `PrintSetOption.iconUrl`. */
  iconUrl?: string | null;
  /** Fallbacks symbole — voir `PrintSetOption.iconUrls`. */
  iconUrls?: string[] | null;
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
 *
 * Le libellé du sélecteur porte souvent un préfixe de code (`1 — Premier
 * Chapitre`, `S1 — Série 1 — …`) : on essaie aussi le nom après le tiret.
 */
export function referenceWithinSet(
  reference: string,
  setLabel: string,
): string {
  const label = setLabel.trim();
  if (!label) return reference;
  const trimmed = reference.trim();
  const candidates = [label];
  const parts = label
    .split(/\s*[—–]\s*/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length > 1) {
    candidates.push(parts[parts.length - 1]!);
    candidates.push(parts.slice(1).join(" — "));
  }
  for (const candidate of candidates) {
    if (!candidate) continue;
    if (!trimmed.toLowerCase().startsWith(candidate.toLowerCase())) continue;
    const stripped = trimmed
      .slice(candidate.length)
      .replace(/^[\s·\-—:]+/, "");
    if (stripped) return stripped;
  }
  return reference;
}

/**
 * Ordre dans un set : retail d'abord (par référence), puis les tirages à
 * grouping (promos) en fin de liste, groupés alphabétiquement (P1 → P3 → …).
 *
 * Un tri purement numérique mélangeait `20/204` et `20/P1` au milieu du set.
 */
export function compareChecklistPrints(
  a: ChecklistPrint,
  b: ChecklistPrint,
): number {
  const ga = (parsePrintKey(a.printKey)?.grouping ?? "").toLowerCase();
  const gb = (parsePrintKey(b.printKey)?.grouping ?? "").toLowerCase();
  const aGrouped = ga ? 1 : 0;
  const bGrouped = gb ? 1 : 0;
  if (aGrouped !== bGrouped) return aGrouped - bGrouped;
  if (ga !== gb) return ga.localeCompare(gb, "fr", { numeric: true });
  const byRef = a.reference.localeCompare(b.reference, "fr", { numeric: true });
  if (byRef !== 0) return byRef;
  const byFinish = (a.finish ?? "").localeCompare(b.finish ?? "", "fr", {
    numeric: true,
  });
  if (byFinish !== 0) return byFinish;
  return a.printKey.localeCompare(b.printKey);
}

function percent(owned: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((owned / total) * 100);
}

/**
 * Croise le catalogue et la collection.
 *
 * `owned` est un ensemble **déjà filtré sur la langue** par l'appelant : lui
 * seul sait comment ses items la portent, et le faire ici obligerait ce module
 * à connaître le modèle de données.
 *
 * - mode classique : clés = `printKey` (toute finition compte) ;
 * - master set : clés = `printKey|finish` ({@link checklistOwnedKey}), et les
 *   `prints` sont déjà éclatés une ligne par finition.
 */
export function buildShelfChecklist(input: {
  sets: readonly ChecklistSetInput[];
  prints: readonly ChecklistPrint[];
  owned: ReadonlySet<string>;
  language?: string | null;
  /** Une ligne par finition ; possession exacte printKey×finish. */
  masterSet?: boolean;
}): ShelfChecklist {
  const masterSet = Boolean(input.masterSet);
  const owned = expandOwnedAcrossSetListings({
    owned: input.owned,
    cataloguePrintKeys: input.prints.map((print) => print.printKey),
    masterSet,
  });
  const bySet = new Map<string, ChecklistPrint[]>();
  for (const print of input.prints) {
    const rows = bySet.get(print.setId) ?? [];
    rows.push(print);
    bySet.set(print.setId, rows);
  }

  const sets: ChecklistSet[] = [];
  const setsWithoutCatalogue: ChecklistSetInput[] = [];
  let total = 0;
  let ownedCount = 0;

  for (const set of input.sets) {
    const prints = bySet.get(set.id);
    if (!prints?.length) {
      setsWithoutCatalogue.push(set);
      continue;
    }
    const cards = prints
      .map((print) => {
        const reference = referenceWithinSet(print.reference, set.label);
        const isOwned = masterSet
          ? owned.has(checklistOwnedKey(print.printKey, print.finish))
          : owned.has(print.printKey.trim().toLowerCase());
        return {
          ...print,
          reference,
          owned: isOwned,
        };
      })
      .sort(compareChecklistPrints);
    const missing = cards
      .filter((print) => !print.owned)
      .map(({ owned: _owned, ...print }) => print);
    const held = prints.length - missing.length;
    total += prints.length;
    ownedCount += held;
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
    totals: { total, owned: ownedCount, completion: percent(ownedCount, total) },
    setsWithoutCatalogue,
  };
}
