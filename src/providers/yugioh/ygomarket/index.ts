import { createPrintKeyPriceModule } from "@/providers/shared/createPrintKeyPriceModule";
import { ygocardsTileToPrintKey } from "@/providers/shared/tcgcards/cardsFrPrintRef";
import {
  fetchMappedCardsFrCardForPrintKey,
  type CardsFrMappedPriceSpec,
} from "@/providers/shared/tcgcards/cardsFrPriceFetch";
import type { DbscardsPriceCard } from "@/providers/shared/tcgcards/priceIndex";
import { ygocardsIndexPath } from "@/providers/shared/tcgcards/scrapeList";

const SPEC: CardsFrMappedPriceSpec = {
  cacheId: "ygomarket",
  game: "yugioh",
  origin: "https://www.ygocards.fr",
  indexPath: ygocardsIndexPath("fr"),
  printKeyOf: (tile) => ygocardsTileToPrintKey(tile),
};

/**
 * Prix-only. Id `ygomarket` (pas `ygocards`) : le dump liste / staging scellé
 * portent déjà le slug site.
 */
export const ygomarketModule = createPrintKeyPriceModule<DbscardsPriceCard>({
  providerId: "ygomarket",
  label: "ygocards.fr",
  priceSource: "ygocards",
  currency: "EUR",
  websiteUrl: "https://www.ygocards.fr/",
  notes:
    "Cotes Cardmarket EUR (dump liste ygocards.fr) pour Yu-Gi-Oh!. Match par printKey. Fichier local — pas de HTTP au refresh.",
  referencePriceSource: true,
  evidenceOnlyPriceRefresh: true,
  supplyMode: "scrape_cache",
  printGame: "yugioh",
  mappingProbe: {
    sampleInput: "yugioh:ra03-fr001",
    context: {
      name: "Malveillant - HÉROS de la Destinée",
      printKey: "yugioh:ra03-fr001",
    },
  },
  fetchCard: (printKey, { ctx }) =>
    fetchMappedCardsFrCardForPrintKey(printKey, SPEC, {
      evidenceOnly: Boolean(ctx.evidenceOnly),
    }),
  priceRows: (card) => [
    {
      condition: "new",
      priceCents: card.priceCents,
      productName: card.name,
      ...(card.sourceUrl ? { sourceUrl: card.sourceUrl } : {}),
    },
  ],
});
