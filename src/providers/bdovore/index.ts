import { createMetadataHealthCheck, pingUrl } from "@/core/catalog/healthUtils";
import { bookIdentifierLabel } from "@/core/identify/shelfLabels";
import { normalizeProductBarcode } from "@/core/identify/normalize";
import {
  METADATA_OBSERVATION_SCHEMA_VERSION,
  observationsFromMetadataResult,
} from "@/core/enrich/observations";
import { metadataProbe } from "@/lib/dev/mappingProbe";
import {
  mappingRawKeysFromFetch,
  probeContextOrDefault,
} from "@/lib/dev/mappingRawKeys";
import { pricedOffers } from "@/core/catalog/priceOffers";

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
  fetchBdovoreAlbumByEan,
  fetchBdovoreAlbumById,
  fetchBdovoreMetadata,
  getBdovoreSuggestions,
  type BdovoreAlbum,
} from "./fetch";
import {
  pinnedProviderRecordId,
  pinnedProviderRecordUrl,
} from "@/providers/shared/pinnedRecord";

export {
  fetchBdovoreMetadata,
  fetchBdovoreAlbumByEan,
  fetchBdovoreAlbumById,
  fetchBdovoreSeriesAlbums,
  mapBdovoreAlbumRecord,
  pickBdovoreAlbum,
  rankBdovoreSeriesCandidates,
  searchBdovoreSeries,
} from "./fetch";

const PRICE_SOURCE = "BDovore";

function parseBdovoreRecordIdFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (!/bdovore\.com$/i.test(parsed.hostname.replace(/^www\./i, ""))) {
      return null;
    }
    const id =
      parsed.searchParams.get("id_tome")?.trim() ||
      parsed.pathname.match(/\/Album\/(\d+)/i)?.[1];
    return id || null;
  } catch {
    return null;
  }
}

function formatEuroPrice(cents: number): string {
  return `${(cents / 100).toFixed(2).replace(".", ",")} €`;
}

function buildBdovoreAttachments(
  album: BdovoreAlbum,
): MetadataAttachment[] | undefined {
  if (!album.imageUrl) return undefined;
  return [
    {
      type: "cover",
      url: album.imageUrl,
      title: album.title,
      role: "fr",
      source: "bdovore",
    },
  ];
}

function mapBdovoreMetadata(album: BdovoreAlbum | null): MetadataResult | null {
  if (!album?.title) return null;

  const facts: MetadataFact[] = [
    {
      kind: "external-link",
      label: "BDovore",
      value: "Voir la fiche",
      url: album.sourceUrl,
      source: "bdovore",
      confidence: 0.66,
      priority: 34,
    },
  ];

  if (album.publisher) {
    facts.push({
      kind: "publisher",
      label: "Éditeur",
      value: album.publisher,
      source: "bdovore",
      confidence: 0.62,
      priority: 24,
    });
  }

  if (album.collection) {
    facts.push({
      kind: "tag",
      label: "Collection",
      value: album.collection,
      source: "bdovore",
      confidence: 0.58,
      priority: 20,
    });
  }

  if (album.barcode) {
    facts.push({
      kind: "identifier",
      label: bookIdentifierLabel(album.barcode),
      value: album.barcode,
      source: "bdovore",
      confidence: 0.66,
      priority: 40,
    });
  }

  if (album.releaseDate) {
    facts.push({
      kind: "release-date",
      label: "Parution",
      value: album.releaseDate,
      source: "bdovore",
      confidence: 0.64,
      priority: 23,
    });
  }

  if (album.ratingValue) {
    facts.push({
      kind: "rating",
      label: "BDovore",
      value:
        album.ratingCount && album.ratingCount > 0
          ? `${album.ratingValue}/5 (${album.ratingCount} ${album.ratingCount > 1 ? "notes" : "note"})`
          : `${album.ratingValue}/5`,
      source: "bdovore",
      confidence: 0.56,
      priority: 20,
    });
  }

  if (album.seriesName) {
    facts.push({
      kind: "series",
      label: "Série",
      value: album.seriesName,
      source: "bdovore",
      confidence: 0.62,
      priority: 30,
    });
  }

  if (album.editionName) {
    facts.push({
      kind: "edition",
      label: "Édition",
      value: album.editionName,
      source: "bdovore",
      confidence: 0.58,
      priority: 22,
    });
  }

  if (album.issueNumber) {
    facts.push({
      kind: "tag",
      label: "Tome",
      value: album.issueNumber,
      source: "bdovore",
      confidence: 0.6,
      priority: 28,
    });
  }

  if (album.genre) {
    facts.push({
      kind: "tag",
      label: "Genre",
      value: album.genre,
      source: "bdovore",
      confidence: 0.56,
      priority: 22,
    });
  }

  for (const credit of album.credits) {
    facts.push({
      kind: "artist",
      label: credit.role,
      value: credit.names.join(" • "),
      source: "bdovore",
      confidence: 0.6,
      priority: 27,
    });
  }

  if (album.priceNewCents) {
    facts.push({
      kind: "price",
      label: "Neuf (BDnet)",
      value: formatEuroPrice(album.priceNewCents),
      source: "bdovore",
      confidence: 0.6,
      priority: 52,
    });
  }

  const authors = Array.from(
    new Set(album.credits.flatMap((credit) => credit.names)),
  );

  const metadata: MetadataResult = {
    title: album.title,
    authors: authors.length > 0 ? authors.map((name) => ({ name })) : undefined,
    publishers: album.publisher ? [{ name: album.publisher }] : undefined,
    description: album.description,
    releaseDate: album.releaseDate,
    imageUrl: album.imageUrl,
    barcode: album.barcode,
    regionalTitles: [{ region: "fr", text: album.title }],
    attachments: buildBdovoreAttachments(album),
    facts,
    externalIds: { bdovore: album.id },
  };

  return {
    ...metadata,
    observations: observationsFromMetadataResult(metadata, {
      providerId: "bdovore",
      providerLabel: "BDovore",
      sourceDocumentRole: "reference_record",
      sourceUrl: album.sourceUrl,
      sourceId: album.id,
      evidenceSignals: album.barcode
        ? ["structured_data", "barcode_match"]
        : ["structured_data", "title_match"],
      titleRole: "catalog_title",
      aliasRole: "provider_grouped_alias",
      imageRole: "cover_front",
      factRole: "structured_fact",
      language: "fr",
    }),
    observationSchemaVersion: METADATA_OBSERVATION_SCHEMA_VERSION,
  };
}

