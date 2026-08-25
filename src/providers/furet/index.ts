import { createMetadataHealthCheck, pingUrl } from "@/core/catalog/healthUtils";
import { bookIdentifierLabel } from "@/core/identify/shelfLabels";
import { normalizeProductBarcode } from "@/core/identify/normalize";
import {
  retailerProductBarcodeConfirmed,
  retailerProductUrlBarcodeConflicts,
} from "@/core/commerce/retailer/productUrl";
import { providerProductUrlsForKey } from "@/core/commerce/pricing/providerProductUrls";
import { pricedOffers } from "@/core/catalog/priceOffers";
import { metadataProbe, probeErrorResult } from "@/lib/dev/mappingProbe";
import { probeContextOrDefault } from "@/lib/dev/mappingRawKeys";
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
  BarcodePriceRefreshContext,
  MetadataProviderAdapter,
} from "@/types/providerModule";
import { defineProvider } from "@/providers/shared/defineProvider";

import {
  collectFuretMappingRawKeys,
  fetchFuretByBarcode,
  fetchFuretProduct,
  resolveFuretMetadata,
  type FuretProduct,
} from "./fetch";

export {
  fetchFuretByBarcode,
  fetchFuretProduct,
  furetAttributeValue,
  furetSearchUrl,
  parseFuretProductPage,
  parseFuretSearchHits,
  resolveFuretMetadata,
  searchFuretHits,
} from "./fetch";

const PRICE_SOURCE = "Furet";
const PROVIDER_KEY = "furet";
const SAMPLE_BARCODE = "9782070360024";

function formatEuroPrice(cents: number): string {
  return `${(cents / 100).toFixed(2).replace(".", ",")} €`;
}

