/**
 * Catalogue Mythos — checklist officielle CICABOOM en priorité,
 * LorenZone en secours si l’API n’a pas encore été harvestée.
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

const LORENZONE_FILES = [
  "lorenzone-ks1-checklist.json",
  "lorenzone-ss2-checklist.json",
] as const;

const OFFICIAL_CHECKLIST = "narutotcgmythos-checklist.json";

/** Titres — FR pour KS1 / promo ; EN pour SS2 quand FR gallery est vide. */
export const MYTHOS_TITLE_LANG = "fr";

export function mythosChecklistPath(
  file: string = LORENZONE_FILES[0],
): string {
  return path.join(narutoMythosCuratedDir(), "sources", file);
}

export function mythosOfficialChecklistPath(): string {
  return mythosChecklistPath(OFFICIAL_CHECKLIST);
}

export function readMythosChecklist(
  file: string = LORENZONE_FILES[0],
): MythosChecklist {
  return JSON.parse(
    readFileSync(mythosChecklistPath(file), "utf8"),
  ) as MythosChecklist;
}

function officialAsChecklists(): MythosChecklist[] {
  const p = mythosOfficialChecklistPath();
  if (!existsSync(p)) return [];
  const raw = JSON.parse(readFileSync(p, "utf8")) as {
    sets?: {
      code: string;
      label?: string;
      cards: MythosChecklistCard[];
    }[];
  };
  return (raw.sets ?? []).map((set) => ({
    source: "cards.narutotcgmythos.com",
    url: "https://www.narutotcgmythos.com/fr/galerie",
    set: { code: set.code, label: set.label },
    cards: set.cards,
  }));
}

function lorenzoneChecklists(): MythosChecklist[] {
  return LORENZONE_FILES.flatMap((file) => {
    const p = mythosChecklistPath(file);
    if (!existsSync(p)) return [];
    return [readMythosChecklist(file)];
  });
}

/** Officiel si présent, sinon LorenZone. */
export function readAllMythosChecklists(): MythosChecklist[] {
  const official = officialAsChecklists();
  if (official.length) return official;
  return lorenzoneChecklists();
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
    const titleLang = setCode === "ss2" ? "en" : MYTHOS_TITLE_LANG;

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
