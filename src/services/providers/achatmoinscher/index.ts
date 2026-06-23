import { normalizeProductBarcode } from "@/lib/barcode/normalize";
import type { BarcodeLookupType, ProviderModule } from "@/types/providerModule";
import {
  makeObservationUsage,
  METADATA_OBSERVATION_SCHEMA_VERSION,
  observationsFromMetadataResult,
} from "@/lib/metadataObservations";
import { listProbe } from "@/lib/mappingProbeUtils";
import type { MetadataResult } from "@/types/metadataProvider";
import type {
  MetadataObservation,
  ObservationEvidenceSignal,
} from "@/types/metadataObservation";
import type { MetadataProviderAdapter } from "@/types/providerModule";

import {
  type AchatMoinsCherProduct,
  fetchFromAchatMoinsCher,
  fetchPricesFromAchatMoinsCher,
} from "./fetch";

export { fetchFromAchatMoinsCher, fetchPricesFromAchatMoinsCher };

const BARCODE_TYPES: BarcodeLookupType[] = [
  "games",
  "books",
  "musics",
  "movies",
  "boardgames",
  "generic",
];

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
  },
  evidence: {
    label: "AchatMoinsCher",
    sourceWeight: 0.12,
  },
  createMetadataAdapter() {
    const adapter: MetadataProviderAdapter = {
      id: "achatmoinscher",
      async resolve({ barcode }) {
        const normalizedBarcode = normalizeProductBarcode(barcode);
        if (!normalizedBarcode) return null;
        const products = await fetchFromAchatMoinsCher(normalizedBarcode);
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
};
