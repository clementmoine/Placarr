/**
 * Harvest JA Bleach Soul Card Battle ledger from nikita.jp.
 */
import path from "node:path";

import { harvestNikitaCardlist } from "@/providers/shared/nikita/harvest";

import { bleachScbSyncedSourcePath } from "../pack";
import {
  parseNikitaBlcCardlist,
  type NikitaBlcCard,
} from "../parse/nikita";

export function bleachJaLedgerPath(): string {
  return bleachScbSyncedSourcePath("soul-card-battle-ja.json");
}

export async function harvestBleachJaFromNikita(): Promise<{
  cards: NikitaBlcCard[];
  outPath: string;
}> {
  return harvestNikitaCardlist({
    game: "blc",
    parse: parseNikitaBlcCardlist,
    outPath: bleachJaLedgerPath(),
    serializeCards: (cards) =>
      cards.map((c) => ({
        printed: c.printed,
        set: c.set,
        number: c.number,
        nameJa: c.nameJa,
        faceUrlJa: c.faceUrlJa,
        type: c.cardType ?? undefined,
        note: c.setLabel ? `nikita · ${c.setLabel}` : "nikita",
      })),
  });
}
