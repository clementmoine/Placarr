/**
 * CCG Trader — Magic set index (secondary to Scryfall).
 */
import {
  harvestCcgtraderSets,
  type CcgtraderSetsLedger,
} from "@/providers/shared/ccgtrader/harvestSets";

import { MTG_PACK_ID } from "../pack";
import ledger from "../curated/sources/ccgtrader.json";

export const MTG_CCGTRADER_URL_TITLE = ledger.api.urlTitle;

export async function harvestMtgCcgtraderSets(opts?: {
  signal?: AbortSignal;
}): Promise<CcgtraderSetsLedger> {
  return harvestCcgtraderSets({
    packId: MTG_PACK_ID,
    urlTitle: MTG_CCGTRADER_URL_TITLE,
    signal: opts?.signal,
  });
}
