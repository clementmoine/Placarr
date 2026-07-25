import { createMetadataHealthCheck, pingUrl } from "@/core/catalog/healthUtils";
import { bookIdentifierLabel } from "@/core/identify/shelfLabels";
import {
  METADATA_OBSERVATION_SCHEMA_VERSION,
  observationsFromMetadataResult,
} from "@/core/enrich/observations";
import { metadataProbe } from "@/lib/dev/mappingProbe";
import { probeContextOrDefault } from "@/lib/dev/mappingRawKeys";
import { throwIfAborted } from "@/lib/http/abort";

import type {
  MetadataAttachment,
  MetadataFact,
  MetadataResult,
} from "@/types/metadataProvider";
import type {
  MetadataProviderAdapter,
  ProviderModule,
} from "@/types/providerModule";

import {
  collectBabelioMappingRawKeys,
  fetchBabelioBook,
  getBabelioSuggestions,
  resolveBabelioMetadata,
  type BabelioBook,
} from "./fetch";
import { pinnedProviderRecordUrl } from "@/providers/shared/pinnedRecord";

export {
  fetchBabelioBook,
  getBabelioSuggestions,
  normalizeBabelioCoverUrl,
  parseBabelioAjaxHits,
  parseBabelioBookPage,
  parseBabelioHtmlSearchHits,
  resolveBabelioMetadata,
  searchBabelioHits,
} from "./fetch";

const PROVIDER_KEY = "babelio";
const SAMPLE_QUERY = "Dragon Ball Z - Cycle 1, tome 2";

function formatBabelioRating(value: number, count?: number): string {
  const formatted = value.toLocaleString("fr-FR", {
    maximumFractionDigits: 2,
  });
  return count && count > 0
    ? `${formatted}/5 (${count.toLocaleString("fr-FR")} notes)`
    : `${formatted}/5`;
}

function buildBabelioAttachments(
  book: BabelioBook,
): MetadataAttachment[] | undefined {
  if (!book.imageUrl) return undefined;
  return [
    {
      type: "cover",
      url: book.imageUrl,
      title: book.title,
      role: "fr",
      source: PROVIDER_KEY,
    },
  ];
}

/** @internal exported for unit tests */
export function mapBabelioMetadata(
  book: BabelioBook | null,
): MetadataResult | null {
  if (!book?.title) return null;

  const facts: MetadataFact[] = [
    {
      kind: "external-link",
      label: "Babelio",
      value: "Voir la fiche",
      url: book.sourceUrl,
      source: PROVIDER_KEY,
      confidence: 0.66,
      priority: 34,
    },
  ];

  if (book.ratingValue != null) {
    facts.push({
      kind: "rating",
      label: "Babelio",
      value: formatBabelioRating(book.ratingValue, book.ratingCount),
      source: PROVIDER_KEY,
      confidence: 0.64,
      priority: 52,
    });
  } else if (book.ratingCount || book.reviewCount || book.copies) {
    const parts: string[] = [];
    if (book.ratingCount) {
      parts.push(`${book.ratingCount.toLocaleString("fr-FR")} notes`);
    }
    if (book.reviewCount) {
      parts.push(`${book.reviewCount.toLocaleString("fr-FR")} critiques`);
    }
    if (book.copies) {
      parts.push(`${book.copies.toLocaleString("fr-FR")} lecteurs`);
    }
    facts.push({
      kind: "popularity",
      label: "Babelio",
      value: parts.join(" • "),
      source: PROVIDER_KEY,
      confidence: 0.52,
      priority: 18,
    });
  }

  for (const tag of book.tags.slice(0, 16)) {
    facts.push({
      kind: "tag",
      label: "Thème",
      value: tag,
      source: PROVIDER_KEY,
      confidence: 0.56,
      priority: 26,
    });
  }

  if (book.publisher) {
    facts.push({
      kind: "publisher",
      label: "Éditeur",
      value: book.publisher,
      source: PROVIDER_KEY,
      confidence: 0.58,
      priority: 24,
    });
  }

  if (book.seriesName) {
    facts.push({
      kind: "series",
      label: "Série",
      value: book.seriesName,
      url: book.seriesUrl,
      source: PROVIDER_KEY,
      confidence: 0.62,
      priority: 30,
    });
  }

  if (book.seriesPosition != null) {
    facts.push({
      kind: "tag",
      label: "Tome",
      value: String(book.seriesPosition),
      source: PROVIDER_KEY,
      confidence: 0.58,
      priority: 28,
    });
  }

  if (book.barcode) {
    facts.push({
      kind: "identifier",
      label: bookIdentifierLabel(book.barcode),
      value: book.barcode,
      source: PROVIDER_KEY,
      confidence: 0.5,
      priority: 36,
    });
  }

  if (book.releaseDate) {
    facts.push({
      kind: "release-date",
      label: "Parution",
      value: book.releaseDate,
      source: PROVIDER_KEY,
      confidence: 0.58,
      priority: 23,
    });
  }

  if (book.readingAge) {
    facts.push({
      kind: "tag",
      label: "Âge",
      value: book.readingAge,
      source: PROVIDER_KEY,
      confidence: 0.54,
      priority: 20,
    });
  }

  const metadata: MetadataResult = {
    title: book.title,
    authors: book.authors.length
      ? book.authors.map((name) => ({ name }))
      : undefined,
    publishers: book.publisher ? [{ name: book.publisher }] : undefined,
    pageCount: book.pageCount,
    description: book.description,
    releaseDate: book.releaseDate,
    imageUrl: book.imageUrl,
    // Community ISBN is evidence only — do not promote to result.barcode.
    regionalTitles: [{ region: "fr", text: book.title }],
    attachments: buildBabelioAttachments(book),
    facts,
    externalIds: { babelio: book.id },
  };

  return {
    ...metadata,
    observations: observationsFromMetadataResult(metadata, {
      providerId: PROVIDER_KEY,
      providerLabel: "Babelio",
      sourceDocumentRole: "reference_record",
      sourceUrl: book.sourceUrl,
      evidenceSignals: ["title_match"],
      titleRole: "catalog_title",
      aliasRole: "provider_grouped_alias",
      imageRole: "cover_front",
      factRole: "structured_fact",
      language: "fr",
    }),
    observationSchemaVersion: METADATA_OBSERVATION_SCHEMA_VERSION,
  };
}

