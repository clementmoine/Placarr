/**
 * Catalogue Ninja Ranks depuis la checklist officielle Inkworks.
 *
 * Titres anglais seulement — c'est ce que le site éditeur écrivait. Pas de
 * faces, pas des NS européennes absentes de cette feuille.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { createLocalPrintsIndex } from "@/providers/shared/cardCatalogue/localPrintsIndex";

import { ninjaRanksPrintKey } from "./printKey";
import { NARUTO_RANKS_PACK_ID, narutoRanksCuratedDir } from "./pack";

export type InkworksChecklistCard = {
  printed: string;
  setCode: string;
  number: string;
  name: string;
  rarity?: string;
};

type Checklist = {
  source: string;
  wayback: string;
  ingest: string;
  cards: InkworksChecklistCard[];
};

const CHECKLIST_FILE = "inkworks-checklist.json";

export function inkworksChecklistPath(): string {
  return path.join(narutoRanksCuratedDir(), "sources", CHECKLIST_FILE);
}

export function readInkworksChecklist(): Checklist {
  return JSON.parse(readFileSync(inkworksChecklistPath(), "utf8")) as Checklist;
}

export type RanksLedgerBuildReport = {
  rows: number;
  prints: number;
  titles: number;
  skipped: string[];
};

export function buildNinjaRanksFromLedgers(
  opts: {
    dryRun?: boolean;
    index?: ReturnType<typeof createLocalPrintsIndex>;
  } = {},
): RanksLedgerBuildReport {
  const ledger = readInkworksChecklist();
  const skipped: string[] = [];
  const rows = [];

  for (const card of ledger.cards) {
    const printKey = ninjaRanksPrintKey(card.setCode, card.number);
    if (!printKey) {
      skipped.push(card.printed);
      continue;
    }
    const name = card.name.trim();
    if (!name) {
      skipped.push(card.printed);
      continue;
    }
    rows.push({
      printKey,
      setCode: card.setCode.trim().toLowerCase(),
      number: card.number.trim().toLowerCase(),
      cardType: card.setCode.trim().toLowerCase(),
      sourceUrl: ledger.wayback,
      titles: [
        {
          lang: "en",
          fullName: name,
          rarity: card.rarity ?? null,
        },
      ],
    });
  }

  const report: RanksLedgerBuildReport = {
    rows: ledger.cards.length,
    prints: rows.length,
    titles: rows.length,
    skipped,
  };
  if (opts.dryRun) return report;

  const index = opts.index ?? createLocalPrintsIndex(NARUTO_RANKS_PACK_ID);
  index.writePrints(rows);
  return report;
}