async function refreshBdovoreOffers(ctx: BarcodePriceRefreshContext) {
  if (ctx.shelfType !== "books") return [];
  const barcode = normalizeProductBarcode(ctx.cleanedBarcode);
  if (!barcode) return [];

  const album = await fetchBdovoreAlbumByEan(barcode);
  if (!album?.priceNewCents) return [];

  return pricedOffers(PRICE_SOURCE, [
    {
      condition: "new",
      priceCents: album.priceNewCents,
      rawValue: { priceNewCents: album.priceNewCents },
      extra: {
        productName: album.title,
        merchantName: "BDnet",
        sourceUrl: album.sourceUrl,
      },
    },
  ]);
}

export const bdovoreModule: ProviderModule = {
  info: {
    id: "bdovore",
    label: "BDovore",
    types: ["books"],
    nameDatabase: true,
    capabilities: [
      "identify",
      "cover",
      "rating",
      "people",
      "releaseDate",
      "price",
    ],
    auth: { kind: "scrape" },
    supplyMode: "scrape_cache",
    canonical: false,
    defaultLanguage: "fr",
    isRealBoxCover: true,
    bookCoverPriority: "primary",
    bookGallerySource: true,
    remoteImageFallback: true,
    remoteImageReferer: "https://www.bdovore.com/",
    coverUrlHost: "bdovore.com/images/couv/",
    coverProvenanceRules: {
      catalog: ["bdovore.com", "www.bdovore.com"],
    },
    websiteUrl: "https://www.bdovore.com/",
    requiresTitleAlignment: true,
    catalogCoverTitles: true,
    notes:
      "Base BD communautaire FR (API getjson ouverte). Lookup EAN direct (data=Album&EAN=), sinon série puis album par titre. Date de parution précise, crédits par rôle, prix neuf BDnet. Couvertures ~180px (pas de variante HD).",
  },
  evidence: {
    label: "BDovore",
    sourceWeight: 0.34,
    cleanCachedNames: true,
  },
  parseMetadataRecordIdFromUrl: parseBdovoreRecordIdFromUrl,
  createMetadataAdapter() {
    return {
      id: "bdovore",
      async resolve(ctx) {
        const pinnedUrl = pinnedProviderRecordUrl(ctx, "bdovore");
        const pinnedId =
          pinnedProviderRecordId(ctx, "bdovore") ||
          (pinnedUrl ? parseBdovoreRecordIdFromUrl(pinnedUrl) : null);
        if (pinnedId) {
          const pinned = mapBdovoreMetadata(
            await fetchBdovoreAlbumById(pinnedId),
          );
          if (pinned) return pinned;
        }

        const queries =
          ctx.lookupQueries && ctx.lookupQueries.length > 0
            ? ctx.lookupQueries
            : [String(ctx.name || "").trim()];
        const normalizedBarcode = normalizeProductBarcode(ctx.barcode);
        for (const query of queries) {
          if (!query?.trim() && !normalizedBarcode) continue;
          const metadata = mapBdovoreMetadata(
            await fetchBdovoreMetadata(query.trim(), {
              barcode: normalizedBarcode,
            }),
          );
          if (metadata) return metadata;
        }
        return null;
      },
    } satisfies MetadataProviderAdapter;
  },
  suggestDatabaseTitles: ({ cleanedName }) =>
    getBdovoreSuggestions(cleanedName),
  healthCheck: createMetadataHealthCheck("bdovore", "BDovore", async () => {
    const start = Date.now();
    const isUp = await pingUrl("https://www.bdovore.com/");
    return {
      ok: isUp,
      latency: Date.now() - start,
      error: isUp ? null : "Host unreachable",
    };
  }),
  testHandlers: {
    "bdovore-metadata": {
      label: "BDovore - Metadata",
      kind: "metadata",
      run: (query) => fetchBdovoreMetadata(query),
    },
    "bdovore-barcode": {
      label: "BDovore - EAN",
      kind: "metadata",
      run: (query) => fetchBdovoreAlbumByEan(query),
    },
  },
  mappingProbe: {
    sampleInput: "Super Picsou Géant n°7",
    context: { name: "Super Picsou Géant n°7" },
  },
  runMappingProbe: async () =>
    metadataProbe(
      mapBdovoreMetadata(await fetchBdovoreMetadata("Super Picsou Géant n°7")),
    ),
  collectMappingRawKeys: async (context) => {
    const ctx = probeContextOrDefault(context, {
      name: "Super Picsou Géant n°7",
    });
    return mappingRawKeysFromFetch(() =>
      fetchBdovoreMetadata(ctx.name, { barcode: ctx.barcode }),
    );
  },
  refreshBarcodePriceOffers: refreshBdovoreOffers,
};
