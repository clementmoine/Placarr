/**
 * Catalogue Ultra Challenge depuis la checklist laststicker.
 *
 * Le pack n'avait aucune carte. Le verso de l'album en est bien une, mais il
 * n'existe chez nous qu'en upscale, qui brouille les numéros — d'où le refus,
 * juste, d'en tirer des titres. laststicker publie la même information sans
 * cette incertitude : cent numéros, cent noms, vingt-cinq personnages à quatre
 * cartes chacun.
 *
 * Titres français : c'est une collection Panini France / Suisse / Espagne, et
 * la page lue est celle du catalogue français. Aucune rareté n'est publiée, et
 * le champ reste vide plutôt que deviné.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { createLocalPrintsIndex } from "@/providers/shared/cardCatalogue/localPrintsIndex";

import { NARUTO_ULTRA_PACK_ID, narutoUltraCuratedDir } from "./pack";
import { NARUTO_ULTRA_SET_CODE, ultraChallengePrintKey } from "./printKey";

export type UltraChecklistCard = {
  printed: string;
  number: string;
  name: string;
};

type Checklist = {
  source: string;
  url: string;
  ingest: string;
  cards: UltraChecklistCard[];
};

const CHECKLIST_FILE = "laststicker-checklist.json";

/** Langue des titres : la collection est distribuée en France. */
export const ULTRA_TITLE_LANG = "fr";

export function ultraChecklistPath(): string {
  return path.join(narutoUltraCuratedDir(), "sources", CHECKLIST_FILE);
}

export function readUltraChecklist(): Checklist {
  return JSON.parse(readFileSync(ultraChecklistPath(), "utf8")) as Checklist;
}

export type UltraLedgerBuildReport = {
  rows: number;
  prints: number;
  titles: number;
  skipped: string[];
};

export function buildUltraChallengeFromLedgers(
  opts: {
    dryRun?: boolean;
    index?: ReturnType<typeof createLocalPrintsIndex>;
  } = {},
): UltraLedgerBuildReport {
  const ledger = readUltraChecklist();
  const skipped: string[] = [];
  const rows = [];

  for (const card of ledger.cards) {
    const printKey = ultraChallengePrintKey(card.number);
    const name = card.name.trim();
    // Une carte sans clé ou sans nom n'est pas une carte à demi : on la laisse
    // dehors et on la nomme, plutôt que d'inscrire une ligne creuse.
    if (!printKey || !name) {
      skipped.push(card.printed);
      continue;
    }
    rows.push({
      printKey,
      setCode: NARUTO_ULTRA_SET_CODE,
      number: card.number.trim().toLowerCase(),
      cardType: NARUTO_ULTRA_SET_CODE,
      sourceUrl: ledger.url,
      titles: [{ lang: ULTRA_TITLE_LANG, fullName: name, rarity: null }],
    });
  }

  const report: UltraLedgerBuildReport = {
    rows: ledger.cards.length,
    prints: rows.length,
    titles: rows.length,
    skipped,
  };
  if (opts.dryRun) return report;

  const index = opts.index ?? createLocalPrintsIndex(NARUTO_ULTRA_PACK_ID);
  index.writePrints(rows);
  return report;
}
