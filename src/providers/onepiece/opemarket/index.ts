import { createPrintKeyPriceModule } from "@/providers/shared/createPrintKeyPriceModule";
import {
  fetchBandaiCardsFrCardForPrintKey,
  type CardsFrBandaiPriceSpec,
} from "@/providers/shared/tcgcards/cardsFrPriceFetch";
import type { DbscardsPriceCard } from "@/providers/shared/tcgcards/priceIndex";
import { opecardsIndexPath } from "@/providers/shared/tcgcards/scrapeList";

const SPEC: CardsFrBandaiPriceSpec = {
  cacheId: "opemarket",
  game: "onepiece",
  origin: "https://www.opecards.fr",
  indexPath: opecardsIndexPath("fr"),
};

/**
 * Prix-only. Id `opemarket` (pas `opecards`) : le dump liste / staging scellé
 * portent déjà le slug site.
 */
export const opemarketModule = createPrintKeyPriceModule<DbscardsPriceCard>({
  providerId: "opemarket",
  label: "opecards.fr",
  priceSource: "opecards",
  currency: "EUR",
  websiteUrl: "https://www.opecards.fr/",
  notes:
    "Cotes Cardmarket EUR (dump liste opecards.fr) pour One Piece Card Game. Match par printKey ; parallèles slug → -p1. Fichier local — pas de HTTP au refresh.",
  referencePriceSource: true,
  evidenceOnlyPriceRefresh: true,
  supplyMode: "scrape_cache",
  printGame: "onepiece",
  mappingProbe: {
    sampleInput: "onepiece:op17-001",
    context: {
      name: "Edward Newgate",
      printKey: "onepiece:op17-001",
    },
  },
  fetchCard: (printKey, { ctx }) =>
    fetchBandaiCardsFrCardForPrintKey(printKey, SPEC, {
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
