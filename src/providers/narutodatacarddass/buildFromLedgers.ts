/**
 * Catalogue Data Carddass depuis la checklist seed (cabinets DN / NM / NX).
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { createLocalPrintsIndex } from "@/providers/shared/cardCatalogue/localPrintsIndex";

import {
  NARUTO_DATA_CARDDASS_PACK_ID,
  narutoDataCarddassCuratedDir,
} from "./pack";
import {
  dataCarddassPrintKey,
  isDataCarddassSetCode,
  parseDataCarddassPrinted,
} from "./printKey";

export type DataCarddassChecklistCard = {
  printed: string;
  set: string;
  number: string;
  name: string;
  nameJa?: string | null;
  note?: string;
};

type Checklist = {
  source: string;
  url: string;
  cards: DataCarddassChecklistCard[];
};

const CHECKLIST_FILE = "data-carddass-checklist.json";

export const DATA_CARDDASS_TITLE_LANG = "ja";

export function dataCarddassChecklistPath(): string {
  return path.join(narutoDataCarddassCuratedDir(), "sources", CHECKLIST_FILE);
}

export function readDataCarddassChecklist(): Checklist {
  return JSON.parse(
    readFileSync(dataCarddassChecklistPath(), "utf8"),
  ) as Checklist;
}

export type DataCarddassLedgerBuildReport = {
  rows: number;
  prints: number;
  titles: number;
  skipped: string[];
};

export function buildDataCarddassFromLedgers(
  opts: {
    dryRun?: boolean;
    index?: ReturnType<typeof createLocalPrintsIndex>;
  } = {},
): DataCarddassLedgerBuildReport {
  const ledger = readDataCarddassChecklist();
  const skipped: string[] = [];
  const rows = [];

  for (const card of ledger.cards) {
    const parsed =
      parseDataCarddassPrinted(card.printed) ??
      (card.set && card.number && isDataCarddassSetCode(card.set)
        ? {
            set: card.set.trim().toLowerCase() as
              | "dn"
              | "nm"
              | "nf"
              | "nx"
              | "dnp"
              | "dmp"
              | "nfp"
              | "nfm",
            number: card.number.trim().toLowerCase(),
            printed: card.printed,
          }
        : null);
    if (!parsed || !isDataCarddassSetCode(parsed.set)) {
      skipped.push(card.printed);
      continue;
    }
    const name = (card.nameJa ?? card.name).trim();
    const printKey = dataCarddassPrintKey(parsed.set, parsed.number);
    if (!printKey || !name) {
      skipped.push(card.printed);
      continue;
    }
    rows.push({
      printKey,
      setCode: parsed.set,
      number: parsed.number,
      cardType: parsed.set,
      grouping: null,
      sourceUrl: ledger.url,
      titles: [
        {
          lang: DATA_CARDDASS_TITLE_LANG,
          fullName: name,
          rarity: null,
        },
      ],
    });
  }

  const report: DataCarddassLedgerBuildReport = {
    rows: ledger.cards.length,
    prints: rows.length,
    titles: rows.length,
    skipped,
  };
  if (opts.dryRun) return report;

  const index =
    opts.index ?? createLocalPrintsIndex(NARUTO_DATA_CARDDASS_PACK_ID);
  index.writePrints(rows);
  return report;
}
