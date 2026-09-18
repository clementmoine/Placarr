import { createMetadataHealthCheck, pingUrl } from "@/core/catalog/healthUtils";
import { bookIdentifierLabel } from "@/core/identify/shelfLabels";
import { pricedOffers } from "@/core/catalog/priceOffers";
import {
  METADATA_OBSERVATION_SCHEMA_VERSION,
  observationsFromMetadataResult,
} from "@/core/enrich/observations";
import { normalizeProductBarcode } from "@/core/identify/normalize";
import { providerProductUrlsForKey } from "@/core/commerce/pricing/providerProductUrls";
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
} from "@/types/providerModule";
import { defineProvider } from "@/providers/shared/defineProvider";

import {
  collectGibertMappingRawKeys,
  fetchGibertProduct,
  resolveGibertMetadata,
  type GibertProduct,
} from "./fetch";

export {
  fetchGibertProduct,
  gibertSearchUrl,
  parseGibertProductPage,
  parseGibertSearchHits,
  resolveGibertMetadata,
  searchGibertHits,
} from "./fetch";

const PROVIDER_KEY = "gibert";
const PRICE_SOURCE = "Gibert";
const SAMPLE_BARCODE = "9782070360024";

function formatEuroPrice(cents: number): string {
  return `${(cents / 100).toFixed(2).replace(".", ",")} €`;
}

function buildAttachments(
  product: GibertProduct,
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

export function mapGibertMetadata(
  product: GibertProduct | null,
): MetadataResult | null {
  if (!product?.title) return null;

  const facts: MetadataFact[] = [
    {
      kind: "external-link",
      label: "Gibert",
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
      confidence: 0.62,
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
      confidence: 0.58,
      priority: 22,
    });
  }

  if (product.priceCents) {
    facts.push({
      kind: "price",
      label: product.condition === "used" ? "Occasion" : "Neuf",
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
    externalIds: product.barcode ? { gibert: product.barcode } : undefined,
  };

  return {
    ...metadata,
    observations: observationsFromMetadataResult(metadata, {
      providerId: PROVIDER_KEY,
      providerLabel: "Gibert",
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

async function refreshGibertOffers(ctx: BarcodePriceRefreshContext) {
  if (ctx.shelfType !== "books") return [];
  const barcode = normalizeProductBarcode(ctx.cleanedBarcode);
  if (!barcode) return [];

  const existingUrls = providerProductUrlsForKey(
    PROVIDER_KEY,
    ctx.providerProductUrls,
  );
  for (const url of existingUrls) {
    const product = await fetchGibertProduct(url);
    if (product?.priceCents && product.barcode === barcode) {
      return pricedOffers(PRICE_SOURCE, [
        {
          condition: product.condition === "used" ? "used" : "new",
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

  const product = await resolveGibertMetadata({
    barcode,
    name: ctx.primaryName,
    lookupQueries: ctx.fallbackNames,
  });
  if (!product?.priceCents) return [];
  return pricedOffers(PRICE_SOURCE, [
    {
      condition: product.condition === "used" ? "used" : "new",
      priceCents: product.priceCents,
      rawValue: product,
      extra: {
        productName: product.title,
        sourceUrl: product.productUrl,
      },
    },
  ]);
}

export const gibertModule = defineProvider({
  info: {
    id: "gibert",
    label: "Gibert",
    types: ["books"],
    capabilities: [
      "identify",
      "cover",
      "description",
      "people",
      "price",
      "pageCount",
      "releaseDate",
    ],
    auth: { kind: "scrape" },
    supplyMode: "scrape_cache",
    canonical: false,
    isSecondary: true,
    defaultLanguage: "fr",
    isRealBoxCover: true,
    coverUrlHost: "www.gibert.com",
    remoteImageReferer: "https://www.gibert.com/",
    remoteImageFallback: true,
    bookCoverPriority: "primary",
    requiresTitleAlignment: true,
    bookIsbnBootstrapSource: true,
    barcodeScopedPriceSource: true,
    mappingProbeConfigHint: "FLARESOLVERR_URL",
    websiteUrl: "https://www.gibert.com/",
    notes:
      "Chaîne livres nationale neuf/occasion (Magento + Cloudflare → FlareSolverr).",
  },
  evidence: {
    label: "Gibert",
    sourceWeight: 0.36,
    trustedRetailer: true,
  },
  createMetadataAdapter() {
    return {
      id: "gibert",
      async resolve({ name, barcode, lookupQueries, signal }) {
        throwIfAborted(signal);
        return mapGibertMetadata(
          await resolveGibertMetadata({
            name: String(name || "").trim() || undefined,
            barcode: barcode ?? undefined,
            lookupQueries,
            signal,
          }),
        );
      },
    } satisfies MetadataProviderAdapter;
  },
  healthCheck: createMetadataHealthCheck("gibert", "Gibert", async () => {
    const start = Date.now();
    const isUp = await pingUrl("https://www.gibert.com/");
    return {
      ok: isUp,
      latency: Date.now() - start,
      error: isUp ? null : "Host unreachable",
    };
  }),
  testHandlers: {
    "gibert-metadata": {
      label: "Gibert - Metadata",
      kind: "metadata",
      run: (query) => resolveGibertMetadata({ name: query }),
    },
    "gibert-barcode": {
      label: "Gibert - Barcode",
      kind: "metadata",
      run: (query) => resolveGibertMetadata({ barcode: query }),
    },
  },
  mappingProbe: {
    sampleInput: SAMPLE_BARCODE,
    context: { barcode: SAMPLE_BARCODE },
  },
  runMappingProbe: async () =>
    metadataProbe(
      mapGibertMetadata(
        await resolveGibertMetadata({ barcode: SAMPLE_BARCODE }),
      ),
    ),
  collectMappingRawKeys: async (context) => {
    const ctx = probeContextOrDefault(context, {
      name: "",
      barcode: SAMPLE_BARCODE,
    });
    return collectGibertMappingRawKeys(ctx.barcode || ctx.name);
  },
  refreshBarcodePriceOffers: refreshGibertOffers,
});
