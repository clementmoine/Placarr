/**
 * CCG Trader — DBS Masters game index (secondary to Bandai / dbscards).
 */
import {
  harvestCcgtraderSets,
  type CcgtraderSetsLedger,
} from "@/providers/shared/ccgtrader/harvestSets";

import { DBS_CG_PACK_ID } from "../indexStore";
import ledger from "../curated/sources/ccgtrader.json";

export const DBSCG_CCGTRADER_URL_TITLE = ledger.api.urlTitle;

export async function harvestDbscgCcgtraderSets(opts?: {
  signal?: AbortSignal;
}): Promise<CcgtraderSetsLedger> {
  return harvestCcgtraderSets({
    packId: DBS_CG_PACK_ID,
    urlTitle: DBSCG_CCGTRADER_URL_TITLE,
    signal: opts?.signal,
  });
}
