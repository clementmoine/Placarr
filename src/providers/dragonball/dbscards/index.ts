import { createPrintKeyPriceModule } from "@/providers/shared/createPrintKeyPriceModule";

import type { DbscardsPriceCard } from "@/providers/dragonball/shared/dbscards/priceIndex";

import { fetchDbscardsCardForPrintKey } from "./fetch";

export {
  fetchDbscardsCardForPrintKey,
  loadDbscardsPriceIndex,
  loadDbscardsPriceIndexFromDisk,
  resetDbscardsPriceIndexCache,
} from "./fetch";

/**
 * Prix-only. Id `dbsmarket` (pas `dbscards`) : l'étape Catalogue Sync et les
 * packs staging portent déjà le slug site `dbscards`.
 */
export const dbsmarketModule = createPrintKeyPriceModule<DbscardsPriceCard>({
  providerId: "dbsmarket",
  label: "dbscards.fr",
  priceSource: "dbscards",
  currency: "EUR",
  websiteUrl: "https://www.dbscards.fr/",
  notes:
    "Cotes Cardmarket EUR (dumps listes dbscards.fr / fw.dbscards.fr) pour Dragon Ball Super Masters et Fusion World. Match par printKey ; SPR→PR aliasé quand Bandai a classé le parallel en `_PR`. Fichiers locaux — pas de HTTP au refresh.",
  referencePriceSource: true,
  evidenceOnlyPriceRefresh: true,
  supplyMode: "scrape_cache",
  mappingProbe: {
    sampleInput: "dbscg:bt2-103",
    context: {
      name: "Frappe cruelle de Freezer",
      printKey: "dbscg:bt2-103",
    },
  },
  fetchCard: (printKey, { ctx }) =>
    fetchDbscardsCardForPrintKey(printKey, {
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
