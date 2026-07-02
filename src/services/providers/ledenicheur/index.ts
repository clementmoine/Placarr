import type { BarcodeLookupType, ProviderModule } from "@/types/providerModule";
import type { BarcodePriceRefreshContext } from "@/types/providerModule";
import { rawProbe } from "@/lib/dev/mappingProbe";
import { pricedOffers } from "@/lib/provider/priceOffers";
import {
  createTeardownBarcodeTask,
  dedupeTeardownQueries,
} from "@/lib/dev/teardownUtils";

import { createMetadataHealthCheck } from "@/lib/provider/healthUtils";
import { gatedContributions } from "@/lib/barcode/lookup/sourceContribution";
import type { SourceProduct } from "@/lib/barcode/evidence/types";
import {
  fetchPricesFromLeDenicheur,
  pingLeDenicheur,
  type LeDenicheurPrices,
} from "./fetch";

export { fetchPricesFromLeDenicheur, pingLeDenicheur };

// LeDenicheur resolves a barcode to a single product (name + cover).
function leDenicheurProducts(
  result: LeDenicheurPrices | null,
): SourceProduct[] {
  const name = result?.productName?.trim();
  return name ? [{ name, coverUrl: result?.coverUrl || null }] : [];
}

const BARCODE_TYPES: BarcodeLookupType[] = [
  "games",
  "books",
  "musics",
  "movies",
  "boardgames",
  "generic",
];
const PRICE_SOURCE = "LeDenicheur";

function leDenicheurPriceOfferRows(result: LeDenicheurPrices) {
  const extra = {
    productName: result.productName ?? null,
    merchantName: result.merchantName ?? null,
    sourceUrl: result.sourceUrl ?? null,
    offerCount: result.offerCount ?? null,
  };
  const rows: Array<{
    condition: string;
    priceCents: number;
    rawValue: LeDenicheurPrices;
    extra: typeof extra;
  }> = [];

  if (result.priceNew) {
    rows.push({
      condition: "new",
      priceCents: result.priceNew,
      rawValue: result,
      extra,
    });
  }
  if (result.priceUsed) {
    rows.push({
      condition: "used",
      priceCents: result.priceUsed,
      rawValue: result,
      extra,
    });
  }
  return rows;
}

async function refreshLeDenicheurOffers(ctx: BarcodePriceRefreshContext) {
  const result = await fetchPricesFromLeDenicheur(ctx.leDenicheurQueries);
  if (!result?.priceNew && !result?.priceUsed) return [];
  return pricedOffers(PRICE_SOURCE, leDenicheurPriceOfferRows(result));
}

export const ledenicheurModule: ProviderModule = {
  info: {
    id: "ledenicheur",
    label: "LeDénicheur",
    types: ["games", "movies", "musics", "books", "boardgames"],
    capabilities: ["price", "identify", "cover"],
    auth: { kind: "scrape" },
    canonical: false,
    slowBarcodeLookup: true,
    websiteUrl: "https://ledenicheur.fr/",
    apiKeyDashboardUrl: "https://ledenicheur.fr/",
  },
  evidence: {
    label: "LeDenicheur",
    sourceWeight: 0.14,
  },
  buildBarcodeTasks(deps, type, { barcode }) {
    if (!BARCODE_TYPES.includes(type)) {
      return {} as Record<string, Promise<unknown>>;
    }
    return { leDenicheur: deps.fetchPricesFromLeDenicheur(barcode) };
  },
  buildTeardownBarcodeTasks(ctx, deps) {
    const queries = dedupeTeardownQueries([
      ctx.barcode || "",
      ...(ctx.nameCandidates || []),
    ]);
    if (queries.length === 0) return [];

    return [
      createTeardownBarcodeTask("LeDenicheur", () =>
        deps.fetchPricesFromLeDenicheur(queries),
      ),
    ];
  },
  contributeBarcodeLookupDeps: () => ({
    fetchPricesFromLeDenicheur,
  }),
  healthCheck: createMetadataHealthCheck(
    "ledenicheur",
    "LeDenicheur",
    async () => {
      const result = await pingLeDenicheur();
      return {
        ok: result.ok,
        latency: result.latency,
        error: result.error ?? null,
      };
    },
  ),
  testHandlers: {
    "ledenicheur-prices": {
      label: "LeDenicheur - Prices",
      kind: "prices",
      run: (query) => fetchPricesFromLeDenicheur(query),
    },
  },
  mappingProbe: {
    sampleInput: "hades switch",
    context: { name: "hades switch" },
  },
  runMappingProbe: async () =>
    rawProbe(await fetchPricesFromLeDenicheur("hades switch")),
  buildBarcodeSources(payload, ctx) {
    return gatedContributions(
      "LeDenicheur",
      leDenicheurProducts(payload.leDenicheur),
      ctx,
      ["games", "musics", "movies", "boardgames", "books"],
    );
  },
  extractScanPriceOffers(payload) {
    if (!payload.leDenicheur) return [];
    return pricedOffers(
      PRICE_SOURCE,
      leDenicheurPriceOfferRows(payload.leDenicheur),
    );
  },
  refreshBarcodePriceOffers: refreshLeDenicheurOffers,
};
