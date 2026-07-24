import { createMetadataHealthCheck, pingUrl } from "@/core/catalog/healthUtils";
import { bookIdentifierLabel } from "@/core/identify/shelfLabels";
import { pricedOffers } from "@/core/catalog/priceOffers";
import {
  METADATA_OBSERVATION_SCHEMA_VERSION,
  observationsFromMetadataResult,
} from "@/core/enrich/observations";
import { normalizeProductBarcode } from "@/core/identify/normalize";
import { metadataProbe } from "@/lib/dev/mappingProbe";
import { probeContextOrDefault } from "@/lib/dev/mappingRawKeys";
import { throwIfAborted } from "@/lib/http/abort";

import type {
  MetadataAttachment,
  MetadataFact,
  MetadataResult,
} from "@/types/metadataProvider";
import type {
  BarcodePriceRefreshContext,
  MetadataProviderAdapter,
  ProviderModule,
} from "@/types/providerModule";

import {
  collectVivlioMappingRawKeys,
  fetchVivlioProduct,
  resolveVivlioMetadata,
  searchVivlioHits,
  vivlioCoverDownloadCandidates,
  type VivlioProduct,
} from "./fetch";
import { pinnedProviderRecordUrl } from "@/providers/shared/pinnedRecord";

export {
  fetchVivlioProduct,
  normalizeVivlioCoverUrl,
  parseVivlioProductPage,
  parseVivlioSearchHits,
  resolveVivlioMetadata,
  searchVivlioHits,
  vivlioCoverDownloadCandidates,
  vivlioSearchUrl,
} from "./fetch";

const PROVIDER_KEY = "vivlio";
const PRICE_SOURCE = "Vivlio";
const SAMPLE_BARCODE = "9782749961347";

function formatEuroPrice(cents: number): string {
  return `${(cents / 100).toFixed(2).replace(".", ",")} €`;
}

function buildAttachments(
  product: VivlioProduct,
): MetadataAttachment[] | undefined {
  if (!product.imageUrl) return undefined;
  return [
    {
      type: "cover",
      url: product.imageUrl,
      title: product.title,
      role: "fr",
      source: PROVIDER_KEY,
    },
  ];
}

export function mapVivlioMetadata(
  product: VivlioProduct | null,
): MetadataResult | null {
  if (!product?.title) return null;

  const facts: MetadataFact[] = [
    {
      kind: "external-link",
      label: "Vivlio",
      value: "Voir la fiche",
      url: product.productUrl,
      source: PROVIDER_KEY,
      confidence: 0.66,
      priority: 34,
    },
  ];

  if (product.publisher) {
    facts.push({
      kind: "publisher",
      label: "Éditeur",
      value: product.publisher,
      source: PROVIDER_KEY,
      confidence: 0.6,
      priority: 24,
    });
  }

  if (product.barcode) {
    facts.push({
      kind: "identifier",
      label: bookIdentifierLabel(product.barcode),
      value: product.barcode,
      source: PROVIDER_KEY,
      confidence: 0.62,
      priority: 40,
    });
  }

  if (product.bookFormat) {
    facts.push({
      kind: "tag",
      label: "Format",
      value: product.bookFormat === "EBook" ? "Ebook" : product.bookFormat,
      source: PROVIDER_KEY,
      confidence: 0.7,
      priority: 28,
    });
  }

  if (product.seriesName) {
    facts.push({
      kind: "series",
      label: "Série",
      value: product.seriesName,
      url: product.seriesUrl,
      source: PROVIDER_KEY,
      confidence: 0.62,
      priority: 30,
    });
  }

  if (product.collection) {
    facts.push({
      kind: "tag",
      label: "Collection",
      value: product.collection,
      url: product.collectionUrl,
      source: PROVIDER_KEY,
      confidence: 0.56,
      priority: 22,
    });
  }

  if (product.releaseDate) {
    facts.push({
      kind: "release-date",
      label: "Parution",
      value: product.releaseDate,
      source: PROVIDER_KEY,
      confidence: 0.6,
      priority: 23,
    });
  }

  for (const category of product.categories ?? []) {
    facts.push({
      kind: "tag",
      label: "Rayon",
      value: category,
      source: PROVIDER_KEY,
      confidence: 0.5,
      priority: 18,
    });
  }

  if (product.priceCents) {
    facts.push({
      kind: "price",
      label: "Ebook",
      value: formatEuroPrice(product.priceCents),
      source: PROVIDER_KEY,
      confidence: 0.64,
      priority: 50,
    });
  }

  const metadata: MetadataResult = {
    title: product.title,
    authors: product.authors.length
      ? product.authors.map((name) => ({ name }))
      : undefined,
    publishers: product.publisher ? [{ name: product.publisher }] : undefined,
    description: product.description,
    releaseDate: product.releaseDate,
    imageUrl: product.imageUrl,
    // Ebook ISBN may differ from print scans — evidence only.
    regionalTitles: [{ region: "fr", text: product.title }],
    attachments: buildAttachments(product),
    facts,
    externalIds: product.barcode
      ? { vivlio: product.barcode }
      : undefined,
  };

  return {
    ...metadata,
    observations: observationsFromMetadataResult(metadata, {
      providerId: PROVIDER_KEY,
      providerLabel: "Vivlio",
      sourceDocumentRole: "catalog_product",
      sourceUrl: product.productUrl,
      evidenceSignals: ["structured_data"],
      titleRole: "catalog_title",
      imageRole: "cover_front",
      factRole: "structured_fact",
      language: "fr",
    }),
    observationSchemaVersion: METADATA_OBSERVATION_SCHEMA_VERSION,
  };
}

