/**
 * Catalogue Défi Ninja depuis la checklist seed (50 cartes 404 Éditions).
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { createLocalPrintsIndex } from "@/providers/shared/cardCatalogue/localPrintsIndex";

import { NARUTO_DEFI_NINJA_PACK_ID, narutoDefiNinjaCuratedDir } from "./pack";
import {
  NARUTO_DEFI_NINJA_SET_CODE,
  defiNinjaPrintKey,
} from "./printKey";

export type DefiNinjaChecklistCard = {
  printed: string;
  number: string;
  name: string;
  note?: string;
};

type Checklist = {
  source: string;
  url: string;
  ean?: string;
  set: { code: string; cardCount?: number };
  cards: DefiNinjaChecklistCard[];
};

const CHECKLIST_FILE = "defi-ninja-checklist.json";

export const DEFI_NINJA_TITLE_LANG = "fr";

export function defiNinjaChecklistPath(): string {
  return path.join(narutoDefiNinjaCuratedDir(), "sources", CHECKLIST_FILE);
}

export function readDefiNinjaChecklist(): Checklist {
  return JSON.parse(readFileSync(defiNinjaChecklistPath(), "utf8")) as Checklist;
}

export type DefiNinjaLedgerBuildReport = {
  rows: number;
  prints: number;
  titles: number;
  skipped: string[];
};

export function buildDefiNinjaFromLedgers(
  opts: {
    dryRun?: boolean;
    index?: ReturnType<typeof createLocalPrintsIndex>;
  } = {},
): DefiNinjaLedgerBuildReport {
  const ledger = readDefiNinjaChecklist();
  const setCode =
    ledger.set?.code?.trim().toLowerCase() || NARUTO_DEFI_NINJA_SET_CODE;
  const skipped: string[] = [];
  const rows = [];

  for (const card of ledger.cards) {
    const number = card.number.trim().toLowerCase();
    const name = card.name.trim();
    const printKey = defiNinjaPrintKey(number);
    if (!printKey || !name) {
      skipped.push(card.printed);
      continue;
    }
    rows.push({
      printKey,
      setCode,
      number,
      cardType: setCode,
      grouping: null,
      sourceUrl: ledger.url,
      titles: [
        {
          lang: DEFI_NINJA_TITLE_LANG,
          fullName: name,
          rarity: null,
        },
      ],
    });
  }

  const report: DefiNinjaLedgerBuildReport = {
    rows: ledger.cards.length,
    prints: rows.length,
    titles: rows.length,
    skipped,
  };
  if (opts.dryRun) return report;

  const index = opts.index ?? createLocalPrintsIndex(NARUTO_DEFI_NINJA_PACK_ID);
  index.writePrints(rows);
  return report;
}
