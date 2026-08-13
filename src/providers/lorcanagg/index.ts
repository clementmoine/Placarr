import type { ProviderModule } from "@/types/providerModule";
import type { BarcodePriceRefreshContext } from "@/types/providerModule";
import { pricedOffers } from "@/core/catalog/priceOffers";
import { rawProbe } from "@/lib/dev/mappingProbe";
import {
  mappingRawKeysFromFetch,
  probeContextOrDefault,
} from "@/lib/dev/mappingRawKeys";

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

const PROVIDER_ID = "lorcanagg";
const PRICE_SOURCE = "Lorcana.gg";

function printKeyFromContext(ctx: BarcodePriceRefreshContext): string | null {
  const direct = ctx.printKey?.trim();
  if (direct) return direct;
  return ctx.externalIds?.printKey?.trim() || null;
}

function offersFromCard(card: DotggCardPrices) {
  const label = dotggCardLabel(card);
  const rows: Array<{
    condition: string;
    priceCents: number | null;
    productName: string;
  }> = [];

  if (card.cmPriceCents != null) {
    rows.push({
      condition: "new",
      priceCents: card.cmPriceCents,
      productName: label,
    });
  }
  if (card.cmFoilPriceCents != null) {
    rows.push({
      condition: "foil",
      priceCents: card.cmFoilPriceCents,
      productName: `${label} (foil)`,
    });
  }

  return pricedOffers(
    PRICE_SOURCE,
    rows.map((row) => ({
      condition: row.condition,
      priceCents: row.priceCents,
      rawValue: card,
      extra: {
        currency: "EUR",
        productName: row.productName,
        sourceUrl: card.sourceUrl,
        metadataScoped: true,
      },
    })),
  );
}

async function refreshDotggOffers(ctx: BarcodePriceRefreshContext) {
  if (ctx.shelfType !== "tcg") return [];
  const printKey = printKeyFromContext(ctx);
  if (!printKey) return [];

  const card = await fetchDotggCardForPrintKey(printKey, {
    signal: ctx.signal,
  });
  if (!card) return [];
  return offersFromCard(card);
}

export const lorcanaggModule: ProviderModule = {
  info: {
    id: PROVIDER_ID,
    label: "Lorcana.gg",
    types: ["tcg"],
    capabilities: ["price"],
    auth: { kind: "none" },
    supplyMode: "api_live",
    canonical: false,
    websiteUrl: "https://lorcana.gg/",
    notes:
      "Cotes Cardmarket EUR (DotGG dump) pour Disney Lorcana. Match par printKey (set paddé / promo Pn). Complète Lorcast sur les promos sans TCGPlayer.",
    referencePriceSource: true,
  },
  mappingProbe: {
    sampleInput: "lorcana:1-1",
    context: { name: "Ariel - On Human Legs", printKey: "lorcana:1-1" },
  },
  runMappingProbe: async () =>
    rawProbe(await fetchDotggCardForPrintKey("lorcana:1-1")),
  collectMappingRawKeys: async (context) => {
    const ctx = probeContextOrDefault(context, {
      name: "Ariel",
      printKey: "lorcana:1-1",
    });
    return mappingRawKeysFromFetch(() =>
      fetchDotggCardForPrintKey(ctx.printKey?.trim() || "lorcana:1-1"),
    );
  },
  refreshBarcodePriceOffers: refreshDotggOffers,
};
