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
  ProviderModule,
} from "@/types/providerModule";

import {
  collectCanalbdMappingRawKeys,
  fetchCanalbdArticle,
  getCanalbdSuggestions,
  resolveCanalbdMetadata,
  type CanalbdArticle,
} from "./fetch";
import { pinnedProviderRecordUrl } from "@/providers/shared/pinnedRecord";

export {
  canalbdOffersUrl,
  canalbdSearchUrl,
  fetchCanalbdArticle,
  getCanalbdSuggestions,
  looksLikeCanalbdArticlePage,
  parseCanalbdArticlePage,
  parseCanalbdOffersPrice,
  parseCanalbdSearchHits,
  resolveCanalbdMetadata,
  searchCanalbdHits,
} from "./fetch";

const PROVIDER_KEY = "canalbd";
const PRICE_SOURCE = "CanalBD";
const SAMPLE_QUERY = "Astérix chez les Normands";

function formatEuroPrice(cents: number): string {
  return `${(cents / 100).toFixed(2).replace(".", ",")} €`;
}

function formatRating(value: number, count?: number): string {
  const formatted = value.toLocaleString("fr-FR", {
    maximumFractionDigits: 1,
  });
  return count && count > 0
    ? `${formatted}/5 (${count.toLocaleString("fr-FR")} avis)`
    : `${formatted}/5`;
}

function buildAttachments(
  article: CanalbdArticle,
): MetadataAttachment[] | undefined {
  if (!article.imageUrl) return undefined;
  return [
    {
      type: "cover",
      url: article.imageUrl,
      title: article.title,
      role: "fr",
      source: PROVIDER_KEY,
    },
  ];
}

export function mapCanalbdMetadata(
  article: CanalbdArticle | null,
): MetadataResult | null {
  if (!article?.title) return null;

  const facts: MetadataFact[] = [
    {
      kind: "external-link",
      label: "Canal BD",
      value: "Voir la fiche",
      url: article.sourceUrl,
      source: PROVIDER_KEY,
      confidence: 0.64,
      priority: 34,
    },
  ];

  if (article.ratingValue != null) {
    facts.push({
      kind: "rating",
      label: "Canal BD",
      value: formatRating(article.ratingValue, article.ratingCount),
      source: PROVIDER_KEY,
      confidence: 0.56,
      priority: 48,
    });
  }

  if (article.publisher) {
    facts.push({
      kind: "publisher",
      label: "Éditeur",
      value: article.publisher,
      source: PROVIDER_KEY,
      confidence: 0.6,
      priority: 24,
    });
  }

  if (article.seriesName) {
    facts.push({
      kind: "series",
      label: "Série",
      value: article.seriesName,
      url: article.seriesUrl,
      source: PROVIDER_KEY,
      confidence: 0.62,
      priority: 30,
    });
  }

  if (article.barcode) {
    facts.push({
      kind: "identifier",
      label: bookIdentifierLabel(article.barcode),
      value: article.barcode,
      source: PROVIDER_KEY,
      confidence: 0.68,
      priority: 40,
    });
  }

  if (article.releaseDate) {
    facts.push({
      kind: "release-date",
      label: "Parution",
      value: article.releaseDate,
      source: PROVIDER_KEY,
      confidence: 0.58,
      priority: 22,
    });
  }

  if (article.priceCents) {
    facts.push({
      kind: "price",
      label: "Neuf",
      value: formatEuroPrice(article.priceCents),
      source: PROVIDER_KEY,
      confidence: 0.62,
      priority: 50,
    });
  }

  const metadata: MetadataResult = {
    title: article.title,
    authors: article.authors.length
      ? article.authors.map((name) => ({ name }))
      : undefined,
    publishers: article.publisher ? [{ name: article.publisher }] : undefined,
    pageCount: article.pageCount,
    description: article.description,
    releaseDate: article.releaseDate,
    imageUrl: article.imageUrl,
    barcode: article.barcode,
    regionalTitles: [{ region: "fr", text: article.title }],
    attachments: buildAttachments(article),
    facts,
    externalIds: { canalbd: article.id },
  };

  return {
    ...metadata,
    observations: observationsFromMetadataResult(metadata, {
      providerId: PROVIDER_KEY,
      providerLabel: "Canal BD",
      sourceDocumentRole: "catalog_product",
      sourceUrl: article.sourceUrl,
      evidenceSignals: article.barcode
        ? ["structured_data", "barcode_match"]
        : ["structured_data", "title_match"],
      titleRole: "catalog_title",
      imageRole: "cover_front",
      factRole: "structured_fact",
      language: "fr",
    }),
    observationSchemaVersion: METADATA_OBSERVATION_SCHEMA_VERSION,
  };
}

