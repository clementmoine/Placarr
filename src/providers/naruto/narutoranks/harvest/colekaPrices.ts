/**
 * Coleka deals prices for Naruto Ninja Ranks (`_r25928`).
 */
import path from "node:path";

import {
  harvestColekaDealsForPack,
  writeColekaPriceLedger,
  type ColekaDealsRubriqueTarget,
  type ColekaPriceLedger,
} from "@/providers/shared/coleka/dealsHarvest";

import { parseColekaPrintedRef } from "../parse/catalogues";
import { NARUTO_RANKS_PACK_ID } from "../pack";
import { ninjaRanksPrintKey } from "../printKey";

const RUBRIQUE_ID = "25928";

export function colekaRanksPriceLedgerPath(): string {
  return path.join(
    process.cwd(),
    "src/providers/naruto/narutoranks/curated/sources",
    "coleka-prices.json",
  );
}

function ranksTargets(): ColekaDealsRubriqueTarget[] {
  return [
    {
      rubriqueId: RUBRIQUE_ID,
      label: "Ninja Ranks",
      listedCount: 102,
      resolvePrintKey: (deal) => {
        const parsed = parseColekaPrintedRef(deal.refItem ?? "");
        if (!parsed) return null;
        return ninjaRanksPrintKey(parsed.setCode, parsed.number);
      },
      resolvePrinted: (deal) =>
        parseColekaPrintedRef(deal.refItem ?? "")?.printed ?? null,
    },
  ];
}

export async function harvestColekaRanksPrices(
  opts: { signal?: AbortSignal } = {},
): Promise<{ ledger: ColekaPriceLedger; outPath: string }> {
  const ledger = await harvestColekaDealsForPack(
    NARUTO_RANKS_PACK_ID,
    ranksTargets(),
    opts,
  );
  const outPath = writeColekaPriceLedger(colekaRanksPriceLedgerPath(), ledger);
  return { ledger, outPath };
}
