/**
 * EN titles for unofficial Drive fansets — human-validated OCR.
 * Fills missing EN; re-syncs rows already stamped `fanset-ocr-validated`.
 */
import ledger from "../curated/sources/fanset-en-titles.json";
import {
  canonicalizeNarutoPrintKey,
  mintNarutoPrintKey,
} from "../collectorIdentity";
import type { NarutoPrintRow, NarutoTitleRow } from "../indexStore";

export type FansetEnTitleRow = (typeof ledger.cards)[number];

export function fansetEnTitleCards(): FansetEnTitleRow[] {
  return ledger.cards;
}

export function mergeFansetEnTitlesIntoIndex(input: {
  prints: NarutoPrintRow[];
  titles: NarutoTitleRow[];
}): {
  prints: NarutoPrintRow[];
  titles: NarutoTitleRow[];
  titled: string[];
} {
  const prints = [...input.prints];
  const titles = [...input.titles];
  const printKeys = new Set(
    prints.map((p) => canonicalizeNarutoPrintKey(p.printKey)),
  );
  const titleKeys = new Set(
    titles.map(
      (t) =>
        `${canonicalizeNarutoPrintKey(t.printKey)}\0${t.lang.toLowerCase()}`,
    ),
  );
  const titled: string[] = [];

  for (const row of fansetEnTitleCards()) {
    const printKey = mintNarutoPrintKey(row.number);
    if (!printKey || !printKeys.has(printKey)) continue;
    const name = row.name.trim();
    if (!name) continue;

    const existing = titles.find(
      (t) =>
        canonicalizeNarutoPrintKey(t.printKey) === printKey &&
        t.lang.toLowerCase() === "en",
    );
    if (existing) {
      if (existing.nameSource !== "fanset-ocr-validated") continue;
      if (existing.fullName.trim() === name) continue;
      existing.fullName = name;
      titled.push(printKey);
      continue;
    }

    titles.push({
      printKey,
      lang: "en",
      fullName: name,
      nameSource: "fanset-ocr-validated",
    });
    titleKeys.add(`${printKey}\0en`);
    titled.push(printKey);
  }

  titled.sort((a, b) => a.localeCompare(b));
  return { prints, titles, titled };
}
