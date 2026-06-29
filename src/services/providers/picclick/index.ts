import type { BarcodeLookupType, ProviderModule } from "@/types/providerModule";
import type { BarcodePriceRefreshContext } from "@/types/providerModule";
import { normalizeProductBarcode } from "@/lib/barcode/normalize";
import { listProbe, probeErrorResult, retry } from "@/lib/dev/mappingProbe";
import { marketplaceContributions } from "@/lib/barcode/lookup/sourceContribution";
import { pricedOffer } from "@/lib/provider/priceOffers";

import {
  fetchFromPicClick,
  fetchPicClickProductsByQuery,
  fetchPricesFromPicClick,
} from "./fetch";

export {
  fetchFromPicClick,
  fetchPicClickProductsByQuery,
  fetchPricesFromPicClick,
};

const BARCODE_TYPES: BarcodeLookupType[] = [
  "games",
  "musics",
  "movies",
  "boardgames",
  "generic",
];
const PRICE_SOURCE = "PicClick";

async function refreshPicClickOffers(ctx: BarcodePriceRefreshContext) {
  const expectedNames = Array.from(
    new Set([ctx.primaryName, ...ctx.fallbackNames].filter(Boolean)),
  );
  for (const query of [ctx.cleanedBarcode, ...ctx.fallbackNames]) {
    const result = await fetchPricesFromPicClick(query, expectedNames);
    if (result?.priceUsed) {
      const offer = pricedOffer(PRICE_SOURCE, "used", result.priceUsed, result, {
        productName: result.productName ?? null,
        sourceUrl: result.sourceUrl ?? null,
        offerCount: result.offerCount ?? null,
      });
      return offer ? [offer] : [];
    }
  }
  return [];
}

export const picclickModule: ProviderModule = {
  info: {
    id: "picclick",
    label: "PicClick (eBay)",
    types: ["games", "movies", "musics", "books", "boardgames"],
    capabilities: ["identify", "price", "cover"],
    metadataCapabilities: ["cover"],
    auth: { kind: "scrape" },
    canonical: false,
    coverUrlHost: "www.picclickimg.com",
    remoteImageFallback: true,
    imageScoreAdjustment: -280,
    isSecondary: true,
    websiteUrl: "https://picclick.fr/",
    mappingProbeRetry: true,
    slowScanScrape: true,
  },
  evidence: {
    label: "PicClick",
    sourceWeight: 0.08,
  },
  buildBarcodeTasks(deps, type, { barcode }) {
    if (!BARCODE_TYPES.includes(type)) {
      return {} as Record<string, Promise<unknown>>;
    }
    return { picclick: deps.fetchFromPicClick(barcode) };
  },
  contributeBarcodeLookupDeps: () => ({
    fetchFromPicClick,
  }),
  testHandlers: {
    "picclick-barcode": {
      label: "PicClick - Barcode",
      kind: "scraped-list",
      run: (query) => fetchFromPicClick(query),
    },
  },
  createMetadataAdapter() {
    return {
      id: "picclick",
      async resolve({
        barcode,
        name,
        lookupQueries,
      }: {
        barcode?: string | null;
        name?: string | null;
        lookupQueries?: string[];
      }) {
        const normalizedBarcode = normalizeProductBarcode(barcode);
        const queries =
          lookupQueries && lookupQueries.length > 0
            ? lookupQueries
            : [String(name || "").trim()].filter(Boolean);
        const expectedNames = Array.from(
          new Set([String(name || "").trim(), ...queries].filter(Boolean)),
        );

        const searchQueries = [
          ...(normalizedBarcode ? [normalizedBarcode] : []),
          ...queries,
        ];

        let products: PicClickProduct[] = [];
        for (const query of searchQueries) {
          products = await fetchPicClickProductsByQuery(query, expectedNames);
          if (products.length > 0) break;
        }

        const imageProducts = products.filter((product) => product.coverUrl);
        const firstCover = imageProducts[0]?.coverUrl || undefined;
        if (!firstCover) return null;
        return {
          imageUrl: firstCover,
          attachments: imageProducts.slice(0, 6).map((product, index) => ({
            type: "cover" as const,
            url: product.coverUrl!,
            source: "picclick",
            title: product.name,
            role: "marketplace",
          })),
        };
      },
    };
  },
  mappingProbe: {
    sampleInput: "4988601467124",
    context: { name: "", barcode: "4988601467124" },
  },
  runMappingProbe: async () => {
    try {
      const products = await retry(
        () => fetchFromPicClick("4988601467124"),
        2,
      );
      const probe = listProbe(products);
      if (probe) return probe;
      return probeErrorResult(
        "No PicClick listings for sample barcode",
        "empty",
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/timeout|timed out|ETIMEDOUT|ECONNABORTED|AbortError/i.test(message)) {
        return probeErrorResult(
          "PicClick search timed out — marketplace scrape is slow from this network",
          "blocked",
        );
      }
      return probeErrorResult(message);
    }
  },
  buildBarcodeSources(payload, ctx) {
    return marketplaceContributions("PicClick", payload.picclick, ctx, [
      "games",
      "musics",
      "movies",
      "boardgames",
    ]);
  },
  refreshBarcodePriceOffers: refreshPicClickOffers,
};
