/**
 * Titres français du set de base — checklist carte 72 + bandeaux imprimés.
 *
 * Pas de traduction déduite : chaque entrée pointe vers une attestation dans
 * `french-titles.json`. Quatre numéros restent volontairement absents.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  createLocalPrintsIndex,
  type LocalPrintsIndex,
} from "@/providers/shared/cardCatalogue/localPrintsIndex";

import { ninjaRanksPrintKey } from "./printKey";
import { NARUTO_RANKS_PACK_ID, narutoRanksCuratedDir } from "./pack";

export type FrenchTitleEntry = {
  number: string;
  name: string;
  attestedBy: string;
};

export type FrenchTitlesLedger = {
  source: string;
  observed: string;
  ingest: string;
  lang: string;
  note: string;
  missing: { number: string; nameEn: string; why: string }[];
  cards: FrenchTitleEntry[];
};

const LEDGER_FILE = "french-titles.json";
const SET_CODE = "nr";

export function frenchTitlesLedgerPath(): string {
  return path.join(narutoRanksCuratedDir(), "sources", LEDGER_FILE);
}

export function readFrenchTitlesLedger(): FrenchTitlesLedger {
  return JSON.parse(
    readFileSync(frenchTitlesLedgerPath(), "utf8"),
  ) as FrenchTitlesLedger;
}

export type FrenchTitlesBuildReport = {
  ledgerRows: number;
  titles: number;
  skipped: string[];
  missing: string[];
};

export function buildFrenchNinjaRanksTitles(
  opts: {
    dryRun?: boolean;
    index?: LocalPrintsIndex;
  } = {},
): FrenchTitlesBuildReport {
  const ledger = readFrenchTitlesLedger();
  const skipped: string[] = [];
  const rows = [];

  for (const card of ledger.cards) {
    const printKey = ninjaRanksPrintKey(SET_CODE, card.number);
    if (!printKey) {
      skipped.push(card.number);
      continue;
    }
    const name = card.name.trim();
    if (!name) {
      skipped.push(card.number);
      continue;
    }
    rows.push({
      printKey,
      setCode: SET_CODE,
      number: card.number.trim().toLowerCase(),
      cardType: SET_CODE,
      sourceUrl: ledger.source,
      titles: [{ lang: "fr", fullName: name, rarity: null }],
    });
  }

  const report: FrenchTitlesBuildReport = {
    ledgerRows: ledger.cards.length,
    titles: rows.length,
    skipped,
    missing: ledger.missing.map((row) => row.number),
  };
  if (opts.dryRun) return report;

  const index = opts.index ?? createLocalPrintsIndex(NARUTO_RANKS_PACK_ID);
  index.writePrints(rows);
  return report;
}
