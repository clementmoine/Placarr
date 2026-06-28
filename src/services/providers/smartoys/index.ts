import type { ProviderModule } from "@/types/providerModule";
import type { BarcodePriceRefreshContext } from "@/types/providerModule";
import { rawProbe } from "@/lib/dev/mappingProbe";
import { pricedOffers } from "@/lib/provider/priceOffers";

import { fetchPricesFromSmartoys } from "./fetch";

export { fetchPricesFromSmartoys, type SmartoysPrices } from "./fetch";

const PRICE_SOURCE = "Smartoys";

async function refreshSmartoysOffers(ctx: BarcodePriceRefreshContext) {
  if (ctx.shelfType !== "games") return [];
  const expectedNames = Array.from(
    new Set([ctx.primaryName, ...ctx.fallbackNames].filter(Boolean)),
  );
  for (const query of [ctx.cleanedBarcode, ...ctx.fallbackNames]) {
    if (!query.trim()) continue;
    const result = await fetchPricesFromSmartoys(query, expectedNames);
    if (!result) continue;
    return pricedOffers(PRICE_SOURCE, [
      {
        condition: "new",
        priceCents: result.priceNew,
        rawValue: result,
        extra: {
          productName: result.productName ?? null,
          sourceUrl: result.sourceUrl ?? null,
        },
      },
      {
        condition: "used",
        priceCents: result.priceUsed,
        rawValue: result,
        extra: {
          productName: result.productName ?? null,
          sourceUrl: result.sourceUrl ?? null,
        },
      },
    ]);
  }
  return [];
}

export const smartoysModule: ProviderModule = {
  info: {
    id: "smartoys",
    label: "Smartoys",
    types: ["games"],
    capabilities: ["price"],
    auth: { kind: "scrape" },
    canonical: false,
    websiteUrl: "https://www.smartoys.be/",
    notes: "Prix détaillant BE (jeux rétro).",
  },
  mappingProbe: {
    sampleInput: "0045496365226",
    context: { name: "Mario Kart Wii", barcode: "0045496365226" },
  },
  runMappingProbe: async () =>
    rawProbe(await fetchPricesFromSmartoys("0045496365226")),
  refreshBarcodePriceOffers: refreshSmartoysOffers,
};
