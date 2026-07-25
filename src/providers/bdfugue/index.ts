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
import type { ObservationEvidenceSignal } from "@/types/metadataObservation";
import type {
  BarcodePriceRefreshContext,
  MetadataProviderAdapter,
  ProviderModule,
} from "@/types/providerModule";

import {
  fetchBdFugueByBarcode,
  fetchBdFugueProduct,
  resolveBdFugueMetadata,
  type BdFugueProduct,
} from "./fetch";

export {
  bdfugueAttributeValue,
  bdfugueSearchUrl,
  fetchBdFugueByBarcode,
  fetchBdFugueProduct,
  parseBdFugueCredits,
  parseBdFugueFrenchDate,
  parseBdFugueProductPage,
  parseBdFugueSearchHits,
  resolveBdFugueMetadata,
  searchBdFugueHits,
} from "./fetch";

const PRICE_SOURCE = "BD Fugue";
const PROVIDER_KEY = "bdfugue";
const SAMPLE_BARCODE = "9782377170319";

function formatEuroPrice(cents: number): string {
  return `${(cents / 100).toFixed(2).replace(".", ",")} €`;
}

function buildBdFugueAttachments(
  product: BdFugueProduct,
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

function mapBdFugueMetadata(
  product: BdFugueProduct | null,
): MetadataResult | null {
  if (!product?.title) return null;

  const facts: MetadataFact[] = [
    {
      kind: "external-link",
      label: "BD Fugue",
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

  if (product.seriesName) {
    facts.push({
      kind: "series",
      label: "Série",
      value: product.seriesName,
      source: PROVIDER_KEY,
      confidence: 0.66,
      priority: 30,
    });
  }

  if (product.issueNumber) {
    facts.push({
      kind: "tag",
      label: "Tome",
      value: product.issueNumber,
      source: PROVIDER_KEY,
      confidence: 0.64,
      priority: 28,
    });
  }

  if (product.genre) {
    facts.push({
      kind: "tag",
      label: "Genre",
      value: product.genre,
      source: PROVIDER_KEY,
      confidence: 0.55,
      priority: 20,
    });
  }

  if (product.binding) {
    facts.push({
      kind: "tag",
      label: "Reliure",
      value: product.binding,
      source: PROVIDER_KEY,
      confidence: 0.5,
      priority: 16,
    });
  }

  for (const credit of product.authors) {
    if (credit.role) {
      facts.push({
        kind: "artist",
        label: credit.role,
        value: credit.name,
        source: PROVIDER_KEY,
        confidence: 0.62,
        priority: 27,
      });
    }
  }

  if (product.ratingValue) {
    facts.push({
      kind: "rating",
      label: "BD Fugue",
      value:
        product.ratingCount && product.ratingCount > 0
          ? `${product.ratingValue}/5 (${product.ratingCount} avis)`
          : `${product.ratingValue}/5`,
      source: PROVIDER_KEY,
      confidence: 0.55,
      priority: 20,
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

  const authorNames = Array.from(
    new Set(product.authors.map((credit) => credit.name)),
  );

  const metadata: MetadataResult = {
    title: product.title,
    authors:
      authorNames.length > 0
        ? authorNames.map((name) => ({ name }))
        : undefined,
    publishers: product.publisher ? [{ name: product.publisher }] : undefined,
    pageCount: product.pageCount,
    description: product.description,
    releaseDate: product.releaseDate,
    imageUrl: product.coverUrl,
    barcode: product.barcode,
    regionalTitles: [{ region: "fr", text: product.title }],
    attachments: buildBdFugueAttachments(product),
    facts,
    externalIds: product.barcode ? { bdfugue: product.barcode } : undefined,
  };

  const evidenceSignals: ObservationEvidenceSignal[] = ["structured_data"];
  if (product.barcode) evidenceSignals.push("barcode_match");

  return {
    ...metadata,
    observations: observationsFromMetadataResult(metadata, {
      providerId: PROVIDER_KEY,
      providerLabel: "BD Fugue",
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

async function refreshBdFugueOffers(ctx: BarcodePriceRefreshContext) {
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
    const product = await fetchBdFugueProduct(url);
    if (product?.priceCents) {
      return pricedOffers(PRICE_SOURCE, [
        {
          condition: "new",
          priceCents: product.priceCents,
          rawValue: product,
          extra: {
            productName: product.title,
            merchantName: "BD Fugue",
            sourceUrl: product.productUrl,
          },
        },
      ]);
    }
  }

  const product = await fetchBdFugueByBarcode(barcode);
  if (!product?.priceCents) return [];

  return pricedOffers(PRICE_SOURCE, [
    {
      condition: "new",
      priceCents: product.priceCents,
      rawValue: product,
      extra: {
        productName: product.title,
        merchantName: "BD Fugue",
        sourceUrl: product.productUrl,
      },
    },
  ]);
}

export const bdfugueModule: ProviderModule = {
  info: {
    id: "bdfugue",
    label: "BD Fugue",
    types: ["books"],
    capabilities: [
      "identify",
      "cover",
      "description",
      "people",
      "pageCount",
      "price",
      "releaseDate",
      "rating",
    ],
    auth: { kind: "scrape" },
    canonical: false,
    isSecondary: true,
    defaultLanguage: "fr",
    isRealBoxCover: true,
    bookCoverPriority: "primary",
    remoteImageFallback: true,
    remoteImageReferer: "https://www.bdfugue.com/",
    requiresTitleAlignment: true,
    bookIsbnBootstrapSource: true,
    barcodeScopedPriceSource: true,
    coverUrlHost: "www.bdfugue.com",
    websiteUrl: "https://www.bdfugue.com/",
    mappingProbeConfigHint:
      "Cloudflare challenge — FLARESOLVERR_URL requis pour probe / fetch live.",
    notes:
      "Spécialiste BD/manga FR (Magento). Recherche ISBN → redirect fiche ; JSON-LD Product (gtin/prix/cover) + attributs (série, tome, auteurs/rôles, éditeur). Cloudflare → FlareSolverr. Secondary: Flare trop lent pour le stage-1 preview.",
  },
  evidence: {
    label: "BD Fugue",
    sourceWeight: 0.3,
    trustedRetailer: true,
  },
  createMetadataAdapter() {
    return {
      id: PROVIDER_KEY,
      async resolve(ctx) {
        return mapBdFugueMetadata(await resolveBdFugueMetadata(ctx));
      },
    } satisfies MetadataProviderAdapter;
  },
  healthCheck: createMetadataHealthCheck("bdfugue", "BD Fugue", async () => {
    const start = Date.now();
    const isUp = await pingUrl("https://www.bdfugue.com/");
    return {
      ok: isUp,
      latency: Date.now() - start,
      error: isUp ? null : "Host unreachable",
    };
  }),
  testHandlers: {
    "bdfugue-metadata": {
      label: "BD Fugue - Metadata",
      kind: "metadata",
      run: async (query) =>
        mapBdFugueMetadata(await resolveBdFugueMetadata({ name: query })),
    },
    "bdfugue-barcode": {
      label: "BD Fugue - Barcode",
      kind: "metadata-barcode",
      run: async (query) =>
        mapBdFugueMetadata(
          await resolveBdFugueMetadata({ name: "", barcode: query }),
        ),
    },
  },
  mappingProbe: {
    sampleInput: SAMPLE_BARCODE,
    context: {
      name: "DanMachi - la Légende des Familias tome 1",
      barcode: SAMPLE_BARCODE,
    },
  },
  runMappingProbe: async () =>
    metadataProbe(
      mapBdFugueMetadata(await fetchBdFugueByBarcode(SAMPLE_BARCODE)),
    ),
  collectMappingRawKeys: async (context) => {
    const ctx = probeContextOrDefault(context, {
      name: "DanMachi - la Légende des Familias tome 1",
      barcode: SAMPLE_BARCODE,
    });
    return mappingRawKeysFromFetch(() =>
      fetchBdFugueByBarcode(ctx.barcode || SAMPLE_BARCODE),
    );
  },
  refreshBarcodePriceOffers: refreshBdFugueOffers,
};

export { mapBdFugueMetadata };
