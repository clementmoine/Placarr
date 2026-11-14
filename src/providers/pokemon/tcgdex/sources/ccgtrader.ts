/**
 * CCG Trader — Pokémon TCG set index (secondary to TCGdex).
 */
import {
  harvestCcgtraderSets,
  type CcgtraderSetsLedger,
} from "@/providers/shared/ccgtrader/harvestSets";

import { POKEMON_PACK_ID } from "../../paths";
import ledger from "../curated/sources/ccgtrader.json";

export const POKEMON_CCGTRADER_URL_TITLE = ledger.api.urlTitle;

export async function harvestPokemonCcgtraderSets(opts?: {
  signal?: AbortSignal;
}): Promise<CcgtraderSetsLedger> {
  return harvestCcgtraderSets({
    packId: POKEMON_PACK_ID,
    urlTitle: POKEMON_CCGTRADER_URL_TITLE,
    signal: opts?.signal,
  });
}
