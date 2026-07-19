import { createMetadataHealthCheck, pingUrl } from "@/core/catalog/healthUtils";
import { bookIdentifierLabel } from "@/core/identify/shelfLabels";
import { normalizeProductBarcode } from "@/core/identify/normalize";
import {
  retailerProductBarcodeConfirmed,
  retailerProductUrlBarcodeConflicts,
} from "@/core/commerce/retailer/productUrl";
import { providerProductUrlsForKey } from "@/core/commerce/pricing/providerProductUrls";
import { pricedOffers } from "@/core/catalog/priceOffers";
import { metadataProbe } from "@/lib/dev/mappingProbe";
import {
  mappingRawKeysFromFetch,
  probeContextOrDefault,
} from "@/lib/dev/mappingRawKeys";
import {
  METADATA_OBSERVATION_SCHEMA_VERSION,
  observationsFromMetadataResult,
} from "@/core/enrich/observations";

import type {
  MetadataAttachment,
  MetadataFact,
  MetadataResult,
} from "@/types/metadataProvider";
import type {
  ObservationEvidenceSignal,
} from "@/types/metadataObservation";
import type {
  BarcodePriceRefreshContext,
  MetadataProviderAdapter,
  ProviderModule,
} from "@/types/providerModule";

import {
  fetchDecitreByBarcode,
  fetchDecitreProduct,
  resolveDecitreMetadata,
  type DecitreProduct,
} from "./fetch";

export {
  decitreAttributeValue,
  decitreSearchUrl,
  fetchDecitreByBarcode,
  fetchDecitreProduct,
  parseDecitreProductPage,
  parseDecitreSearchHits,
  resolveDecitreMetadata,
  searchDecitreHits,
} from "./fetch";

const PRICE_SOURCE = "Decitre";
const PROVIDER_KEY = "decitre";
const SAMPLE_BARCODE = "9782017321675";

function formatEuroPrice(cents: number): string {
  return `${(cents / 100).toFixed(2).replace(".", ",")} €`;
}

function buildDecitreAttachments(
  product: DecitreProduct,
): MetadataAttachment[] | undefined {
  if (!product.coverUrl) return undefined;
  return [
    {
      type: "cover",
      url: product.coverUrl,
      title: product.title,
      role: "fr",
      source: PROVIDER_KEY,
    },
  ];
}

function mapDecitreMetadata(product: DecitreProduct | null): MetadataResult | null {
  if (!product?.title) return null;

  const facts: MetadataFact[] = [
    {
      kind: "external-link",
      label: "Decitre",
      value: "Voir la fiche",
      url: product.productUrl,
      source: PROVIDER_KEY,
      confidence: 0.7,
      priority: 34,
    },
  ];

  if (product.publisher) {
    facts.push({
      kind: "publisher",
      label: "Éditeur",
      value: product.publisher,
      source: PROVIDER_KEY,
      confidence: 0.66,
      priority: 24,
    });
  }

  if (product.barcode) {
    facts.push({
      kind: "identifier",
      label: bookIdentifierLabel(product.barcode),
      value: product.barcode,
      source: PROVIDER_KEY,
      confidence: 0.7,
      priority: 40,
    });
  }

  if (product.releaseDate) {
    facts.push({
      kind: "release-date",
      label: "Parution",
      value: product.releaseDate,
      source: PROVIDER_KEY,
      confidence: 0.64,
      priority: 23,
    });
  }

  if (product.bookFormat) {
    facts.push({
      kind: "tag",
      label: "Format",
      value: product.bookFormat,
      source: PROVIDER_KEY,
      confidence: 0.55,
      priority: 18,
    });
  }

  for (const translator of product.translators) {
    facts.push({
      kind: "artist",
      label: "Traducteur",
      value: translator,
      source: PROVIDER_KEY,
      confidence: 0.58,
      priority: 26,
    });
  }

  if (product.priceCents) {
    facts.push({
      kind: "price",
      label: "Neuf",
      value: formatEuroPrice(product.priceCents),
      source: PROVIDER_KEY,
      confidence: 0.68,
      priority: 52,
    });
  }

  const authors = product.authors.map((name) => ({ name }));

  const metadata: MetadataResult = {
    title: product.title,
    authors: authors.length > 0 ? authors : undefined,
    publishers: product.publisher ? [{ name: product.publisher }] : undefined,
    pageCount: product.pageCount,
    description: product.description,
    releaseDate: product.releaseDate,
    imageUrl: product.coverUrl,
    barcode: product.barcode,
    regionalTitles: [{ region: "fr", text: product.title }],
    attachments: buildDecitreAttachments(product),
    facts,
    externalIds: product.barcode
      ? { decitre: product.barcode }
      : undefined,
  };

  const evidenceSignals: ObservationEvidenceSignal[] = ["structured_data"];
  if (product.barcode) evidenceSignals.push("barcode_match");

  return {
    ...metadata,
    observations: observationsFromMetadataResult(metadata, {
      providerId: PROVIDER_KEY,
      providerLabel: "Decitre",
      sourceDocumentRole: "catalog_product",
      sourceUrl: product.productUrl,
      evidenceSignals,
      titleRole: "catalog_title",
      aliasRole: "provider_grouped_alias",
      imageRole: "cover_front",
      factRole: "structured_fact",
      language: "fr",
    }),
    observationSchemaVersion: METADATA_OBSERVATION_SCHEMA_VERSION,
  };
}

