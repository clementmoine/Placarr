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
  collectIzneoMappingRawKeys,
  fetchIzneoAlbum,
  getIzneoSuggestions,
  resolveIzneoMetadata,
  type IzneoAlbum,
} from "./fetch";
import {
  pinnedProviderRecordId,
  pinnedProviderRecordUrl,
} from "@/providers/shared/pinnedRecord";

export {
  fetchIzneoAlbum,
  fetchIzneoSerieVolumes,
  getIzneoSuggestions,
  izneoAlbumCoverUrl,
  mapIzneoAlbumPayload,
  parseIzneoSearchPayload,
  parseIzneoVolumesPayload,
  resolveIzneoMetadata,
  searchIzneoSeries,
} from "./fetch";

const PROVIDER_KEY = "izneo";
const PRICE_SOURCE = "Izneo";
const SAMPLE_QUERY = "Astérix et Cléopâtre";

function parseIzneoRecordIdFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (!/izneo\.com$/i.test(parsed.hostname.replace(/^www\./i, ""))) {
      return null;
    }
    return (
      parsed.pathname.match(/\/(?:fr\/)?bd\/(\d+)/i)?.[1] ??
      parsed.pathname.match(/\/album\/(\d+)/i)?.[1] ??
      null
    );
  } catch {
    return null;
  }
}

function formatEuroPrice(cents: number): string {
  return `${(cents / 100).toFixed(2).replace(".", ",")} €`;
}

function formatRating(value: number, count?: number): string {
  const formatted = value.toLocaleString("fr-FR", {
    maximumFractionDigits: 1,
  });
  return count && count > 0
    ? `${formatted}/5 (${count.toLocaleString("fr-FR")} notes)`
    : `${formatted}/5`;
}

function buildAttachments(album: IzneoAlbum): MetadataAttachment[] | undefined {
  if (!album.imageUrl) return undefined;
  return [
    {
      type: "cover",
      url: album.imageUrl,
      title: album.title,
      role: "fr",
      source: PROVIDER_KEY,
    },
  ];
}

