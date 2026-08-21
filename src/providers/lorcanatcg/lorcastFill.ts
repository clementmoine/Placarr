/**
 * Boucher les trous de LorcanaJSON avec Lorcast, sans jamais le contredire.
 *
 * LorcanaJSON porte le catalogue : quatre langues, les masques de foil et de
 * vernis, les finitions. Mais il ne publie pas tout. Mesuré le 2026-08-21
 * contre nos 3 241 tirages : `36/P2` — Mickey Mouse – True Friend, la promo
 * puzzle — lui manque, et avec elle cinq autres promos P2, quatre C2 et les
 * dix-huit cartes du Format Coconut, un set promo entier. Rien de tout cela
 * n'était trouvable dans l'appli, et rien ne le signalait.
 *
 * Ce module n'ajoute donc qu'un tirage que LorcanaJSON ignore. Il ne remplace
 * aucun fait, et il dit d'où viennent ses octets : les faces qu'il fait
 * télécharger portent `.lorcast.` dans leur nom.
 *
 * Trois écarts de modèle, réglés ici et nulle part ailleurs :
 *
 * 1. **Le set d'une promo n'est pas le même des deux côtés.** LorcanaJSON range
 *    une promo sous l'extension de la carte qu'elle réimprime — `10/P3` est en
 *    set 1, celui du Mickey d'origine — et note `P3` à part. Lorcast ne connaît
 *    que ce qui est imprimé : `P3`. L'extension de base est donc irrécupérable
 *    depuis Lorcast, et la deviner par le nom serait une invention :
 *    `Mickey Mouse - True Friend` existe en set 1 **et** en set 9. Une promo
 *    venue de Lorcast est rangée sous son code imprimé, qui devient à la fois
 *    son set et son groupe promo. Elle apparaît comme sa propre extension dans
 *    le sélecteur — le trou reste visible plutôt que d'être comblé au jugé.
 * 2. **La numérotation de `cp` contredit celle de `C1`.** Ce sont les mêmes
 *    neuf cartes, numérotées autrement : Lorcast dit `25/41/42/43` là où
 *    LorcanaJSON dit `1/2/3/4`. Rien n'y manque, et les fusionner créerait
 *    quatre fantômes. Le set est écarté — voir {@link LORCAST_SETS_NOT_FILLED}.
 * 3. **`25ja` / `25zh` ne sont pas des numéros de collection.** Ce sont les
 *    tirages japonais et chinois du même `25/P1`, que Lorcast départage par la
 *    langue. Chez nous la langue est portée par l'exemplaire, jamais par la clé
 *    de tirage : {@link COLLECTOR_NUMBER} les refuse.
 */
import { buildPrintKey } from "@/core/identify/printKey";
import {
  loadLorcastCatalogue,
  type LorcastCataloguePrint,
  type LorcastSet,
} from "@/providers/lorcast/catalogue";
import {
  LORCANA_GAME,
  normalizeLorcanaSearchText,
} from "@/providers/lorcanajson/fetch";

/**
 * Ce qu'un numéro de collection peut être : des chiffres, et au plus **une**
 * lettre de variante (`24b`). Tout le reste porte autre chose que ce qui est
 * imprimé, et n'ancre donc rien.
 */
const COLLECTOR_NUMBER = /^(\d+)([a-z]?)$/;

/** Un code purement numérique est une extension principale, pas une promo. */
const MAIN_SET_CODE = /^\d+$/;

/**
 * Sets de Lorcast qu'on ne fusionne pas, et pourquoi.
 *
 * Écrit ici plutôt que deviné : un set écarté en silence est un trou qu'on ne
 * retrouve plus. La clé est le code Lorcast en minuscules.
 */
export const LORCAST_SETS_NOT_FILLED: Readonly<Record<string, string>> = {
  cp: "mêmes neuf cartes que C1 chez LorcanaJSON, numérotées autrement (25/41/42/43 contre 1/2/3/4) : rien n'y manque, et les fusionner créerait des doublons",
};

export type LorcastFillPrint = LorcastCataloguePrint & {
  printKey: string;
  /** Numéro sans la lettre de variante. */
  baseNumber: string;
  variant: string | null;
  /** Le code promo, quand le set n'est pas une extension numérotée. */
  promoGrouping: string | null;
  fullName: string;
  searchName: string;
};

