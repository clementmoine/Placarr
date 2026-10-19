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

import { finishesOwnedByBlankVariant } from "@/core/enrich/variants";
import { comparePrintKeys, parsePrintKey } from "@/core/identify/printKey";

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
   * Absent / `null` hors master set. En master set : une ligne par finition
   * (y compris si le tirage n'en a qu'une — utile pour la clé owned). L'UI /
   * l'export ne montrent le finish que s'il lève une ambiguïté
   * ({@link ambiguousChecklistPrintKeys}).
   */
  finish?: string | null;
};

/**
 * `printKey` pour lesquels afficher la finition (master set).
 *
 * Ambiguïté si :
 * - plusieurs lignes pour le **même** printKey (dual normal/foil) ;
 * - grouping `prerelease` (sachet vs ouverte — toujours à préciser) ;
 * - même jeu×set×numéro avec un jumeau `prerelease` (ex. S1 retail holo +
 *   manga sachet) : les deux côtés affichent la finition.
 *
 * Hors de ces cas (promo foil-only, holo S2 sans jumeau…) : pas de chip.
 */
export function ambiguousChecklistPrintKeys(
  cards: readonly Pick<ChecklistPrint, "printKey">[],
): ReadonlySet<string> {
  const counts = new Map<string, number>();
  /** `game|set|number` → printKeys de cette identité. */
  const stemKeys = new Map<string, Set<string>>();
  const out = new Set<string>();

  for (const card of cards) {
    const key = card.printKey.trim().toLowerCase();
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);

    const parsed = parsePrintKey(key);
    if (!parsed) continue;
    const stem = `${parsed.game}|${parsed.set}|${parsed.number}`;
    const bucket = stemKeys.get(stem) ?? new Set<string>();
    bucket.add(key);
    stemKeys.set(stem, bucket);
    if ((parsed.grouping ?? "").toLowerCase() === "prerelease") {
      out.add(key);
    }
  }

  for (const [key, n] of counts) {
    if (n > 1) out.add(key);
  }

  for (const keys of stemKeys.values()) {
    if (keys.size < 2) continue;
    const list = [...keys];
    const hasPrerelease = list.some(
      (k) => (parsePrintKey(k)?.grouping ?? "").toLowerCase() === "prerelease",
    );
    if (!hasPrerelease) continue;
    for (const k of list) out.add(k);
  }

  return out;
}

/** Afficher le chip / suffixe de finition pour cette ligne. */
export function checklistShouldShowFinish(input: {
  printKey: string;
  finish?: string | null;
  ambiguous: ReadonlySet<string>;
  /** `true` (défaut UI) : seulement si ambiguë. `false` : toute finition. */
  onlyWhenAmbiguous: boolean;
}): boolean {
  const finish = input.finish?.trim();
  if (!finish) return false;
  if (!input.onlyWhenAmbiguous) return true;
  return input.ambiguous.has(input.printKey.trim().toLowerCase());
}

/**
 * Clé d'appartenance master set **sans** set : `printKey|finish`.
 *
 * Préférer {@link checklistSetOwnedKey} dès qu'on a un `setCode`. La langue
 * est filtrée par l'appelant. Sans finish (carte plain seule, ou item sans
 * variante), le second segment est vide.
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
 * Clé d'appartenance **set-scoped**.
 *
 * - classique : `setCode|printKey` (ou `printKey` si set inconnu — legacy) ;
 * - master set : `setCode|printKey|finish` (ou `printKey|finish`).
 *
 * Un exemplaire tagué `s5` ne coche que la checklist S5, même si le même
 * `printKey` figure aussi en S1 (reprints Naruto).
 */
export function checklistSetOwnedKey(
  setCode: string | null | undefined,
  printKey: string,
  finish?: string | null,
): string {
  const set = (setCode ?? "").trim().toLowerCase();
  const base =
    finish !== undefined
      ? checklistOwnedKey(printKey, finish)
      : printKey.trim().toLowerCase();
  return set ? `${set}|${base}` : base;
}

/** La ligne checklist est-elle couverte par l'ensemble possédé ? */
export function isChecklistPrintOwned(
  owned: ReadonlySet<string>,
  print: Pick<ChecklistPrint, "setId" | "printKey" | "finish">,
  masterSet: boolean,
): boolean {
  const set = print.setId.trim().toLowerCase();
  const pk = print.printKey.trim().toLowerCase();
  if (masterSet) {
    const finishKey = checklistOwnedKey(pk, print.finish);
    return owned.has(`${set}|${finishKey}`) || owned.has(finishKey);
  }
  return owned.has(`${set}|${pk}`) || owned.has(pk);
}

/**
 * Réécrit les clés possédées pour le master set.
 *
 * Normalise la casse. Pour un `variant` vide (`printKey|` / `set|printKey|`),
 * mappe via {@link finishesOwnedByBlankVariant} : une seule finition catalogue
 * → cette finition ; plusieurs → seulement les plain. On ne coche jamais une
 * foil inventée — même règle que le pricing (blank = non-foil).
 *
 * Préserve un éventuel préfixe `setCode|`.
 */
