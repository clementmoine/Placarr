/**
 * Les extras officiels japonais d'après 巻ノ壱…十七 : `promo.shtml`. Titres seuls.
 *
 * Les listes 幕 et 学 étaient lues ici aussi, jusqu'au 2026-08-21. Elles
 * décrivent un **autre jeu** — le 疾風伝 de 2007 — que ce pack fusionnait dans
 * son index pour le refiltrer à la sortie : du travail fait pour être jeté. Les
 * deux registres sont partis avec leur jeu.
 */
import promoLedger from "../curated/sources/carddas-jp-promo.json";
import {
  canonicalizeNarutoPrintKey,
  mintNarutoPrintKey,
  narutoDiskCardId,
  parseNarutoCollector,
} from "../collectorIdentity";
import type { NarutoPrintRow, NarutoTitleRow } from "../indexStore";
import { cardTypeFromCollectorNumber } from "./parseBandaicgAsset";

export type CarddasJpExtraRow = {
  printed: string;
  number: string;
  name: string;
  setCode: string;
};

export function carddasJpPromoCards(): CarddasJpExtraRow[] {
  return promoLedger.cards as CarddasJpExtraRow[];
}

function mergeJaRows(
  input: { prints: NarutoPrintRow[]; titles: NarutoTitleRow[] },
  rows: readonly CarddasJpExtraRow[],
): {
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

  for (const row of rows) {
    const printKey = mintNarutoPrintKey(row.number);
    if (!printKey) continue;
    const diskId = narutoDiskCardId(row.number) ?? row.number;
    const parsed = parseNarutoCollector(row.number);
    if (!printByKey.has(printKey)) {
      const print: NarutoPrintRow = {
        printKey,
        setCode: row.setCode,
        number: diskId,
        cardType: cardTypeFromCollectorNumber(diskId),
        family: parsed?.family ?? null,
        grouping: parsed?.grouping ?? null,
      };
      prints.push(print);
      printByKey.set(printKey, print);
      addedPrints.push(printKey);
    }
    const titleKey = `${printKey}\0ja`;
    if (titleKeys.has(titleKey)) continue;
    const name = row.name.trim();
    if (!name) continue;
    titles.push({ printKey, lang: "ja", fullName: name });
    titleKeys.add(titleKey);
    titled.push(printKey);
  }

  prints.sort((a, b) => a.printKey.localeCompare(b.printKey));
  addedPrints.sort((a, b) => a.localeCompare(b));
  titled.sort((a, b) => a.localeCompare(b));
  return { prints, titles, addedPrints, titled };
}

export function mergeCarddasJpPromoIntoIndex(input: {
  prints: NarutoPrintRow[];
  titles: NarutoTitleRow[];
}) {
  return mergeJaRows(input, carddasJpPromoCards());
}
