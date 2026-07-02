import { normalizeProductBarcode } from "@/lib/barcode/normalize";
import type { BarcodeLookupType, ProviderModule } from "@/types/providerModule";
import type { BarcodePriceRefreshContext } from "@/types/providerModule";
import { marketplaceContributions } from "@/lib/barcode/lookup/sourceContribution";
import { pricedOffer, pricedOffers } from "@/lib/provider/priceOffers";
import {
  makeObservationUsage,
  METADATA_OBSERVATION_SCHEMA_VERSION,
  observationsFromMetadataResult,
} from "@/lib/metadata/observations";
import { listProbe } from "@/lib/dev/mappingProbe";
import type { MetadataResult } from "@/types/metadataProvider";
import type {
  MetadataObservation,
  ObservationEvidenceSignal,
} from "@/types/metadataObservation";
import type { MetadataProviderAdapter } from "@/types/providerModule";

import {
  type AchatMoinsCherProduct,
  fetchFromAchatMoinsCher,
  fetchFromAchatMoinsCherByQuery,
  fetchPricesFromAchatMoinsCher,
} from "./fetch";

export {
  fetchFromAchatMoinsCher,
  fetchFromAchatMoinsCherByQuery,
  fetchPricesFromAchatMoinsCher,
};

const BARCODE_TYPES: BarcodeLookupType[] = [
  "games",
  "books",
  "musics",
  "movies",
  "boardgames",
  "generic",
];
const PRICE_SOURCE = "AchatMoinsCher";

async function refreshAchatMoinsCherOffers(ctx: BarcodePriceRefreshContext) {
  const expectedNames = Array.from(
    new Set([ctx.primaryName, ...ctx.fallbackNames].filter(Boolean)),
  );
  for (const query of [ctx.cleanedBarcode, ...ctx.fallbackNames]) {
    if (!query.trim()) continue;
    const result = await fetchPricesFromAchatMoinsCher(query, expectedNames);
    if (!result) continue;
    return pricedOffers(PRICE_SOURCE, [
      { condition: "used", priceCents: result.priceUsed, rawValue: result },
      { condition: "new", priceCents: result.priceNew, rawValue: result },
    ]);
  }
  return [];
}

const ACHATMOINSCHER_LANGUAGE = "fr";

function buildAchatMoinsCherObservations(
  product: AchatMoinsCherProduct,
  metadata: MetadataResult,
): MetadataObservation[] {
  const evidenceSignals: ObservationEvidenceSignal[] = [
    "barcode_match",
    "structured_data",
  ];
  const observations = observationsFromMetadataResult(
    {
      ...metadata,
      imageUrl: undefined,
    },
    {
      providerId: "achatmoinscher",
      providerLabel: "AchatMoinsCher",
      sourceDocumentRole: "marketplace_listing",
      sourceUrl: product.productUrl ?? undefined,
      sourceId: product.productId ?? undefined,
      evidenceSignals,
      titleRole: "listing_title",
      aliasRole: "listing_alias",
      imageRole: "listing_photo",
      factRole: "listing_fact",
      language: ACHATMOINSCHER_LANGUAGE,
    },
  );

  if (product.priceNew != null && Number.isFinite(product.priceNew)) {
    observations.push({
      kind: "offer",
      role: "marketplace_offer",
      condition: "new",
      priceCents: product.priceNew,
      currency: "EUR",
      provenance: {
        providerId: "achatmoinscher",
        providerLabel: "AchatMoinsCher",
        sourceDocumentRole: "offer",
        sourceUrl: product.productUrl ?? undefined,
        sourceId: product.productId ?? undefined,
        evidenceSignals,
      },
      usage: makeObservationUsage({
        displayCandidate: false,
        searchAlias: "none",
        evidence: "weak",
      }),
    });
  }

  if (product.priceUsed != null && Number.isFinite(product.priceUsed)) {
    observations.push({
      kind: "offer",
      role: "marketplace_offer",
      condition: "used",
      priceCents: product.priceUsed,
      currency: "EUR",
      provenance: {
        providerId: "achatmoinscher",
        providerLabel: "AchatMoinsCher",
        sourceDocumentRole: "offer",
        sourceUrl: product.productUrl ?? undefined,
        sourceId: product.productId ?? undefined,
        evidenceSignals,
      },
      usage: makeObservationUsage({
        displayCandidate: false,
        searchAlias: "none",
        evidence: "weak",
      }),
    });
  }

  if (metadata.barcode) {
    observations.push({
      kind: "external-id",
      role: "barcode",
      idKind: "ean13",
      value: metadata.barcode,
      provenance: {
        providerId: "achatmoinscher",
        providerLabel: "AchatMoinsCher",
        sourceDocumentRole: "marketplace_listing",
        sourceUrl: product.productUrl ?? undefined,
        sourceId: product.productId ?? undefined,
        evidenceSignals,
      },
      usage: makeObservationUsage({ evidence: "strong" }),
    });
  }

  return observations;
}