function buildAttachments(
  product: FuretProduct,
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

export function mapFuretMetadata(
  product: FuretProduct | null,
): MetadataResult | null {
  if (!product?.title) return null;

  const facts: MetadataFact[] = [
    {
      kind: "external-link",
      label: "Furet du Nord",
      value: "Voir la fiche",
      url: product.productUrl,
      source: PROVIDER_KEY,
      confidence: 0.68,
      priority: 34,
    },
  ];

  if (product.publisher) {
    facts.push({
      kind: "publisher",
      label: "Éditeur",
      value: product.publisher,
      source: PROVIDER_KEY,
      confidence: 0.64,
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
      confidence: 0.6,
      priority: 22,
    });
  }

  if (product.priceCents) {
    facts.push({
      kind: "price",
      label: "Neuf",
      value: formatEuroPrice(product.priceCents),
      source: PROVIDER_KEY,
      confidence: 0.66,
      priority: 52,
    });
  }

  const metadata: MetadataResult = {
    title: product.title,
    authors: product.authors.length
      ? product.authors.map((name) => ({ name }))
      : undefined,
    publishers: product.publisher ? [{ name: product.publisher }] : undefined,
    pageCount: product.pageCount,
    description: product.description,
    releaseDate: product.releaseDate,
    imageUrl: product.coverUrl,
    barcode: product.barcode,
    regionalTitles: [{ region: "fr", text: product.title }],
    attachments: buildAttachments(product),
    facts,
    externalIds: product.barcode ? { furet: product.barcode } : undefined,
  };

  return {
    ...metadata,
    observations: observationsFromMetadataResult(metadata, {
      providerId: PROVIDER_KEY,
      providerLabel: "Furet du Nord",
      sourceDocumentRole: "catalog_product",
      sourceUrl: product.productUrl,
      evidenceSignals: product.barcode
        ? ["structured_data", "barcode_match"]
        : ["structured_data"],
      titleRole: "catalog_title",
      aliasRole: "provider_grouped_alias",
      imageRole: "cover_front",
      factRole: "structured_fact",
      language: "fr",
    }),
    observationSchemaVersion: METADATA_OBSERVATION_SCHEMA_VERSION,
  };
}

async function refreshFuretOffers(ctx: BarcodePriceRefreshContext) {
  if (ctx.shelfType !== "books") return [];
  const barcode = normalizeProductBarcode(ctx.cleanedBarcode);
  if (!barcode) return [];

  for (const url of providerProductUrlsForKey(
    PROVIDER_KEY,
    ctx.providerProductUrls,
  ).filter((url) => {
    if (retailerProductUrlBarcodeConflicts(url, barcode)) return false;
    return retailerProductBarcodeConfirmed(url, null, barcode);
  })) {
    const product = await fetchFuretProduct(url);
    if (product?.priceCents && product.barcode === barcode) {
      return pricedOffers(PRICE_SOURCE, [
        {
          condition: "new",
          priceCents: product.priceCents,
          rawValue: product,
          extra: {
            productName: product.title,
            sourceUrl: product.productUrl,
          },
        },
      ]);
    }
  }

  const product = await resolveFuretMetadata({
    barcode,
    name: ctx.primaryName,
    lookupQueries: ctx.fallbackNames,
  });
  if (!product?.priceCents) return [];
  return pricedOffers(PRICE_SOURCE, [
    {
      condition: "new",
      priceCents: product.priceCents,
      rawValue: product,
      extra: {
        productName: product.title,
        sourceUrl: product.productUrl,
      },
    },
  ]);
}

export const furetModule = defineProvider({
  info: {
    id: "furet",
    label: "Furet du Nord",
    types: ["books"],
    capabilities: [
      "identify",
      "cover",
      "description",
      "price",
      "people",
      "releaseDate",
      "pageCount",
    ],
    auth: { kind: "scrape" },
    supplyMode: "scrape_cache",
    canonical: false,
    isSecondary: true,
    defaultLanguage: "fr",
    isRealBoxCover: true,
    coverUrlHost: "products-images.di-static.com",
    coverProvenanceRules: {
      catalog: ["products-images.di-static.com"],
    },
    remoteImageReferer: "https://www.furet.com/",
    remoteImageFallback: true,
    bookCoverPriority: "primary",
    requiresTitleAlignment: true,
    bookIsbnBootstrapSource: true,
    mappingProbeConfigHint:
      "Furet est derrière Cloudflare — définir FLARESOLVERR_URL pour les probes / scrape serveur.",
    websiteUrl: "https://www.furet.com/",
    notes:
      "Chaîne livres Nord / même stack Decitre (di-static). Recherche `/rechercher/result?q=` + fiche `/livres/…-{ean}.html`. Secondary: Flare trop lent pour le stage-1 preview.",
  },
  evidence: {
    label: "Furet",
    sourceWeight: 0.3,
  },
  createMetadataAdapter() {
    return {
      id: "furet",
      resolve: async ({ name, barcode, lookupQueries, signal }) =>
        mapFuretMetadata(
          await resolveFuretMetadata({
            name,
            barcode,
            lookupQueries,
            signal,
          }),
        ),
    } satisfies MetadataProviderAdapter;
  },
  refreshBarcodePriceOffers: refreshFuretOffers,
  healthCheck: createMetadataHealthCheck("furet", "Furet du Nord", async () => {
    const start = Date.now();
    const isUp = await pingUrl("https://www.furet.com/");
    return {
      ok: isUp,
      latency: Date.now() - start,
      error: isUp ? null : "Host unreachable",
    };
  }),
  testHandlers: {
    "furet-barcode": {
      label: "Furet du Nord - Barcode",
      kind: "metadata",
      run: (query) => fetchFuretByBarcode(query),
    },
  },
  mappingProbe: {
    sampleInput: SAMPLE_BARCODE,
    context: { name: "", barcode: SAMPLE_BARCODE, type: "books" },
  },
  runMappingProbe: async () => {
    const metadata = mapFuretMetadata(
      await resolveFuretMetadata({ barcode: SAMPLE_BARCODE }),
    );
    if (metadata) return metadataProbe(metadata);
    return probeErrorResult(
      process.env.FLARESOLVERR_URL?.trim()
        ? "No Furet listing for sample ISBN — Cloudflare/Flare may have blocked or HTML changed"
        : "No Furet listing — set FLARESOLVERR_URL (Cloudflare)",
      "empty",
    );
  },
  collectMappingRawKeys: async (context) => {
    const ctx = probeContextOrDefault(context, {
      name: "",
      barcode: SAMPLE_BARCODE,
    });
    return collectFuretMappingRawKeys(ctx.barcode || SAMPLE_BARCODE);
  },
});
