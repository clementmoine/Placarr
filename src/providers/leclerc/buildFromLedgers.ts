/**
 * Catalogue Leclerc promo — checklists curated → `LocalPrintWrite` per opération.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { createLocalPrintsIndex } from "@/providers/shared/cardCatalogue/localPrintsIndex";

import { leclercOpForSetCode } from "./pack";
import { leclercCuratedDir } from "./curatedPaths";
import {
  buildLeclercFixeezLookup,
  type LeclercFixeezLookupRow,
} from "./parseColekaLeclerc";
import { leclercPrintKey } from "./printKey";


export type LeclercChecklistCard = {
  number: string;
  name: string;
  kind?: "card" | "fixeez";
  /** Coleka / CDN aliases when the listing title ≠ checklist label. */
  aka?: string[];
  rarity?: string | null;
  note?: string;
  href?: string;
};

export type LeclercChecklist = {
  source: string;
  url?: string | null;
  set: { code: string; label?: string; year?: number; franchise?: string };
  cards: LeclercChecklistCard[];
};

const TITLE_LANG = "fr";

export function leclercChecklistPaths(): string[] {
  const dir = path.join(leclercCuratedDir(), "sources");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => /^leclerc-.+-checklist\.json$/i.test(name))
    .map((name) => path.join(dir, name))
    .sort();
}

export function readLeclercChecklist(file: string): LeclercChecklist {
  return JSON.parse(readFileSync(file, "utf8")) as LeclercChecklist;
}

export function readAllLeclercChecklists(): LeclercChecklist[] {
  return leclercChecklistPaths().map(readLeclercChecklist);
}

export function readLeclercChecklistForSet(
  setCode: string,
): LeclercChecklist | null {
  const code = setCode.trim().toLowerCase();
  return (
    readAllLeclercChecklists().find(
      (ledger) => ledger.set?.code?.trim().toLowerCase() === code,
    ) ?? null
  );
}

/** Fixeez name → `fNN` for Coleka listings that omit F numbers. */
export function leclercFixeezLookupForSet(
  setCode: string,
): Map<string, string> {
  const ledger = readLeclercChecklistForSet(setCode);
  if (!ledger) return new Map();
  const rows: LeclercFixeezLookupRow[] = ledger.cards
    .filter((card) => card.kind === "fixeez" || /^f\d/i.test(card.number))
    .map((card) => ({
      number: card.number,
      name: card.name,
      ...(card.aka?.length ? { aka: card.aka } : {}),
    }));
  return buildLeclercFixeezLookup(rows);
}

export type LeclercLedgerBuildReport = {
  setCode: string;
  rows: number;
  prints: number;
  titles: number;
  skipped: string[];
  sets: string[];
  placeholders: number;
};

export function buildLeclercFromLedgers(
  opts: {
    setCode: string;
    dryRun?: boolean;
    index?: ReturnType<typeof createLocalPrintsIndex>;
  },
): LeclercLedgerBuildReport {
  const setCode = opts.setCode.trim().toLowerCase();
  const op = leclercOpForSetCode(setCode);
  const ledger = readLeclercChecklistForSet(setCode);
  const skipped: string[] = [];
  const rows = [];
  let placeholders = 0;

  if (!ledger) {
    return {
      setCode,
      rows: 0,
      prints: 0,
      titles: 0,
      skipped: [`(no checklist for ${setCode})`],
      sets: [],
      placeholders: 0,
    };
  }

  for (const card of ledger.cards) {
    const number = card.number.trim().toLowerCase();
    const name = card.name.trim();
    const printKey = leclercPrintKey(setCode, number);
    if (!printKey || !name) {
      skipped.push(`${setCode}:${card.number}`);
      continue;
    }
    if (card.note) placeholders += 1;
    const kind = card.kind === "fixeez" ? "fixeez" : "card";
    rows.push({
      printKey,
      setCode,
      number,
      cardType: setCode,
      grouping: null,
      category: kind,
      sourceUrl: ledger.url?.trim() || null,
      titles: [
        {
          lang: TITLE_LANG,
          fullName: name,
          rarity: card.rarity?.trim() || (kind === "fixeez" ? "Fixeez" : null),
        },
      ],
    });
  }

  const report: LeclercLedgerBuildReport = {
    setCode,
    rows: ledger.cards.length,
    prints: rows.length,
    titles: rows.length,
    skipped,
    sets: [setCode],
    placeholders,
  };
  if (opts.dryRun) return report;

  const packId = op?.packId ?? `leclerc/${setCode}`;
  const index = opts.index ?? createLocalPrintsIndex(packId);
  index.writePrints(rows);
  return report;
}
