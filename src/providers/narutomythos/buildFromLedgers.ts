/**
 * Catalogue Mythos depuis la checklist LorenZone (Konoha Shidō Ch.1).
 *
 * Autre jeu que Carddass / Ranks / Ultra / Kayou — `printGame: mythos`.
 */
import { readFileSync } from "node:fs";
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

type Checklist = {
  source: string;
  url: string;
  set: { code: string };
  cards: MythosChecklistCard[];
};

const CHECKLIST_FILE = "lorenzone-ks1-checklist.json";

/** Titres FR — checklist boutique française. */
export const MYTHOS_TITLE_LANG = "fr";

export function mythosChecklistPath(): string {
  return path.join(narutoMythosCuratedDir(), "sources", CHECKLIST_FILE);
}

export function readMythosChecklist(): Checklist {
  return JSON.parse(readFileSync(mythosChecklistPath(), "utf8")) as Checklist;
}

export type MythosLedgerBuildReport = {
  rows: number;
  prints: number;
  titles: number;
  skipped: string[];
};

export function buildMythosFromLedgers(
  opts: {
    dryRun?: boolean;
    index?: ReturnType<typeof createLocalPrintsIndex>;
  } = {},
): MythosLedgerBuildReport {
  const ledger = readMythosChecklist();
  const setCode =
    ledger.set?.code?.trim().toLowerCase() || NARUTO_MYTHOS_KS1_SET_CODE;
  const skipped: string[] = [];
  const rows = [];

  for (const card of ledger.cards) {
    const number = card.number.trim().toLowerCase();
    const grouping = card.grouping?.trim().toLowerCase() || null;
    const name = card.name.trim();
    const printKey = mythosPrintKey(setCode, number, grouping);
    if (!printKey || !name) {
      skipped.push(card.printed);
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
          lang: MYTHOS_TITLE_LANG,
          fullName: name,
          rarity: card.rarity?.trim() || null,
        },
      ],
    });
  }

  const report: MythosLedgerBuildReport = {
    rows: ledger.cards.length,
    prints: rows.length,
    titles: rows.length,
    skipped,
  };
  if (opts.dryRun) return report;

  const index = opts.index ?? createLocalPrintsIndex(NARUTO_MYTHOS_PACK_ID);
  index.writePrints(rows);
  return report;
}
