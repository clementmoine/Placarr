/**
 * Coleka deals prices for Bleach Serie 1 (`_r37171`).
 */
import path from "node:path";

import {
  harvestColekaDealsForPack,
  writeColekaPriceLedger,
  type ColekaDealsRubriqueTarget,
  type ColekaPriceLedger,
} from "@/providers/shared/coleka/dealsHarvest";
import { normalizeColekaRefItem } from "@/providers/shared/coleka/deals";

import { readColekaBleachLedger } from "./coleka";
import { BLEACH_SCB_PACK_ID, bleachScbCuratedDir } from "../pack";
import {
  bleachScbPrintKey,
  parseBleachScbPrinted,
} from "../printKey";

const RUBRIQUE_ID = "37171";

export function colekaBleachPriceLedgerPath(): string {
  return path.join(bleachScbCuratedDir(), "sources", "coleka-prices.json");
}

function bleachTargets(): ColekaDealsRubriqueTarget[] {
  const listed = readColekaBleachLedger()?.listedCount ?? 71;
  return [
    {
      rubriqueId: RUBRIQUE_ID,
      label: "Bleach Serie 1 FR",
      listedCount: listed,
      resolvePrintKey: (deal) => {
        const compact = normalizeColekaRefItem(deal.refItem);
        if (!compact) return null;
        const parsed = parseBleachScbPrinted(compact);
        if (!parsed) return null;
        return bleachScbPrintKey(parsed.set, parsed.number);
      },
      resolvePrinted: (deal) => {
        const compact = normalizeColekaRefItem(deal.refItem);
        if (!compact) return null;
        return parseBleachScbPrinted(compact)?.printed ?? compact;
      },
    },
  ];
}

export async function harvestColekaBleachS1Prices(
  opts: { signal?: AbortSignal } = {},
): Promise<{ ledger: ColekaPriceLedger; outPath: string }> {
  const ledger = await harvestColekaDealsForPack(
    BLEACH_SCB_PACK_ID,
    bleachTargets(),
    opts,
  );
  const outPath = writeColekaPriceLedger(
    colekaBleachPriceLedgerPath(),
    ledger,
  );
  return { ledger, outPath };
}