async function refreshCanalbdOffers(ctx: BarcodePriceRefreshContext) {
  if (ctx.shelfType !== "books") return [];
  const barcode = normalizeProductBarcode(ctx.cleanedBarcode);
  if (!barcode) return [];

  for (const url of providerProductUrlsForKey(
    PROVIDER_KEY,
    ctx.providerProductUrls,
  )) {
    const article = await fetchCanalbdArticle(url);
    if (article?.priceCents && article.barcode === barcode) {
      return pricedOffers(PRICE_SOURCE, [
        {
          condition: "new",
          priceCents: article.priceCents,
          rawValue: article,
          extra: {
            productName: article.title,
            sourceUrl: article.sourceUrl,
          },
        },
      ]);
    }
  }

  const article = await resolveCanalbdMetadata({
    barcode,
    name: ctx.primaryName,
    lookupQueries: ctx.fallbackNames,
  });
  if (!article?.priceCents) return [];
  return pricedOffers(PRICE_SOURCE, [
    {
      condition: "new",
      priceCents: article.priceCents,
      rawValue: article,
      extra: {
        productName: article.title,
        sourceUrl: article.sourceUrl,
      },
    },
  ]);
}

export const canalbdModule: ProviderModule = {
  info: {
    id: "canalbd",
    label: "Canal BD",
    types: ["books"],
    nameDatabase: true,
    capabilities: [
      "identify",
      "cover",
      "description",
      "price",
      "people",
      "releaseDate",
      "pageCount",
      "rating",
    ],
    auth: { kind: "scrape" },
    canonical: false,
    defaultLanguage: "fr",
    isRealBoxCover: true,
    coverUrlHost: "canalbd.b-cdn.net",
    coverProvenanceRules: {
      catalog: ["canalbd.b-cdn.net"],
    },
    remoteImageReferer: "https://www.canalbd.net/",
    remoteImageFallback: true,
    bookCoverPriority: "primary",
    requiresTitleAlignment: true,
    bookIsbnBootstrapSource: true,
    websiteUrl: "https://www.canalbd.net/",
    notes:
      "Portail réseau librairies BD FR — recherche titre / ISBN BD, fiche article + offres HTMX (prix neuf). Catalogue BD/manga-centric.",
  },
  evidence: {
    label: "CanalBD",
    sourceWeight: 0.28,
  },
  parseMetadataRecordIdFromUrl(url) {
    try {
      const parsed = new URL(url);
      if (!/canalbd\.net$/i.test(parsed.hostname.replace(/^www\./i, ""))) {
        return null;
      }
      return (
        parsed.pathname.match(/\/articles\/[^/]*-(\d+)\/?/i)?.[1] ?? null
      );
    } catch {
      return null;
    }
  },
  createMetadataAdapter() {
    return {
      id: "canalbd",
      async resolve(ctx) {
        throwIfAborted(ctx.signal);
        const pinnedUrl = pinnedProviderRecordUrl(ctx, "canalbd");
        if (pinnedUrl) {
          const pinned = mapCanalbdMetadata(
            await fetchCanalbdArticle(pinnedUrl),
          );
          if (pinned) return pinned;
        }
        return mapCanalbdMetadata(
          await resolveCanalbdMetadata({
            name: String(ctx.name || "").trim() || undefined,
            barcode: ctx.barcode,
            lookupQueries: ctx.lookupQueries,
            signal: ctx.signal,
          }),
        );
      },
    } satisfies MetadataProviderAdapter;
  },
  suggestDatabaseTitles: ({ cleanedName }) =>
    getCanalbdSuggestions(cleanedName),
  refreshBarcodePriceOffers: refreshCanalbdOffers,
  healthCheck: createMetadataHealthCheck("canalbd", "Canal BD", async () => {
    const start = Date.now();
    const isUp = await pingUrl("https://www.canalbd.net/");
    return {
      ok: isUp,
      latency: Date.now() - start,
      error: isUp ? null : "Host unreachable",
    };
  }),
  testHandlers: {
    "canalbd-metadata": {
      label: "Canal BD - Metadata",
      kind: "metadata",
      run: (query) => resolveCanalbdMetadata({ name: query }),
    },
  },
  mappingProbe: {
    sampleInput: SAMPLE_QUERY,
    context: { name: SAMPLE_QUERY, type: "books" },
  },
  runMappingProbe: async () =>
    metadataProbe(
      mapCanalbdMetadata(
        await resolveCanalbdMetadata({ name: SAMPLE_QUERY }),
      ),
    ),
  collectMappingRawKeys: async (context) => {
    const ctx = probeContextOrDefault(context, { name: SAMPLE_QUERY });
    return collectCanalbdMappingRawKeys(ctx.name);
  },
};
