/**
 * Catalogue Mythos depuis les checklists LorenZone (KS1 + Shinobi Shiren).
 *
 * Autre jeu que Carddass / Ranks / Ultra / Kayou — `printGame: mythos`.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { createLocalPrintsIndex } from "@/providers/shared/cardCatalogue/localPrintsIndex";

import { NARUTO_MYTHOS_PACK_ID, narutoMythosCuratedDir } from "./pack";
import {
  NARUTO_MYTHOS_KS1_SET_CODE,
  mythosPrintKey,
} from "./printKey";

export type MythosChecklistCard = {
  printed: string;
  number: string;
  grouping: string | null;
  name: string;
  rarity: string | null;
  faceUrl?: string | null;
  note?: string;
};

export type MythosChecklist = {
  source: string;
  url: string;
  set: { code: string; label?: string; denominator?: number };
  cards: MythosChecklistCard[];
  note?: string;
};

const CHECKLIST_FILES = [
  "lorenzone-ks1-checklist.json",
  "lorenzone-ss2-checklist.json",
] as const;

/** Titres — KS1 FR ledger, SS2 SAMPLE EN until FR gallery lands. */
export const MYTHOS_TITLE_LANG = "fr";

export function mythosChecklistPath(
  file: string = CHECKLIST_FILES[0],
): string {
  return path.join(narutoMythosCuratedDir(), "sources", file);
}

export function readMythosChecklist(
  file: string = CHECKLIST_FILES[0],
): MythosChecklist {
  return JSON.parse(readFileSync(mythosChecklistPath(file), "utf8")) as MythosChecklist;
}

export function readAllMythosChecklists(): MythosChecklist[] {
  return CHECKLIST_FILES.flatMap((file) => {
    const p = mythosChecklistPath(file);
    if (!existsSync(p)) return [];
    return [readMythosChecklist(file)];
  });
}

export type MythosLedgerBuildReport = {
  rows: number;
  prints: number;
  titles: number;
  skipped: string[];
  sets: string[];
};

export function buildMythosFromLedgers(
  opts: {
    dryRun?: boolean;
    index?: ReturnType<typeof createLocalPrintsIndex>;
  } = {},
): MythosLedgerBuildReport {
  const ledgers = readAllMythosChecklists();
  const skipped: string[] = [];
  const rows = [];
  const sets = new Set<string>();

  for (const ledger of ledgers) {
    const setCode =
      ledger.set?.code?.trim().toLowerCase() || NARUTO_MYTHOS_KS1_SET_CODE;
    sets.add(setCode);
    const titleLang = setCode === NARUTO_MYTHOS_KS1_SET_CODE ? "fr" : "en";

    for (const card of ledger.cards) {
      const number = card.number.trim().toLowerCase();
      const grouping = card.grouping?.trim().toLowerCase() || null;
      const name = card.name.trim();
      const printKey = mythosPrintKey(setCode, number, grouping);
      if (!printKey || !name) {
        skipped.push(`${setCode}:${card.printed}`);
        continue;
      }
      rows.push({
        printKey,
        setCode,
        number,
        cardType: setCode,
        grouping,
        sourceUrl: ledger.url,
        titles: [
          {
            lang: titleLang,
            fullName: name,
            rarity: card.rarity?.trim() || null,
          },
        ],
      });
    }
  }

  const report: MythosLedgerBuildReport = {
    rows: ledgers.reduce((n, l) => n + l.cards.length, 0),
    prints: rows.length,
    titles: rows.length,
    skipped,
    sets: [...sets].sort(),
  };
  if (opts.dryRun) return report;

  const index = opts.index ?? createLocalPrintsIndex(NARUTO_MYTHOS_PACK_ID);
  index.writePrints(rows);
  return report;
}
