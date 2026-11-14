import { createPrintKeyPriceModule } from "@/providers/shared/createPrintKeyPriceModule";
import { mtgcardsSlugToPrintKey } from "@/providers/shared/tcgcards/cardsFrPrintRef";
import {
  fetchMappedCardsFrCardForPrintKey,
  type CardsFrMappedPriceSpec,
} from "@/providers/shared/tcgcards/cardsFrPriceFetch";
import type { DbscardsPriceCard } from "@/providers/shared/tcgcards/priceIndex";
import { mtgcardsIndexPath } from "@/providers/shared/tcgcards/scrapeList";

const SPEC: CardsFrMappedPriceSpec = {
  cacheId: "mtgmarket",
  game: "mtg",
  origin: "https://www.mtgcards.fr",
  indexPath: mtgcardsIndexPath("fr"),
  printKeyOf: (tile) => mtgcardsSlugToPrintKey(tile.slug),
};

/**
 * Prix-only. Id `mtgmarket` (pas `mtgcards`) : le dump liste / staging scellé
 * portent déjà le slug site.
 */
export const mtgmarketModule = createPrintKeyPriceModule<DbscardsPriceCard>({
  providerId: "mtgmarket",
  label: "mtgcards.fr",
  priceSource: "mtgcards",
  currency: "EUR",
  websiteUrl: "https://www.mtgcards.fr/",
  notes:
    "Cotes Cardmarket EUR (dump liste mtgcards.fr) pour Magic: The Gathering. Match par printKey. Fichier local — pas de HTTP au refresh.",
  referencePriceSource: true,
  evidenceOnlyPriceRefresh: true,
  supplyMode: "scrape_cache",
  printGame: "mtg",
  mappingProbe: {
    sampleInput: "mtg:tdm-1",
    context: {
      name: "Ugin, l'Œil des Tempêtes",
      printKey: "mtg:tdm-1",
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