export function mapIzneoMetadata(
  album: IzneoAlbum | null,
): MetadataResult | null {
  if (!album?.title) return null;

  const facts: MetadataFact[] = [
    {
      kind: "external-link",
      label: "Izneo",
      value: "Voir la fiche",
      url: album.sourceUrl,
      source: PROVIDER_KEY,
      confidence: 0.66,
      priority: 34,
    },
  ];

  if (album.ratingValue != null) {
    facts.push({
      kind: "rating",
      label: "Izneo",
      value: formatRating(album.ratingValue, album.ratingCount),
      source: PROVIDER_KEY,
      confidence: 0.6,
      priority: 50,
    });
  }

  for (const genre of album.genres.slice(0, 8)) {
    facts.push({
      kind: "tag",
      label: "Genre",
      value: genre,
      source: PROVIDER_KEY,
      confidence: 0.55,
      priority: 24,
    });
  }

  for (const publisher of album.publishers.slice(0, 3)) {
    facts.push({
      kind: "publisher",
      label: "Éditeur",
      value: publisher,
      source: PROVIDER_KEY,
      confidence: 0.58,
      priority: 24,
    });
  }

  if (album.seriesName) {
    facts.push({
      kind: "series",
      label: "Série",
      value: album.seriesName,
      url: album.seriesUrl,
      source: PROVIDER_KEY,
      confidence: 0.66,
      priority: 32,
    });
  }

  if (album.volume) {
    facts.push({
      kind: "tag",
      label: "Tome",
      value: album.volume,
      source: PROVIDER_KEY,
      confidence: 0.6,
      priority: 28,
    });
  }

  if (album.barcode) {
    facts.push({
      kind: "identifier",
      label: bookIdentifierLabel(album.barcode),
      value: album.barcode,
      source: PROVIDER_KEY,
      confidence: 0.64,
      priority: 40,
    });
  }

  if (album.releaseDate) {
    facts.push({
      kind: "release-date",
      label: "Parution",
      value: album.releaseDate,
      source: PROVIDER_KEY,
      confidence: 0.58,
      priority: 22,
    });
  }

  if (album.priceCents) {
    facts.push({
      kind: "price",
      label: "Numérique",
      value: formatEuroPrice(album.priceCents),
      source: PROVIDER_KEY,
      confidence: 0.62,
      priority: 48,
    });
  }

  const metadata: MetadataResult = {
    title: album.title,
    authors: album.authors.length
      ? album.authors.map((name) => ({ name }))
      : undefined,
    publishers: album.publishers.length
      ? album.publishers.map((name) => ({ name }))
      : undefined,
    pageCount: album.pageCount,
    description: album.description,
    releaseDate: album.releaseDate,
    imageUrl: album.imageUrl,
    barcode: album.barcode,
    aliases:
      album.displayTitle &&
      album.displayTitle.trim() &&
      album.displayTitle.trim() !== album.title.trim()
        ? [album.displayTitle.trim()]
        : undefined,
    regionalTitles: [{ region: "fr", text: album.title }],
    attachments: buildAttachments(album),
    facts,
    externalIds: { izneo: album.id },
  };

  return {
    ...metadata,
    observations: observationsFromMetadataResult(metadata, {
      providerId: PROVIDER_KEY,
      providerLabel: "Izneo",
      sourceDocumentRole: "catalog_product",
      sourceUrl: album.sourceUrl,
      evidenceSignals: album.barcode
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

async function refreshIzneoOffers(ctx: BarcodePriceRefreshContext) {
  if (ctx.shelfType !== "books") return [];
  const barcode = normalizeProductBarcode(ctx.cleanedBarcode);
  const album = await resolveIzneoMetadata({
    barcode: barcode || undefined,
    name: ctx.primaryName,
    lookupQueries: ctx.fallbackNames,
  });
  if (!album?.priceCents) return [];
  return pricedOffers(PRICE_SOURCE, [
    {
      condition: "new",
      priceCents: album.priceCents,
      rawValue: album,
      extra: {
        productName: album.title,
        sourceUrl: album.sourceUrl,
      },
    },
  ]);
}

export const izneoModule: ProviderModule = {
  info: {
    id: "izneo",
    label: "Izneo",
    types: ["books"],
    nameDatabase: true,
    capabilities: [
      "identify",
      "cover",
      "description",
      "rating",
      "people",
      "price",
      "pageCount",
      "releaseDate",
    ],
    auth: { kind: "scrape" },
    canonical: false,
    defaultLanguage: "fr",
    isRealBoxCover: true,
    coverUrlHost: "image.izneo.com",
    coverProvenanceRules: {
      catalog: ["image.izneo.com/fr/images/album/"],
    },
    remoteImageReferer: "https://www.izneo.com/",
    remoteImageFallback: true,
    bookCoverPriority: "primary",
    requiresTitleAlignment: true,
    barcodeScopedPriceSource: true,
    websiteUrl: "https://www.izneo.com/",
    notes:
      "Plateforme BD/manga numérique — API web search/v2 + serie volumes + album (EAN, note, cover).",
  },
  evidence: {
    label: "Izneo",
    sourceWeight: 0.34,
    cleanCachedNames: true,
  },
  parseMetadataRecordIdFromUrl: parseIzneoRecordIdFromUrl,
  createMetadataAdapter() {
    return {
      id: "izneo",
      async resolve(ctx) {
        throwIfAborted(ctx.signal);
        const pinnedUrl = pinnedProviderRecordUrl(ctx, "izneo");
        const pinnedId =
          pinnedProviderRecordId(ctx, "izneo") ||
          (pinnedUrl ? parseIzneoRecordIdFromUrl(pinnedUrl) : null);
        if (pinnedId) {
          const pinned = mapIzneoMetadata(
            await fetchIzneoAlbum(pinnedId, ctx.signal),
          );
          if (pinned) return pinned;
        }
        return mapIzneoMetadata(
          await resolveIzneoMetadata({
            name: String(ctx.name || "").trim() || undefined,
            barcode: ctx.barcode ?? undefined,
            lookupQueries: ctx.lookupQueries,
            signal: ctx.signal,
          }),
        );
      },
    } satisfies MetadataProviderAdapter;
  },
  suggestDatabaseTitles: ({ cleanedName }) => getIzneoSuggestions(cleanedName),
  healthCheck: createMetadataHealthCheck("izneo", "Izneo", async () => {
    const start = Date.now();
    const isUp = await pingUrl(
      "https://www.izneo.com/api/web/search/v2/search-all/asterix",
    );
    return {
      ok: isUp,
      latency: Date.now() - start,
      error: isUp ? null : "API unreachable",
    };
  }),
  testHandlers: {
    "izneo-metadata": {
      label: "Izneo - Metadata",
      kind: "metadata",
      run: (query) => resolveIzneoMetadata({ name: query }),
    },
  },
  mappingProbe: {
    sampleInput: SAMPLE_QUERY,
    context: { name: SAMPLE_QUERY },
  },
  runMappingProbe: async () =>
    metadataProbe(
      mapIzneoMetadata(await resolveIzneoMetadata({ name: SAMPLE_QUERY })),
    ),
  collectMappingRawKeys: async (context) => {
    const ctx = probeContextOrDefault(context, { name: SAMPLE_QUERY });
    return collectIzneoMappingRawKeys(ctx.name);
  },
  refreshBarcodePriceOffers: refreshIzneoOffers,
};
