/**
 * Catalogue Ninja Ranks depuis la checklist officielle Inkworks (+ NS EU).
 *
 * Titres anglais — ce que l'éditeur US écrivait sur sa feuille (100 cartes).
 * Les NS1–6 (Ninja Sensei) sont un insert européen absent de cette feuille ;
 * ils vivent dans `european-ns-checklist.json` et sont semés à part.
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

type SupplementalChecklist = {
  source: string;
  cards: InkworksChecklistCard[];
};

type EuropeanNsChecklist = {
  source: string;
  notUs: boolean;
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

function writeLedgerCards(
  ledger: { source: string; cards: InkworksChecklistCard[] },
  opts: {
    dryRun?: boolean;
    index?: ReturnType<typeof createLocalPrintsIndex>;
  } = {},
): RanksLedgerBuildReport {
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
      sourceUrl: ledger.source,
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

export function buildNinjaRanksFromLedgers(
  opts: {
    dryRun?: boolean;
    index?: ReturnType<typeof createLocalPrintsIndex>;
  } = {},
): RanksLedgerBuildReport {
  const ledger = readInkworksChecklist();
  return writeLedgerCards(
    { source: ledger.wayback, cards: ledger.cards },
    opts,
  );
}

const EUROPEAN_NS_FILE = "european-ns-checklist.json";

export function europeanNsChecklistPath(): string {
  return path.join(narutoRanksCuratedDir(), "sources", EUROPEAN_NS_FILE);
}

export function readEuropeanNsChecklist(): EuropeanNsChecklist {
  return JSON.parse(
    readFileSync(europeanNsChecklistPath(), "utf8"),
  ) as EuropeanNsChecklist;
}

/** NS1–6 : insert EU, absent de la checklist Inkworks US. */
export function buildEuropeanNsFromLedger(
  opts: {
    dryRun?: boolean;
    index?: ReturnType<typeof createLocalPrintsIndex>;
  } = {},
): RanksLedgerBuildReport {
  return writeLedgerCards(readEuropeanNsChecklist(), opts);
}

const SUPPLEMENTAL_PROMOS_FILE = "supplemental-promos-checklist.json";

export function supplementalPromosChecklistPath(): string {
  return path.join(
    narutoRanksCuratedDir(),
    "sources",
    SUPPLEMENTAL_PROMOS_FILE,
  );
}

export function readSupplementalPromosChecklist(): SupplementalChecklist {
  return JSON.parse(
    readFileSync(supplementalPromosChecklistPath(), "utf8"),
  ) as SupplementalChecklist;
}

/** Promos attestées hors feuille Inkworks US (ex. PN-SD2006 SDCC). */
export function buildSupplementalPromosFromLedger(
  opts: {
    dryRun?: boolean;
    index?: ReturnType<typeof createLocalPrintsIndex>;
  } = {},
): RanksLedgerBuildReport {
  return writeLedgerCards(readSupplementalPromosChecklist(), opts);
}