async function refreshDecitreOffers(ctx: BarcodePriceRefreshContext) {
  if (ctx.shelfType !== "books") return [];
  const barcode = normalizeProductBarcode(ctx.cleanedBarcode);
  if (!barcode) return [];

  const storedUrls = providerProductUrlsForKey(
    PROVIDER_KEY,
    ctx.providerProductUrls,
  ).filter((url) => {
    if (retailerProductUrlBarcodeConflicts(url, barcode)) return false;
    return retailerProductBarcodeConfirmed(url, null, barcode);
  });

  for (const url of storedUrls) {
    const product = await fetchDecitreProduct(url);
    if (product?.priceCents) {
      return pricedOffers(PRICE_SOURCE, [
        {
          condition: "new",
          priceCents: product.priceCents,
          rawValue: product,
          extra: {
            productName: product.title,
            merchantName: "Decitre",
            sourceUrl: product.productUrl,
          },
        },
      ]);
    }
  }

  const product = await fetchDecitreByBarcode(barcode);
  if (!product?.priceCents) return [];

  return pricedOffers(PRICE_SOURCE, [
    {
      condition: "new",
      priceCents: product.priceCents,
      rawValue: product,
      extra: {
        productName: product.title,
        merchantName: "Decitre",
        sourceUrl: product.productUrl,
      },
    },
  ]);
}

export const decitreModule: ProviderModule = {
  info: {
    id: "decitre",
    label: "Decitre",
    types: ["books"],
    capabilities: [
      "identify",
      "cover",
      "description",
      "people",
      "pageCount",
      "price",
      "releaseDate",
    ],
    auth: { kind: "scrape" },
    canonical: false,
    isSecondary: true,
    defaultLanguage: "fr",
    isRealBoxCover: true,
    bookCoverPriority: "primary",
    remoteImageFallback: true,
    remoteImageReferer: "https://www.decitre.fr/",
    requiresTitleAlignment: true,
    bookIsbnBootstrapSource: true,
    barcodeScopedPriceSource: true,
    coverUrlHost: "products-images.di-static.com",
    websiteUrl: "https://www.decitre.fr/",
    mappingProbeConfigHint:
      "Cloudflare challenge — FLARESOLVERR_URL requis pour probe / fetch live.",
    notes:
      "Retailer national FR (Front-Commerce). Fiche produit via JSON-LD Book + attributs HTML (EAN, pages). Recherche /search?search= ; Cloudflare → FlareSolverr. Secondary: Flare trop lent pour le stage-1 preview.",
  },
  evidence: {
    label: "Decitre",
    sourceWeight: 0.28,
    trustedRetailer: true,
  },
  createMetadataAdapter() {
    return {
      id: PROVIDER_KEY,
      async resolve(ctx) {
        return mapDecitreMetadata(await resolveDecitreMetadata(ctx));
      },
    } satisfies MetadataProviderAdapter;
  },
  healthCheck: createMetadataHealthCheck("decitre", "Decitre", async () => {
    const start = Date.now();
    const isUp = await pingUrl("https://www.decitre.fr/");
    return {
      ok: isUp,
      latency: Date.now() - start,
      error: isUp ? null : "Host unreachable",
    };
  }),
  testHandlers: {
    "decitre-metadata": {
      label: "Decitre - Metadata",
      kind: "metadata",
      run: async (query) =>
        mapDecitreMetadata(await resolveDecitreMetadata({ name: query })),
    },
    "decitre-barcode": {
      label: "Decitre - Barcode",
      kind: "metadata-barcode",
      run: async (query) =>
        mapDecitreMetadata(
          await resolveDecitreMetadata({ name: "", barcode: query }),
        ),
    },
  },
  mappingProbe: {
    sampleInput: SAMPLE_BARCODE,
    context: { name: "Ecris notre histoire", barcode: SAMPLE_BARCODE },
  },
  runMappingProbe: async () =>
    metadataProbe(
      mapDecitreMetadata(await fetchDecitreByBarcode(SAMPLE_BARCODE)),
    ),
  collectMappingRawKeys: async (context) => {
    const ctx = probeContextOrDefault(context, {
      name: "Ecris notre histoire",
      barcode: SAMPLE_BARCODE,
    });
    return mappingRawKeysFromFetch(() =>
      fetchDecitreByBarcode(ctx.barcode || SAMPLE_BARCODE),
    );
  },
  refreshBarcodePriceOffers: refreshDecitreOffers,
};

export { mapDecitreMetadata };
