/**
 * Côtes narutocardgame.gg pour Kayou — index staging → printKey via cards-index.
 */
import { existsSync, readFileSync } from "node:fs";

import type { PriceOfferInput } from "@/core/enrich/evidence";
import { packCardsIndexPath } from "@/lib/packPaths";
import type { BarcodePriceRefreshContext } from "@/types/providerModule";
import type { CardsIndexV1 } from "@/effects/cardsIndex";
import {
  kayouGgNumberToCard,
  refreshGgArchivePriceOffers,
  type GgPriceRow,
} from "@/providers/shared/naruto/ggArchivePrices";

import { NARUTO_KAYOU_PACK_ID, NARUTO_KAYOU_PRINT_GAME } from "./pack";

let cardToPrintKey: Map<string, string> | null = null;

function kayouCardIndex(): Map<string, string> {
  if (cardToPrintKey) return cardToPrintKey;
  const map = new Map<string, string>();
  const file = packCardsIndexPath(NARUTO_KAYOU_PACK_ID);
  if (!existsSync(file)) {
    cardToPrintKey = map;
    return map;
  }
  try {
    const index = JSON.parse(readFileSync(file, "utf8")) as CardsIndexV1;
    for (const [printKey, entry] of Object.entries(index.cards ?? {})) {
      const card = entry.card?.trim().toLowerCase();
      if (card) map.set(card, printKey);
    }
  } catch {
    /* empty */
  }
  cardToPrintKey = map;
  return map;
}

export function resetKayouGgPriceIndexCache(): void {
  cardToPrintKey = null;
}

export function resolveKayouGgPricePrintKey(row: GgPriceRow): string | null {
  const card =
    kayouGgNumberToCard(row.number ?? "") ||
    kayouGgNumberToCard(
      row.href?.split("/").pop()?.replace(/-[a-z].*$/i, "") ?? "",
    );
  if (!card) return null;
  return kayouCardIndex().get(card) ?? null;
}

export async function refreshKayouGgPriceOffers(
  ctx: BarcodePriceRefreshContext,
): Promise<PriceOfferInput[]> {
  return refreshGgArchivePriceOffers({
    ctx,
    packId: NARUTO_KAYOU_PACK_ID,
    printGame: NARUTO_KAYOU_PRINT_GAME,
    resolvePrintKey: resolveKayouGgPricePrintKey,
  });
}