/**
 * L'ancre d'un trou : le code imprimé et le numéro, sans la variante.
 *
 * Volontairement plus grossière que la clé de tirage. Une variante qu'on
 * ajouterait sous un numéro déjà connu — Lorcast liste `24` et `24B` là où
 * LorcanaJSON liste `24A` et `24B` — est bien plus probablement un désaccord de
 * modèle qu'un tirage réellement absent, et un doublon coûte plus cher qu'un
 * oubli.
 */
export function lorcanaGapKey(input: {
  setCode: string | null | undefined;
  promoGrouping?: string | null;
  number: string | number | null | undefined;
}): string | null {
  const code = (input.promoGrouping || input.setCode || "")
    .trim()
    .toUpperCase();
  const number = String(input.number ?? "")
    .trim()
    .toLowerCase();
  const match = COLLECTOR_NUMBER.exec(number);
  if (!code || !match) return null;
  return `${code}|${Number(match[1])}`;
}

/** Le tirage Lorcast tel que le pack le rangerait, ou `null` s'il n'ancre rien. */
export function toLorcastFillPrint(
  print: LorcastCataloguePrint,
): LorcastFillPrint | null {
  const number = print.collectorNumber.trim().toLowerCase();
  const match = COLLECTOR_NUMBER.exec(number);
  if (!match) return null;

  const printKey = buildPrintKey({
    game: LORCANA_GAME,
    set: print.setCode,
    number,
  });
  if (!printKey) return null;

  const fullName = print.version
    ? `${print.name} - ${print.version}`
    : print.name;

  return {
    ...print,
    printKey,
    baseNumber: String(Number(match[1])),
    variant: match[2] || null,
    promoGrouping: MAIN_SET_CODE.test(print.setCode)
      ? null
      : print.setCode.toUpperCase(),
    fullName,
    searchName: normalizeLorcanaSearchText(fullName),
  };
}

/**
 * Ce que Lorcast apporte et que le catalogue n'a pas.
 *
 * `covered` porte les {@link lorcanaGapKey} déjà tenues par LorcanaJSON.
 */
export function selectLorcastFillPrints(
  prints: readonly LorcastCataloguePrint[],
  covered: ReadonlySet<string>,
): LorcastFillPrint[] {
  const fill: LorcastFillPrint[] = [];
  const seen = new Set<string>();
  for (const print of prints) {
    const candidate = toLorcastFillPrint(print);
    if (!candidate) continue;
    const gap = lorcanaGapKey({
      setCode: candidate.setCode,
      promoGrouping: candidate.promoGrouping,
      number: candidate.baseNumber,
    });
    if (!gap || covered.has(gap) || seen.has(candidate.printKey)) continue;
    seen.add(candidate.printKey);
    fill.push(candidate);
  }
  return fill;
}

export function lorcastSkipReason(set: LorcastSet): string | null {
  return LORCAST_SETS_NOT_FILLED[set.code.trim().toLowerCase()] ?? null;
}

export type LorcastFillResult = {
  prints: LorcastFillPrint[];
  /** Ce qu'il s'est passé, prêt à être journalisé par le scrape. */
  notes: string[];
};

/**
 * Le complément, en échec assumé.
 *
 * LorcanaJSON porte le catalogue ; Lorcast n'en bouche que les trous. Une panne
 * de Lorcast doit donc coûter les tirages qu'il apporte, jamais la moisson
 * entière — on la journalise et on continue.
 */
export async function loadLorcastFill(
  covered: ReadonlySet<string>,
  options: { signal?: AbortSignal } = {},
): Promise<LorcastFillResult> {
  const notes: string[] = [];
  try {
    const catalogue = await loadLorcastCatalogue({
      signal: options.signal,
      skipSet: lorcastSkipReason,
    });
    const prints = selectLorcastFillPrints(catalogue.prints, covered);

    for (const skip of catalogue.skipped) {
      notes.push(`set ${skip.setCode} écarté — ${skip.reason}`);
    }
    for (const failure of catalogue.failed) {
      notes.push(`set ${failure.setCode} illisible — ${failure.error}`);
    }
    const bySet = new Map<string, number>();
    for (const print of prints) {
      bySet.set(print.setCode, (bySet.get(print.setCode) ?? 0) + 1);
    }
    notes.push(
      `${catalogue.prints.length} tirages lus, ${prints.length} absents du catalogue` +
        (bySet.size
          ? ` (${[...bySet].map(([set, n]) => `${set}×${n}`).join(", ")})`
          : ""),
    );
    return { prints, notes };
  } catch (error) {
    notes.push(
      `complément ignoré — ${error instanceof Error ? error.message : String(error)}`,
    );
    return { prints: [], notes };
  }
}
