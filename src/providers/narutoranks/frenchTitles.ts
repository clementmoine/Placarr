/**
 * Titres français — checklist carte 72 (`french-titles.json`, set `nr`) +
 * bandeaux attestés hors base (`language-specific-cards.json`, sets `ff` / `sd`…).
 *
 * Les titres italiens attestés du même ledger sont semés ici aussi. Les noms
 * partagés (personnages identiques d'une édition à l'autre) sont recopiés
 * depuis l'anglais ensuite — jamais inventés, jamais écrasés.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  createLocalPrintsIndex,
  type LocalPrintsIndex,
} from "@/providers/shared/cardCatalogue/localPrintsIndex";

import { ninjaRanksPrintKey } from "./printKey";
import { NARUTO_RANKS_PACK_ID, narutoRanksCuratedDir } from "./pack";

/** Locales EU hors EN : noms partagés = titre Inkworks, sauf attestation. */
export const NINJA_RANKS_SHARED_TITLE_LANGS = ["fr", "it"] as const;

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

type LanguageSpecificLedger = {
  languageSpecific: Array<{
    setCode?: string;
    number: string;
    fr?: string | null;
    it?: string | null;
  }>;
};

const LEDGER_FILE = "french-titles.json";
const LANGUAGE_SPECIFIC_FILE = "language-specific-cards.json";
const SET_CODE = "nr";

export function frenchTitlesLedgerPath(): string {
  return path.join(narutoRanksCuratedDir(), "sources", LEDGER_FILE);
}

export function languageSpecificCardsPath(): string {
  return path.join(narutoRanksCuratedDir(), "sources", LANGUAGE_SPECIFIC_FILE);
}

export function readFrenchTitlesLedger(): FrenchTitlesLedger {
  return JSON.parse(
    readFileSync(frenchTitlesLedgerPath(), "utf8"),
  ) as FrenchTitlesLedger;
}

function readLanguageSpecificTitles(): Array<{
  setCode: string;
  number: string;
  lang: string;
  name: string;
}> {
  const ledger = JSON.parse(
    readFileSync(languageSpecificCardsPath(), "utf8"),
  ) as LanguageSpecificLedger;
  const out: Array<{
    setCode: string;
    number: string;
    lang: string;
    name: string;
  }> = [];
  for (const row of ledger.languageSpecific ?? []) {
    const setCode = (row.setCode ?? SET_CODE).trim().toLowerCase() || SET_CODE;
    const number = row.number.trim().toLowerCase();
    /*
      Base `nr` FR : checklist `french-titles.json` (ex. « Groupe 7 puzzle »).
      Les bandeaux `fr` du ledger language-specific ne sont que corroboration
      (« GROUPE 7 ») — on ne les réécrit pas. L'italien, lui, n'a pas d'autre
      source : on le prend dès qu'il est attesté, y compris sur `nr`.
    */
    if (setCode !== SET_CODE) {
      const fr = row.fr?.trim();
      if (fr) out.push({ setCode, number, lang: "fr", name: fr });
    }
    const it = row.it?.trim();
    if (it) out.push({ setCode, number, lang: "it", name: it });
  }
  return out;
}

export type FrenchTitlesBuildReport = {
  ledgerRows: number;
  languageSpecificRows: number;
  titles: number;
  sharedFromEnglish: number;
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

  const supplemental = readLanguageSpecificTitles();
  for (const card of supplemental) {
    const printKey = ninjaRanksPrintKey(card.setCode, card.number);
    if (!printKey) {
      skipped.push(`${card.setCode}-${card.number}-${card.lang}`);
      continue;
    }
    rows.push({
      printKey,
      setCode: card.setCode,
      number: card.number,
      cardType: card.setCode,
      sourceUrl: `curated/sources/${LANGUAGE_SPECIFIC_FILE}`,
      titles: [{ lang: card.lang, fullName: card.name, rarity: null }],
    });
  }

  const report: FrenchTitlesBuildReport = {
    ledgerRows: ledger.cards.length,
    languageSpecificRows: supplemental.length,
    titles: rows.length,
    sharedFromEnglish: 0,
    skipped,
    missing: ledger.missing.map((row) => row.number),
  };
  if (opts.dryRun) return report;

  const index = opts.index ?? createLocalPrintsIndex(NARUTO_RANKS_PACK_ID);
  index.writePrints(rows);
  /*
    Noms partagés (Naruto, Sakura, NW-*, …) : le titre Inkworks EN vaut pour
    FR/IT tant qu'aucune attestation locale ne l'a remplacé ci-dessus.
  */
  const shared = index.fillMissingTitlesFromEnglish(NINJA_RANKS_SHARED_TITLE_LANGS);
  report.sharedFromEnglish = shared.copied;
  return report;
}
