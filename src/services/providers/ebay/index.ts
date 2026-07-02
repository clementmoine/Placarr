import type {
  BarcodePriceRefreshContext,
  BarcodeLookupType,
  ProviderModule,
} from "@/types/providerModule";
import { normalizeProductBarcode } from "@/lib/barcode/normalize";
import { listProbe, probeErrorResult, retry } from "@/lib/dev/mappingProbe";
import { marketplaceContributions } from "@/lib/barcode/lookup/sourceContribution";
import {
  createMetadataHealthCheck,
  createUnconfiguredHealthCheck,
} from "@/lib/provider/healthUtils";
import { pricedOffers } from "@/lib/provider/priceOffers";

import { EBAY_ENV_NAMES, getEbayEnv } from "./env";
import {
  fetchEbayProductsByQuery,
  fetchFromEbay,
  fetchPricesFromEbay,
  pingEbay,
  type EbayProduct,
} from "./fetch";
import { fetchFromEbayCatalog } from "./catalog";

export {
  fetchEbayProductsByQuery,
  fetchFromEbay,
  fetchFromEbayCatalog,
  fetchPricesFromEbay,
  pingEbay,
};

const BARCODE_TYPES: BarcodeLookupType[] = [
  "games",
  "musics",
  "movies",
  "books",
  "boardgames",
  "generic",
];
const PRICE_SOURCE = "eBay";
const PROBE_BARCODE = "9782070368228";

function mapEbayMetadata(
  products: EbayProduct[],
  normalizedBarcode: string | null,
) {
  const catalogProduct = products.find((product) => product.catalog && product.name);
  const titledProduct = catalogProduct ?? products.find((product) => product.name);
  const imageProducts = products.filter((product) => product.coverUrl);
  const coverProduct =
    imageProducts.find((product) => product.catalog) ?? imageProducts[0];
  const imageUrl = coverProduct?.coverUrl || undefined;
  if (!imageUrl && !titledProduct?.name) return null;

  const epid = catalogProduct?.epid ?? products.find((product) => product.epid)?.epid;
  const brand = catalogProduct?.brand?.trim();

  return {
    title: catalogProduct?.name ?? titledProduct?.name,
    barcode: normalizedBarcode,
    imageUrl,
    externalIds: epid ? { ebay: epid } : undefined,
    attachments: imageProducts.slice(0, 6).map((product) => ({
      type: "cover" as const,
      url: product.coverUrl!,
      source: "ebay",
      title: product.name,
      role: product.catalog ? "catalog" : "marketplace",
    })),
    facts: brand
      ? [
          {
            kind: "brand",
            label: "Brand",
            value: brand,
            source: "ebay",
            confidence: 0.75,
            priority: 50,
          },
        ]
      : undefined,
  };
}

async function refreshEbayOffers(ctx: BarcodePriceRefreshContext) {
  const expectedNames = Array.from(
    new Set([ctx.primaryName, ...ctx.fallbackNames].filter(Boolean)),
  );
  for (const query of [ctx.cleanedBarcode, ...ctx.fallbackNames]) {
    const result = await fetchPricesFromEbay(query, expectedNames);
    if (!result) continue;
    const extra = {
      productName: result.productName ?? null,
      sourceUrl: result.sourceUrl ?? null,
      offerCount: result.offerCount ?? null,
    };
    const offers = pricedOffers(PRICE_SOURCE, [
      { condition: "new", priceCents: result.priceNew, rawValue: result, extra },
      { condition: "used", priceCents: result.priceUsed, rawValue: result, extra },
    ]);
    if (offers.length) return offers;
  }
  return [];
}

export const ebayModule: ProviderModule = {
  info: {
    id: "ebay",
    label: "eBay",
    types: ["games", "movies", "musics", "books", "boardgames"],
    capabilities: ["identify", "price", "cover"],
    metadataCapabilities: ["cover", "title"],
    auth: {
      kind: "key",
      env: [...EBAY_ENV_NAMES],
      free: true,
    },
    canonical: false,
    coverUrlHost: "i.ebayimg.com",
    remoteImageFallback: true,
    imageScoreAdjustment: -280,
    isSecondary: true,
    websiteUrl: "https://www.ebay.fr/",
    apiKeyDashboardUrl: "https://developer.ebay.com/my/keys",
    mappingProbeRetry: true,
    mappingProbeConfigHint:
      "eBay credentials missing — create an app at developer.ebay.com, set EBAY_CLIENT_ID / EBAY_CLIENT_SECRET, and enable Browse + Catalog (commerce.catalog.readonly) scopes",
    notes:
      "eBay Browse API (listings/prix) + Catalog API (produit canonique GTIN/ePID). OAuth client-credentials.",
  },
  evidence: {
    label: "eBay",
    sourceWeight: 0.1,
  },
  buildBarcodeTasks(deps, type, { barcode }) {
    if (!BARCODE_TYPES.includes(type)) {
      return {} as Record<string, Promise<unknown>>;
    }
    return { ebay: deps.fetchFromEbay(barcode) };
  },
  contributeBarcodeLookupDeps: () => ({
    fetchFromEbay,
  }),
  testHandlers: {
    "ebay-barcode": {
      label: "eBay - Barcode",
      kind: "scraped-list",
      run: (query) => fetchFromEbay(query),
    },
  },
  createMetadataAdapter() {
    return {
      id: "ebay",
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

        let products: EbayProduct[] = [];
        if (normalizedBarcode) {
          products = await fetchFromEbay(normalizedBarcode, expectedNames);
        }
        for (const query of queries) {
          if (products.length > 0) break;
          products = await fetchEbayProductsByQuery(query, expectedNames);
        }

        return mapEbayMetadata(products, normalizedBarcode);
      },
    };
  },
  mappingProbe: {
    sampleInput: PROBE_BARCODE,
    context: { name: "", barcode: PROBE_BARCODE },
  },
  runMappingProbe: async () => {
    if (!getEbayEnv()) {
      return probeErrorResult(
        `eBay credentials missing — set ${EBAY_ENV_NAMES.join(" / ")}`,
        "blocked",
      );
    }
    try {
      const products = await retry(() => fetchFromEbay(PROBE_BARCODE), 2);
      const probe = listProbe(products);
      if (probe) return probe;
      return probeErrorResult(
        "No eBay catalog or listing hits for sample barcode",
        "empty",
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/timeout|timed out|ETIMEDOUT|ECONNABORTED|AbortError/i.test(message)) {
        return probeErrorResult("eBay Browse API timed out", "blocked");
      }
      return probeErrorResult(message);
    }
  },
  healthCheck: getEbayEnv()
    ? createMetadataHealthCheck("ebay", "eBay", async () => {
        const result = await pingEbay();
        return {
          configured: true,
          ok: result.ok,
          latency: result.latency,
          error: result.error ?? null,
        };
      })
    : createUnconfiguredHealthCheck(
        "ebay",
        "eBay",
        `eBay credentials missing — set ${EBAY_ENV_NAMES.join(" / ")}`,
      ),
  buildBarcodeSources(payload, ctx) {
    return marketplaceContributions("eBay", payload.ebay, ctx, [
      "games",
      "musics",
      "movies",
      "books",
      "boardgames",
    ]);
  },
  refreshBarcodePriceOffers: refreshEbayOffers,
};
