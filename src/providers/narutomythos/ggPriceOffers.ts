/**
 * Côtes narutocardgame.gg mythos → printKey `mythos:ks1-####`.
 */
import type { PriceOfferInput } from "@/core/enrich/evidence";
import type { BarcodePriceRefreshContext } from "@/types/providerModule";
import {
  mythosGgNumberToPrintKey,
  refreshGgArchivePriceOffers,
  type GgPriceRow,
} from "@/providers/shared/naruto/ggArchivePrices";

import { NARUTO_MYTHOS_PACK_ID, NARUTO_MYTHOS_PRINT_GAME } from "./pack";

export function resolveMythosGgPricePrintKey(row: GgPriceRow): string | null {
  return mythosGgNumberToPrintKey(row.number ?? "");
}

export async function refreshMythosGgPriceOffers(
  ctx: BarcodePriceRefreshContext,
): Promise<PriceOfferInput[]> {
  return refreshGgArchivePriceOffers({
    ctx,
    packId: NARUTO_MYTHOS_PACK_ID,
    printGame: NARUTO_MYTHOS_PRINT_GAME,
    resolvePrintKey: resolveMythosGgPricePrintKey,
  });
}
