/**
 * Coleka deals prices for Naruto Ultra Challenge (`_r18770`).
 */
import path from "node:path";

import {
  harvestColekaDealsForPack,
  writeColekaPriceLedger,
  type ColekaDealsRubriqueTarget,
  type ColekaPriceLedger,
} from "@/providers/shared/coleka/dealsHarvest";

import {
  COLEKA_ULTRA_CARD_COUNT,
  parseColekaUltraRef,
} from "../parse/coleka";
import { NARUTO_ULTRA_PACK_ID } from "../pack";
import { ultraChallengePrintKey } from "../printKey";

const RUBRIQUE_ID = "18770";

export function colekaUltraPriceLedgerPath(): string {
  return path.join(
    process.cwd(),
    "src/providers/naruto/narutoultra/curated/sources",
    "coleka-prices.json",
  );
}

function ultraTargets(): ColekaDealsRubriqueTarget[] {
  return [
    {
      rubriqueId: RUBRIQUE_ID,
      label: "Ultra Challenge",
      listedCount: COLEKA_ULTRA_CARD_COUNT,
      resolvePrintKey: (deal) => {
        const parsed = parseColekaUltraRef(deal.refItem ?? "");
        if (!parsed) return null;
        return ultraChallengePrintKey(parsed.number);
      },
      resolvePrinted: (deal) => parseColekaUltraRef(deal.refItem ?? "")?.printed ?? null,
    },
  ];
}

export async function harvestColekaUltraPrices(
  opts: { signal?: AbortSignal } = {},
): Promise<{ ledger: ColekaPriceLedger; outPath: string }> {
  const ledger = await harvestColekaDealsForPack(
    NARUTO_ULTRA_PACK_ID,
    ultraTargets(),
    opts,
  );
  const outPath = writeColekaPriceLedger(colekaUltraPriceLedgerPath(), ledger);
  return { ledger, outPath };
}
