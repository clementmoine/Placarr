import {
  createPrintKeyPriceModule,
  dualFinishPriceRows,
} from "@/providers/shared/createPrintKeyPriceModule";

import {
  dotggCardLabel,
  fetchDotggCardForPrintKey,
  type DotggCardPrices,
} from "./fetch";

export {
  fetchDotggCardForPrintKey,
  loadDotggPriceIndex,
  mapDotggCard,
  priceIndexFromDotggCards,
  lookupDotggCard,
} from "./fetch";
export {
  dotggLookupFromPrintKey,
  padDotggMainSetId,
  dotggPromoSetFromGrouping,
} from "./match";

export const lorcanaggModule = createPrintKeyPriceModule<DotggCardPrices>({
  providerId: "lorcanagg",
  label: "Lorcana.gg",
  priceSource: "Lorcana.gg",
  currency: "EUR",
  websiteUrl: "https://lorcana.gg/",
  notes:
    "Cotes Cardmarket EUR (DotGG dump) pour Disney Lorcana. Match par printKey (set paddé / promo Pn). Complète Lorcast sur les promos sans TCGPlayer.",
  referencePriceSource: true,
  evidenceOnlyPriceRefresh: true,
  mappingProbe: {
    sampleInput: "lorcana:1-1",
    context: { name: "Ariel - On Human Legs", printKey: "lorcana:1-1" },
  },
  fetchCard: (printKey, { signal, ctx }) =>
    fetchDotggCardForPrintKey(printKey, {
      signal,
      evidenceOnly: Boolean(ctx.evidenceOnly),
    }),
  priceRows: (card) =>
    dualFinishPriceRows({
      label: dotggCardLabel(card),
      newCents: card.cmPriceCents,
      foilCents: card.cmFoilPriceCents,
      sourceUrl: card.sourceUrl,
    }),
});