async function refreshVivlioOffers(ctx: BarcodePriceRefreshContext) {
  if (ctx.shelfType !== "books") return [];
  const barcode = normalizeProductBarcode(ctx.cleanedBarcode);
  if (!barcode) return [];
  const product = await resolveVivlioMetadata({
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

export const vivlioModule: ProviderModule = {
  info: {
    id: "vivlio",
    label: "Vivlio",
    types: ["books"],
    capabilities: [
      "identify",
      "cover",
      "description",
      "people",
      "price",
      "releaseDate",
    ],
    auth: { kind: "scrape" },
    canonical: false,
    defaultLanguage: "fr",
    isRealBoxCover: true,
    coverUrlHost: "cdn.vivlio.com",
    coverProvenanceRules: {
      catalog: ["cdn.vivlio.com/product/"],
    },
    remoteImageReferer: "https://shop.vivlio.com/",
    bookCoverPriority: "secondary",
    requiresTitleAlignment: true,
    barcodeScopedPriceSource: true,
    websiteUrl: "https://shop.vivlio.com/",
    notes:
      "Boutique ebook FR (JSON-LD Product/Book + liens /serie /collection). ISBN numérique ≠ print rayon — pas de bootstrap barcode.",
  },
  evidence: {
    label: "Vivlio",
    sourceWeight: 0.28,
    trustedRetailer: true,
  },
  parseMetadataRecordIdFromUrl(url) {
    try {
      const parsed = new URL(url);
      const host = parsed.hostname.replace(/^www\./i, "").toLowerCase();
      if (host !== "shop.vivlio.com" && host !== "vivlio.com") return null;
      return parsed.pathname.match(/\/product\/(\d{10,13})_/i)?.[1] ?? null;
    } catch {
      return null;
    }
  },
  expandCoverDownloadCandidates: vivlioCoverDownloadCandidates,
  createMetadataAdapter() {
    return {
      id: "vivlio",
      async resolve(ctx) {
        throwIfAborted(ctx.signal);
        const pinnedUrl = pinnedProviderRecordUrl(ctx, "vivlio");
        if (pinnedUrl) {
          const pinned = mapVivlioMetadata(
            await fetchVivlioProduct(pinnedUrl, ctx.signal),
          );
          if (pinned) return pinned;
        }
        return mapVivlioMetadata(
          await resolveVivlioMetadata({
            name: String(ctx.name || "").trim() || undefined,
            barcode: ctx.barcode,
            lookupQueries: ctx.lookupQueries,
            signal: ctx.signal,
          }),
        );
      },
    } satisfies MetadataProviderAdapter;
  },
  healthCheck: createMetadataHealthCheck("vivlio", "Vivlio", async () => {
    const start = Date.now();
    const isUp = await pingUrl("https://shop.vivlio.com/");
    return {
      ok: isUp,
      latency: Date.now() - start,
      error: isUp ? null : "Host unreachable",
    };
  }),
  testHandlers: {
    "vivlio-metadata": {
      label: "Vivlio - Metadata",
      kind: "metadata",
      run: (query) => resolveVivlioMetadata({ name: query }),
    },
    "vivlio-barcode": {
      label: "Vivlio - Barcode",
      kind: "metadata",
      run: (query) => resolveVivlioMetadata({ barcode: query }),
    },
  },
  mappingProbe: {
    sampleInput: SAMPLE_BARCODE,
    context: { barcode: SAMPLE_BARCODE, name: "Survivantes" },
  },
  runMappingProbe: async () =>
    metadataProbe(
      mapVivlioMetadata(
        await resolveVivlioMetadata({
          barcode: SAMPLE_BARCODE,
          name: "Survivantes",
        }),
      ),
    ),
  collectMappingRawKeys: async (context) => {
    const ctx = probeContextOrDefault(context, {
      barcode: SAMPLE_BARCODE,
      name: "Survivantes",
    });
    return collectVivlioMappingRawKeys(ctx.barcode || ctx.name);
  },
  refreshBarcodePriceOffers: refreshVivlioOffers,
};