export function resolveMasterSetOwned(input: {
  owned: ReadonlySet<string>;
  /** Finitions catalogue par printKey (minuscules). */
  finishesByPrintKey: ReadonlyMap<string, readonly string[]>;
  /** Plain finishes provider, quand il les annonce. */
  plainFinishesByPrintKey?: ReadonlyMap<string, readonly string[]>;
}): Set<string> {
  const resolved = new Set<string>();

  const expandBlank = (
    setCode: string | null,
    printKey: string,
  ): void => {
    const pk = printKey.trim().toLowerCase();
    const finishes = input.finishesByPrintKey.get(pk);
    const plains = input.plainFinishesByPrintKey?.get(pk);
    const mapped = finishesOwnedByBlankVariant(finishes, plains);
    if (mapped.length === 0) {
      resolved.add(checklistSetOwnedKey(setCode, pk, null));
      return;
    }
    for (const finish of mapped) {
      resolved.add(checklistSetOwnedKey(setCode, pk, finish));
    }
  };

  for (const key of input.owned) {
    const raw = key.trim().toLowerCase();
    const parts = raw.split("|");
    if (parts.length >= 3) {
      const [setCode, printKey, ...finishParts] = parts;
      const finish = finishParts.join("|");
      if (!finish.trim()) {
        expandBlank(setCode!, printKey!);
        continue;
      }
      resolved.add(checklistSetOwnedKey(setCode, printKey!, finish));
      continue;
    }
    if (parts.length === 2) {
      const [left, right] = parts;
      /*
        `printKey|finish` (printKey porte `:`) ou `set|printKey` legacy sans
        finish — le printKey porte toujours `:`.
      */
      if (left!.includes(":")) {
        if (!right!.trim()) {
          expandBlank(null, left!);
          continue;
        }
        resolved.add(checklistOwnedKey(left!, right));
        continue;
      }
      if (right!.includes(":")) {
        expandBlank(left!, right!);
        continue;
      }
      resolved.add(checklistOwnedKey(left!, right ?? ""));
      continue;
    }
    expandBlank(null, raw);
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
 * Rang de grouping dans un set :
 * 1. `prerelease` — avant-première / manga, chronologiquement avant le retail
 * 2. retail (pas de grouping)
 * 3. autres groupings (promos P1…) en fin, A→Z
 *
 * Un tri purement numérique mélangeait `20/204` et `20/P1` au milieu du set.
 */
function checklistGroupingRank(grouping: string): number {
  if (grouping === "prerelease") return -1;
  if (!grouping) return 0;
  return 1;
}

export function compareChecklistPrints(
  a: ChecklistPrint,
  b: ChecklistPrint,
): number {
  const ga = (parsePrintKey(a.printKey)?.grouping ?? "").toLowerCase();
  const gb = (parsePrintKey(b.printKey)?.grouping ?? "").toLowerCase();
  const byRank = checklistGroupingRank(ga) - checklistGroupingRank(gb);
  if (byRank !== 0) return byRank;
  if (ga !== gb) return ga.localeCompare(gb, "fr", { numeric: true });
  // Game hooks (e.g. Naruto Client → Ninja → Technique → Tactique) via printKey.
  const byPrint = comparePrintKeys(a.printKey, b.printKey);
  if (byPrint !== 0) return byPrint;
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
 * - mode classique : clés = `setCode|printKey` (ou `printKey` legacy) ;
 * - master set : clés = `setCode|printKey|finish` ({@link checklistSetOwnedKey}),
 *   et les `prints` sont déjà éclatés une ligne par finition.
 *
 * **Set-scoped** : posséder un tirage pour S5 ne coche pas S1, même si le
 * `printKey` est partagé (reprints Naruto). Pas d'expansion cross-set.
 */
/**
 * Identité d'une ligne check-list : `printKey|finish`. En master set, deux
 * finitions du même tirage sont deux trous — le plan d'achat ne doit pas les
 * fusionner dans un `Map` indexé par printKey seul.
 */
export function checklistRowIdentity(
  print: Pick<ChecklistPrint, "printKey" | "finish">,
): string {
  return `${print.printKey.trim().toLowerCase()}|${(print.finish ?? "")
    .trim()
    .toLowerCase()}`;
}

/**
 * Deux modules Lorcana (JSON + TCG) énumèrent le même set — sans dédup, la
 * check-list double chaque carte (`lorcana:q3-10` ×2 → clé React collision).
 */
function dedupeChecklistPrints(
  prints: readonly ChecklistPrint[],
): ChecklistPrint[] {
  const seen = new Set<string>();
  const out: ChecklistPrint[] = [];
  for (const print of prints) {
    const id = checklistRowIdentity(print);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(print);
  }
  return out;
}

export function buildShelfChecklist(input: {
  sets: readonly ChecklistSetInput[];
  prints: readonly ChecklistPrint[];
  owned: ReadonlySet<string>;
  language?: string | null;
  /** Une ligne par finition ; possession exacte printKey×finish. */
  masterSet?: boolean;
}): ShelfChecklist {
  const masterSet = Boolean(input.masterSet);
  const owned = input.owned;
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
  /** Même id poussé par deux catalogues (lorcanajson + lorcanatcg). */
  const seenSetIds = new Set<string>();

  for (const set of input.sets) {
    if (seenSetIds.has(set.id)) continue;
    seenSetIds.add(set.id);
    const prints = dedupeChecklistPrints(bySet.get(set.id) ?? []);
    if (!prints.length) {
      setsWithoutCatalogue.push(set);
      continue;
    }
    const cards = prints
      .map((print) => {
        const reference = referenceWithinSet(print.reference, set.label);
        return {
          ...print,
          reference,
          owned: isChecklistPrintOwned(owned, print, masterSet),
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