export const babelioModule: ProviderModule = {
  info: {
    id: "babelio",
    label: "Babelio",
    types: ["books"],
    nameDatabase: true,
    capabilities: [
      "identify",
      "cover",
      "description",
      "rating",
      "people",
      "releaseDate",
      "pageCount",
    ],
    auth: { kind: "scrape" },
    canonical: false,
    defaultLanguage: "fr",
    isRealBoxCover: true,
    coverUrlHost: "www.babelio.com",
    coverProvenanceRules: {
      catalog: ["www.babelio.com/couv/", "babelio.com/couv/"],
    },
    remoteImageReferer: "https://www.babelio.com/",
    remoteImageFallback: true,
    bookCoverPriority: "primary",
    requiresTitleAlignment: true,
    websiteUrl: "https://www.babelio.com/",
    notes:
      "Catalogue social FR (AJAX recherche + fiche microdata) : note /5, tags, résumé, série. ISBN communautaire = evidence only (pas de bootstrap barcode).",
  },
  evidence: {
    label: "Babelio",
    sourceWeight: 0.32,
    cleanCachedNames: true,
  },
  parseMetadataRecordIdFromUrl(url) {
    try {
      const parsed = new URL(url);
      if (!/babelio\.com$/i.test(parsed.hostname.replace(/^www\./i, ""))) {
        return null;
      }
      return parsed.pathname.match(/\/livres\/[^/]+\/(\d+)/i)?.[1] ?? null;
    } catch {
      return null;
    }
  },
  createMetadataAdapter() {
    return {
      id: "babelio",
      async resolve(ctx) {
        throwIfAborted(ctx.signal);
        const pinnedUrl = pinnedProviderRecordUrl(ctx, "babelio");
        if (pinnedUrl) {
          const pinned = mapBabelioMetadata(
            await fetchBabelioBook(pinnedUrl, ctx.signal),
          );
          if (pinned) return pinned;
        }
        return mapBabelioMetadata(
          await resolveBabelioMetadata({
            name: String(ctx.name || "").trim() || undefined,
            barcode: ctx.barcode ?? undefined,
            lookupQueries: ctx.lookupQueries,
            signal: ctx.signal,
          }),
        );
      },
    } satisfies MetadataProviderAdapter;
  },
  suggestDatabaseTitles: ({ cleanedName }) =>
    getBabelioSuggestions(cleanedName),
  healthCheck: createMetadataHealthCheck("babelio", "Babelio", async () => {
    const start = Date.now();
    const isUp = await pingUrl("https://www.babelio.com/");
    return {
      ok: isUp,
      latency: Date.now() - start,
      error: isUp ? null : "Host unreachable",
    };
  }),
  testHandlers: {
    "babelio-metadata": {
      label: "Babelio - Metadata",
      kind: "metadata",
      run: (query) => resolveBabelioMetadata({ name: query }),
    },
  },
  mappingProbe: {
    sampleInput: SAMPLE_QUERY,
    context: { name: SAMPLE_QUERY },
  },
  runMappingProbe: async () =>
    metadataProbe(
      mapBabelioMetadata(await resolveBabelioMetadata({ name: SAMPLE_QUERY })),
    ),
  collectMappingRawKeys: async (context) => {
    const ctx = probeContextOrDefault(context, { name: SAMPLE_QUERY });
    return collectBabelioMappingRawKeys(ctx.name);
  },
};