export const achatmoinscherModule: ProviderModule = {
  info: {
    id: "achatmoinscher",
    label: "AchatMoinsCher",
    types: ["games", "movies", "musics", "books", "boardgames"],
    capabilities: ["identify", "price", "cover"],
    // The metadata adapter only returns title + cover; price is served by the
    // separate barcode/price-task flow. Without this, the metadata price-chase
    // would scrape AchatMoinsCher even when title + cover are already present.
    metadataCapabilities: ["identify", "cover"],
    auth: { kind: "scrape" },
    canonical: false,
    requiresTitleAlignment: true,
    websiteUrl: "https://www.achatmoinscher.com/",
  },
  evidence: {
    label: "AchatMoinsCher",
    sourceWeight: 0.12,
  },
  createMetadataAdapter() {
    const adapter: MetadataProviderAdapter = {
      id: "achatmoinscher",
      async resolve({ barcode, name, lookupQueries, fallbackNames }) {
        const normalizedBarcode = normalizeProductBarcode(barcode);
        const expectedNames = Array.from(
          new Set(
            [
              String(name || "").trim(),
              ...(lookupQueries ?? []),
              ...(fallbackNames ?? []),
            ].filter(Boolean),
          ),
        );

        let products: AchatMoinsCherProduct[] = [];
        if (normalizedBarcode) {
          products = await fetchFromAchatMoinsCher(
            normalizedBarcode,
            expectedNames,
          );
        }
        if (products.length === 0) {
          for (const query of expectedNames) {
            products = await fetchFromAchatMoinsCherByQuery(query, expectedNames);
            if (products.length > 0) break;
          }
        }

        const product = products[0];
        if (!product?.name) return null;
        const metadata: MetadataResult = {
          title: product.name,
          barcode: normalizedBarcode,
          imageUrl: product.coverUrl || undefined,
          regionalTitles: product.name
            ? [{ region: ACHATMOINSCHER_LANGUAGE, text: product.name }]
            : undefined,
          attachments: product.coverUrl
            ? [
                {
                  type: "cover",
                  url: product.coverUrl,
                  role: ACHATMOINSCHER_LANGUAGE,
                  source: "achatmoinscher",
                },
              ]
            : undefined,
        };
        return {
          ...metadata,
          observations: buildAchatMoinsCherObservations(product, metadata),
          observationSchemaVersion: METADATA_OBSERVATION_SCHEMA_VERSION,
        };
      },
    };
    return {
      ...adapter,
    } satisfies MetadataProviderAdapter;
  },
  buildBarcodeTasks(deps, type, { barcode }) {
    if (!BARCODE_TYPES.includes(type)) {
      return {} as Record<string, Promise<unknown>>;
    }
    return { amc: deps.fetchFromAchatMoinsCher(barcode) };
  },
  contributeBarcodeLookupDeps: () => ({
    fetchFromAchatMoinsCher,
  }),
  testHandlers: {
    "achatmoinscher-barcode": {
      label: "AchatMoinsCher - Barcode",
      kind: "scraped-list",
      run: (query) => fetchFromAchatMoinsCher(query),
    },
  },
  mappingProbe: {
    sampleInput: "9782070368228",
    context: { name: "", barcode: "9782070368228" },
  },
  runMappingProbe: async () =>
    listProbe(await fetchFromAchatMoinsCher("9782070368228")),
  buildBarcodeSources(payload, ctx) {
    return marketplaceContributions("AchatMoinsCher", payload.amc, ctx, [
      "games",
      "musics",
      "movies",
      "boardgames",
      "books",
    ]);
  },
  extractScanPriceOffers(payload) {
    const priced = payload.amc.find(
      (entry) => entry.priceNew != null || entry.priceUsed != null,
    );
    if (!priced) return [];
    return pricedOffers(PRICE_SOURCE, [
      { condition: "new", priceCents: priced.priceNew, rawValue: priced },
      { condition: "used", priceCents: priced.priceUsed, rawValue: priced },
    ]);
  },
  refreshBarcodePriceOffers: refreshAchatMoinsCherOffers,
};
