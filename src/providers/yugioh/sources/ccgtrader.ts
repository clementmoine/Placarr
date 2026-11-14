/**
 * CCG Trader — Yu-Gi-Oh! TCG set index (secondary to YGOPRODeck).
 */
import {
  harvestCcgtraderSets,
  type CcgtraderSetsLedger,
} from "@/providers/shared/ccgtrader/harvestSets";

import { YUGIOH_PACK_ID } from "../pack";
import ledger from "../curated/sources/ccgtrader.json";

export const YUGIOH_CCGTRADER_URL_TITLE = ledger.api.urlTitle;

export async function harvestYugiohCcgtraderSets(opts?: {
  signal?: AbortSignal;
}): Promise<CcgtraderSetsLedger> {
  return harvestCcgtraderSets({
    packId: YUGIOH_PACK_ID,
    urlTitle: YUGIOH_CCGTRADER_URL_TITLE,
    signal: opts?.signal,
  });
}
