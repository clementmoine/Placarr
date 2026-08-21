/**
 * BGG `narutotcglist.xls` (filepage 20590) — Bandai USA CCG Series 1
 * checklist. Source of truth: `curated/sources/bgg-en-ccg-s1.json`.
 *
 * Names stay as the 2006 sheet wrote them. Printed refs are N/J/M.
 * Not TCDB `PTH*`, not Carddass `NI/TE`. Not `cards/s1/en/`.
 */
import {
  canonicalizeNarutoPrintKey,
  mintNarutoPrintKey,
  narutoDiskCardId,
  parseNarutoCollector,
} from "./collectorIdentity";
import ledger from "./curated/sources/bgg-en-ccg-s1.json";
import type { NarutoPrintRow, NarutoTitleRow } from "./indexStore";
import { cardTypeFromCollectorNumber } from "./parseBandaicgAsset";
import { parseEnCcgPrintedRef, type EnCcgPrinted } from "./parseEnCcgPrinted";

export type BggNarutoListRow = (typeof ledger.cards)[number];

/** Appearance only — EN Path to Hokage, not Carddass FR Série 1 folders. */
export const BGG_EN_CCG_S1_SET = "s1";
export const BGG_EN_CCG_S1_LANG = "en";

export function bggEnCcgS1Ledger() {
  return ledger;
}

export function bggEnCcgS1Cards(): BggNarutoListRow[] {
  return ledger.cards;
}

/** `N` + `001` → printed `N-001` → `n001`. */
export function bggEnCcgPrinted(row: BggNarutoListRow): EnCcgPrinted | null {
  return parseEnCcgPrintedRef(`${row.type}-${row.number}`);
}

/**
 * Inject Path to Hokage prints + EN titles. No faces — do not write
 * `cards/s1/en/`. `naruto:n-0001` stays distinct from `naruto:ni-0001`.
 */
export function mergeBggEnCcgS1IntoIndex(input: {
  prints: NarutoPrintRow[];
  titles: NarutoTitleRow[];
}): {
  prints: NarutoPrintRow[];
  titles: NarutoTitleRow[];
  addedPrints: string[];
  titled: string[];
} {
  const prints = [...input.prints];
  const titles = [...input.titles];
  const printByKey = new Map(
    prints.map((p) => [canonicalizeNarutoPrintKey(p.printKey), p]),
  );
  const titleKeys = new Set(
    titles.map(
      (t) =>
        `${canonicalizeNarutoPrintKey(t.printKey)}\0${t.lang.toLowerCase()}`,
    ),
  );
  const addedPrints: string[] = [];
  const titled: string[] = [];

  for (const row of bggEnCcgS1Cards()) {
    const printed = bggEnCcgPrinted(row);
    if (!printed?.number || printed.usExclusive) continue;
    const printKey = mintNarutoPrintKey(printed.number);
    if (!printKey) continue;
    const diskId = narutoDiskCardId(printed.number) ?? printed.number;
    const parsed = parseNarutoCollector(printed.number);

    if (!printByKey.has(printKey)) {
      const print: NarutoPrintRow = {
        printKey,
        setCode: BGG_EN_CCG_S1_SET,
        number: diskId,
        cardType: cardTypeFromCollectorNumber(diskId),
        family: parsed?.family ?? null,
      };
      prints.push(print);
      printByKey.set(printKey, print);
      addedPrints.push(printKey);
    }

    const name = row.name.trim();
    if (!name) continue;
    const titleKey = `${printKey}\0${BGG_EN_CCG_S1_LANG}`;
    if (titleKeys.has(titleKey)) continue;
    titles.push({
      printKey,
      lang: BGG_EN_CCG_S1_LANG,
      fullName: name,
      rarity: row.rarity?.trim() || null,
    });
    titleKeys.add(titleKey);
    titled.push(printKey);
  }

  prints.sort((a, b) => a.printKey.localeCompare(b.printKey));
  addedPrints.sort((a, b) => a.localeCompare(b));
  titled.sort((a, b) => a.localeCompare(b));
  return { prints, titles, addedPrints, titled };
}
