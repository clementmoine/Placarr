import { createMetadataHealthCheck, pingUrl } from "@/core/catalog/healthUtils";
import { bookIdentifierLabel } from "@/core/identify/shelfLabels";
import { normalizeProductBarcode } from "@/core/identify/normalize";
import { metadataProbe } from "@/lib/dev/mappingProbe";
import {
  mappingRawKeysFromFetch,
  probeContextOrDefault,
} from "@/lib/dev/mappingRawKeys";
import { pricedOffers } from "@/core/catalog/priceOffers";
import {
  METADATA_OBSERVATION_SCHEMA_VERSION,
  observationsFromMetadataResult,
} from "@/core/enrich/observations";
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
  abebooksCoverDownloadCandidates,
  fetchAbeBooksProduct,
  fetchAbeBooksSeriesVolumesFromBarcode,
  type AbeBooksProduct,
} from "./fetch";

export {
  abebooksCoverDownloadCandidates,
  abebooksCoverUrl,
  abebooksProductUrl,
  fetchAbeBooksProduct,
  fetchAbeBooksSeriesVolumes,
  fetchAbeBooksSeriesVolumesFromBarcode,
  isbnFromAbeBooksCoverUrl,
  parseAbeBooksCoverUrl,
  parseAbeBooksProductAuthor,
  parseAbeBooksProductName,
  parseAbeBooksProductOffers,
  parseAbeBooksSeriesId,
  parseAbeBooksSeriesVolumes,
  splitAbeBooksTitleAndAuthor,
} from "./fetch";

const PROVIDER_KEY = "abebooks";
const PRICE_SOURCE = "AbeBooks";
const SAMPLE_BARCODE = "9782803624560";

function buildAttachments(
  product: AbeBooksProduct,
): MetadataAttachment[] | undefined {
  if (!product.coverUrl) return undefined;
  return [
    {
      type: "cover",
      url: product.coverUrl,
      title: product.productName,
      role: "fr",
      source: PROVIDER_KEY,
    },
  ];
}

export function mapAbeBooksMetadata(
  product: AbeBooksProduct | null,
): MetadataResult | null {
  if (!product) return null;
  if (!product.productName && !product.coverUrl) return null;

  const facts: MetadataFact[] = [
    {
      kind: "external-link",
      label: "AbeBooks",
      value: "Voir la fiche",
      url: product.sourceUrl,
      source: PROVIDER_KEY,
      confidence: 0.62,
      priority: 32,
    },
  ];

  if (product.barcode) {
    facts.push({
      kind: "identifier",
      label: bookIdentifierLabel(product.barcode),
      value: product.barcode,
      source: PROVIDER_KEY,
      confidence: 0.9,
      priority: 40,
    });
  }

  const metadata: MetadataResult = {
    title: product.productName || product.barcode,
    authors: product.author ? [{ name: product.author }] : undefined,
    barcode: product.barcode,
    imageUrl: product.coverUrl,
    attachments: buildAttachments(product),
    facts,
  };

  return {
    ...metadata,
    observations: observationsFromMetadataResult(metadata, {
      providerId: PROVIDER_KEY,
      providerLabel: "AbeBooks",
      sourceDocumentRole: "catalog_product",
      sourceUrl: product.sourceUrl,
      evidenceSignals: ["barcode_match", "title_match"],
      titleRole: "catalog_title",
      aliasRole: "provider_grouped_alias",
      imageRole: "cover_front",
      factRole: "structured_fact",
      language: "fr",
    }),
    observationSchemaVersion: METADATA_OBSERVATION_SCHEMA_VERSION,
  };
}

async function refreshAbeBooksOffers(ctx: BarcodePriceRefreshContext) {
  if (ctx.shelfType !== "books") return [];
  const barcode = normalizeProductBarcode(ctx.cleanedBarcode);
  if (!barcode) return [];

  const product = await fetchAbeBooksProduct(barcode);
  if (!product) return [];

  return pricedOffers(
    PRICE_SOURCE,
    product.offers.map((offer) => ({
      condition: offer.condition,
      priceCents: offer.priceCents,
      rawValue: offer,
      extra: {
        productName: product.productName ?? null,
        merchantName: "AbeBooks",
        sourceUrl: product.sourceUrl,
        coverUrl: product.coverUrl ?? null,
      },
    })),
  );
}

export const abebooksModule: ProviderModule = {
  info: {
    id: "abebooks",
    label: "AbeBooks",
    types: ["books"],
    capabilities: ["price", "cover"],
    // Prices stay on refreshBarcodePriceOffers — metadata chase must not wait.
    metadataCapabilities: ["cover"],
    auth: { kind: "scrape" },
    supplyMode: "scrape_cache",
    canonical: false,
    defaultLanguage: "fr",
    websiteUrl: "https://www.abebooks.fr/",
    coverUrlHost: "pictures.abebooks.com",
    coverProvenanceRules: {
      catalog: ["pictures.abebooks.com/isbn/"],
    },
    remoteImageReferer: "https://www.abebooks.fr/",
    bookCoverPriority: "secondary",
    requiresTitleAlignment: true,
    barcodeScopedPriceSource: true,
    imageScoreAdjustment: -40,
    notes:
      "Marketplace livres (Amazon). Prix + cover via fiche ISBN (/products/isbn/). Siblings de série via widget (ISBN dans l’URL cover) puis ré-exploitation robots-ok des fiches ISBN — pas de search titre.",
  },
  expandCoverDownloadCandidates: abebooksCoverDownloadCandidates,
  contributeSeriesVolumeBarcodes: async ({ seedBarcode }) =>
    fetchAbeBooksSeriesVolumesFromBarcode(seedBarcode),
  createMetadataAdapter() {
    return {
      id: PROVIDER_KEY,
      async resolve(ctx) {
        throwIfAborted(ctx.signal);
        const barcode = normalizeProductBarcode(ctx.barcode);
        if (!barcode) return null;
        return mapAbeBooksMetadata(
          await fetchAbeBooksProduct(barcode, { requireOffers: false }),
        );
      },
    } satisfies MetadataProviderAdapter;
  },
  healthCheck: createMetadataHealthCheck("abebooks", "AbeBooks", async () => {
    const start = Date.now();
    const isUp = await pingUrl("https://www.abebooks.fr/");
    return {
      ok: isUp,
      latency: Date.now() - start,
      error: isUp ? null : "Host unreachable",
    };
  }),
  testHandlers: {
    "abebooks-barcode": {
      label: "AbeBooks - Prix / cover par ISBN/EAN",
      kind: "metadata",
      run: async (query) =>
        mapAbeBooksMetadata(
          await fetchAbeBooksProduct(query, { requireOffers: false }),
        ),
    },
  },
  mappingProbe: {
    sampleInput: SAMPLE_BARCODE,
    context: { name: "", barcode: SAMPLE_BARCODE },
  },
  runMappingProbe: async () =>
    metadataProbe(
      mapAbeBooksMetadata(
        await fetchAbeBooksProduct(SAMPLE_BARCODE, { requireOffers: false }),
      ),
    ),
  collectMappingRawKeys: async (context) => {
    const ctx = probeContextOrDefault(context, {
      name: "",
      barcode: SAMPLE_BARCODE,
    });
    return mappingRawKeysFromFetch(() =>
      fetchAbeBooksProduct(ctx.barcode || SAMPLE_BARCODE, {
        requireOffers: false,
      }),
    );
  },
  refreshBarcodePriceOffers: refreshAbeBooksOffers,
};
