/**
 * Harvest partial JA Dragon Ball Card Game titles from nikita.jp → curated ledger.
 */
import path from "node:path";

import { harvestNikitaCardlist } from "@/providers/shared/nikita/harvest";

import { dbsJccCuratedDir } from "../pack";
import {
  parseNikitaDbcCardlist,
  type NikitaDbcCard,
} from "../parse/nikitaDbc";

export function dbsJccJaLedgerPath(): string {
  return path.join(dbsJccCuratedDir(), "sources", "nikita-dbc-ja.json");
}

export async function harvestDbsJccJaFromNikita(): Promise<{
  cards: NikitaDbcCard[];
  outPath: string;
}> {
  return harvestNikitaCardlist({
    game: "dbc",
    parse: parseNikitaDbcCardlist,
    outPath: dbsJccJaLedgerPath(),
    extra: {
      note: "Partial nikita checklist — join onto FR D-/SP- printKeys; never invent missing JA names.",
    },
  });
}
