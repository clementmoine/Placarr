/**
 * Inject the 10 S1 FR manga prerelease variants as distinct printKeys
 * (`naruto:ni-0019-prerelease`, …) even without art yet.
 *
 * Source: `curated/sources/s1-fr-prerelease.json`.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import {
  canonicalizeNarutoPrintKey,
  mintNarutoPrintKey,
  narutoDiskCardId,
  parseNarutoCollector,
} from "../collectorIdentity";
import { narutoCuratedSourcesDir } from "../curatedPaths";
import type { NarutoPrintRow, NarutoTitleRow } from "../indexStore";
import { cardTypeFromCollectorNumber } from "../parse/parseBandaicgAsset";

export type S1FrPrereleaseRow = {
  number: string;
  name: string;
  notes?: string;
};

type S1FrPrereleaseFile = {
  setCode?: string;
  grouping?: string;
  cards?: S1FrPrereleaseRow[];
};

const GROUPING = "prerelease";
const SET_CODE = "s1";

export function s1FrPrereleasePath(): string {
  return path.join(narutoCuratedSourcesDir(), "s1-fr-prerelease.json");
}

export function loadS1FrPrerelease(
  filePath = s1FrPrereleasePath(),
): S1FrPrereleaseRow[] {
  if (!existsSync(filePath)) return [];
  try {
    const raw = JSON.parse(readFileSync(filePath, "utf8")) as S1FrPrereleaseFile;
    return (raw.cards ?? []).filter(
      (row) =>
        typeof row?.number === "string" &&
        row.number.trim() &&
        typeof row?.name === "string" &&
        row.name.trim(),
    );
  } catch {
    return [];
  }
}

/** `ni019` → `naruto:ni-0019-prerelease`. */
export function s1FrPrereleasePrintKey(number: string): string | null {
  const bare = number.trim().toLowerCase().replace(/-prerelease$/i, "");
  return mintNarutoPrintKey(`${bare}-${GROUPING}`, SET_CODE);
}

/**
 * Ensure every attested S1 manga prerelease has an `s1` print + FR title.
 * Art can arrive later under `cards/ninja|…/{id}-prerelease/fr/`.
 */
export function mergeS1FrPrerelease(input: {
  prints: NarutoPrintRow[];
  titles: NarutoTitleRow[];
  cards?: S1FrPrereleaseRow[];
}): {
  prints: NarutoPrintRow[];
  titles: NarutoTitleRow[];
  addedPrints: string[];
  titled: string[];
} {
  const cards = input.cards ?? loadS1FrPrerelease();
  const prints = [...input.prints];
  const titles = [...input.titles];
  const printByKey = new Map(prints.map((p) => [p.printKey, p]));
  const printByCanonical = new Map(
    prints.map((p) => [canonicalizeNarutoPrintKey(p.printKey), p]),
  );
  const titleByKey = new Map(
    titles
      .filter((t) => t.lang.toLowerCase() === "fr")
      .map((t) => [canonicalizeNarutoPrintKey(t.printKey), t]),
  );
  const addedPrints: string[] = [];
  const titled: string[] = [];

  for (const row of cards) {
    const printKey = s1FrPrereleasePrintKey(row.number);
    if (!printKey) continue;
    const bare = row.number.trim().toLowerCase().replace(/-prerelease$/i, "");
    const disk =
      narutoDiskCardId(`${bare}-${GROUPING}`, SET_CODE) ??
      `${bare}-${GROUPING}`;
    const number = disk;
    const grouping =
      parseNarutoCollector(number)?.grouping?.toLowerCase() ?? GROUPING;

    if (!printByKey.has(printKey) && !printByCanonical.has(printKey)) {
      const print: NarutoPrintRow = {
        printKey,
        setCode: SET_CODE,
        number,
        cardType: cardTypeFromCollectorNumber(bare),
        family: parseNarutoCollector(bare)?.family ?? null,
        grouping,
      };
      prints.push(print);
      printByKey.set(printKey, print);
      printByCanonical.set(printKey, print);
      addedPrints.push(printKey);
    }

    const existing = titleByKey.get(printKey);
    if (!existing) {
      const title: NarutoTitleRow = {
        printKey,
        lang: "fr",
        fullName: row.name.trim(),
        rarity: GROUPING,
      };
      titles.push(title);
      titleByKey.set(printKey, title);
      titled.push(printKey);
    } else {
      if (!existing.fullName.trim() && row.name.trim()) {
        existing.fullName = row.name.trim();
        titled.push(printKey);
      }
      if (existing.rarity !== GROUPING) {
        existing.rarity = GROUPING;
        titled.push(printKey);
      }
      // Prefer the ledger name when it differs (e.g. TA-005 Kyubi).
      if (row.name.trim() && existing.fullName !== row.name.trim()) {
        existing.fullName = row.name.trim();
        titled.push(printKey);
      }
    }
  }

  prints.sort((a, b) => a.printKey.localeCompare(b.printKey));
  return { prints, titles, addedPrints, titled };
}
