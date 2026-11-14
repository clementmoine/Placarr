import { bookIdentifierLabel } from "@/core/identify/shelfLabels";
import { normalizeProductBarcode } from "@/core/identify/normalize";
import {
  METADATA_OBSERVATION_SCHEMA_VERSION,
  observationsFromMetadataResult,
} from "@/core/enrich/observations";
import { pricedOffers } from "@/core/catalog/priceOffers";
import {
  matchBarcodes,
  matchPrimaryBarcode,
} from "@/core/catalog/matchContext";
import { metadataProbe } from "@/lib/dev/mappingProbe";
import { probeContextOrDefault } from "@/lib/dev/mappingRawKeys";
import { throwIfAborted } from "@/lib/http/abort";
import { defineProvider } from "@/providers/shared/defineProvider";
import { pinnedProviderRecordUrl } from "@/providers/shared/pinnedRecord";

import type {
  MetadataAttachment,
  MetadataFact,
  MetadataResult,
} from "@/types/metadataProvider";
import type {
  BarcodePriceRefreshContext,
  MetadataProviderAdapter,
} from "@/types/providerModule";

import {
  collectNautiljonMappingRawKeys,
  fetchNautiljonVolumeByUrl,
  getNautiljonSuggestions,
  resolveNautiljonVolume,
  type NautiljonVolume,
} from "./fetch";

export {
  fetchNautiljonVolumeByUrl,
  parseNautiljonSearchHits,
  parseNautiljonVolumeLinks,
  parseNautiljonVolumePage,
  resolveNautiljonVolume,
  searchNautiljonSeries,
} from "./fetch";

const PROVIDER_KEY = "nautiljon";
const PRICE_SOURCE = "Nautiljon";
const SAMPLE_QUERY = "Your Name. Vol. 1";

function buildAttachments(
  volume: NautiljonVolume,
): MetadataAttachment[] | undefined {
  if (!volume.imageUrl) return undefined;
  return [
    {
      type: "cover",
      url: volume.imageUrl,
      title: volume.title,
      role: "fr",
      source: PROVIDER_KEY,
    },
  ];
}

/** @internal exported for unit tests */
export function mapNautiljonMetadata(
  volume: NautiljonVolume | null,
): MetadataResult | null {
  if (!volume?.title) return null;

  const facts: MetadataFact[] = [
    {
      kind: "external-link",
      label: "Nautiljon",
      value: "Voir la fiche",
      url: volume.sourceUrl,
      source: PROVIDER_KEY,
      confidence: 0.68,
      priority: 36,
    },
  ];

  const normalizedBarcode = normalizeProductBarcode(volume.barcode);
  if (normalizedBarcode) {
    facts.push({
      kind: "identifier",
      label: bookIdentifierLabel(normalizedBarcode),
      value: normalizedBarcode,
      source: PROVIDER_KEY,
      confidence: 0.72,
      priority: 42,
    });
  }

  if (volume.publisherVf) {
    facts.push({
      kind: "publisher",
      label: "Éditeur VF",
      value: volume.publisherVf,
      source: PROVIDER_KEY,
      confidence: 0.64,
      priority: 28,
    });
  }

  if (volume.publisherVo) {
    facts.push({
      kind: "publisher",
      label: "Éditeur VO",
      value: volume.publisherVo,
      source: PROVIDER_KEY,
      confidence: 0.58,
      priority: 24,
    });
  }

  if (volume.seriesName) {
    facts.push({
      kind: "series",
      label: "Série",
      value: volume.seriesName,
      url: volume.seriesUrl,
      source: PROVIDER_KEY,
      confidence: 0.66,
      priority: 32,
    });
  }

  if (volume.volumeNumber != null) {
    facts.push({
      kind: "tag",
      label: "Tome",
      value: String(volume.volumeNumber),
      source: PROVIDER_KEY,
      confidence: 0.64,
      priority: 30,
    });
  }

  if (volume.demographic) {
    facts.push({
      kind: "tag",
      label: "Public",
      value: volume.demographic,
      source: PROVIDER_KEY,
      confidence: 0.56,
      priority: 20,
    });
  }

  if (volume.releaseDateVf) {
    facts.push({
      kind: "release-date",
      label: "Parution VF",
      value: volume.releaseDateVf,
      source: PROVIDER_KEY,
      confidence: 0.62,
      priority: 24,
    });
  }

  if (volume.priceEuroCents != null) {
    facts.push({
      kind: "price",
      label: "Prix VF",
      value: `${(volume.priceEuroCents / 100).toFixed(2).replace(".", ",")} €`,
      source: PROVIDER_KEY,
      confidence: 0.6,
      priority: 40,
    });
  }

  for (const author of volume.authors) {
    facts.push({
      kind: "artist",
      label: "Auteur",
      value: author,
      source: PROVIDER_KEY,
      confidence: 0.6,
      priority: 28,
    });
  }

  const metadata: MetadataResult = {
    title: volume.title,
    authors: volume.authors.map((name) => ({ name })),
    publishers: volume.publisherVf ? [{ name: volume.publisherVf }] : undefined,
    description: volume.description,
    releaseDate: volume.releaseDateVf || volume.releaseDateVo,
    pageCount: volume.pageCount,
    imageUrl: volume.imageUrl,
    barcode: normalizedBarcode || undefined,
    regionalTitles: [{ region: "fr", text: volume.title }],
    attachments: buildAttachments(volume),
    facts,
    externalIds: { nautiljon: volume.id },
  };

  return {
    ...metadata,
    observations: observationsFromMetadataResult(metadata, {
      providerId: PROVIDER_KEY,
      providerLabel: "Nautiljon",
      sourceDocumentRole: "reference_record",
      sourceUrl: volume.sourceUrl,
      sourceId: volume.id,
      evidenceSignals: normalizedBarcode
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

async function refreshNautiljonOffers(ctx: BarcodePriceRefreshContext) {
  if (ctx.shelfType !== "books") return [];
  const barcodes = matchBarcodes(ctx);
  const queries = Array.from(
    new Set(
      [ctx.primaryName, ...ctx.fallbackNames, ...barcodes]
        .map((q) => q?.trim())
        .filter(Boolean),
    ),
  );
  const primaryBarcode = matchPrimaryBarcode(ctx) || ctx.cleanedBarcode;

  for (const query of queries) {
    const volume = await resolveNautiljonVolume({
      name: query,
      barcode: primaryBarcode || undefined,
      signal: ctx.signal,
    });
    if (!volume?.priceEuroCents) continue;
    return pricedOffers(PRICE_SOURCE, [
      {
        condition: "new",
        priceCents: volume.priceEuroCents,
        rawValue: volume,
        extra: {
          productName: volume.title,
          sourceUrl: volume.sourceUrl,
          merchantName: "Nautiljon",
          currency: "EUR",
          metadataScoped: true,
        },
      },
    ]);
  }
  return [];
}

export const nautiljonModule = defineProvider({
  info: {
    id: "nautiljon",
    label: "Nautiljon",
    types: ["books"],
    nameDatabase: true,
    capabilities: [
      "identify",
      "cover",
      "description",
      "people",
      "releaseDate",
      "pageCount",
      "price",
    ],
    auth: { kind: "scrape" },
    supplyMode: "scrape_cache",
    canonical: false,
    defaultLanguage: "fr",
    isRealBoxCover: true,
    coverUrlHost: "nautiljon.com/images/",
    remoteImageReferer: "https://www.nautiljon.com/",
    remoteImageFallback: true,
    websiteUrl: "https://www.nautiljon.com/",
    bookCoverPriority: "primary",
    requiresTitleAlignment: true,
    catalogCoverTitles: true,
    notes:
      "Encyclopédie manga FR : fiches volume (EAN, prix €, éditeur VF, couverture). Cloudflare — FlareSolverr requis en live.",
  },
  evidence: {
    label: "Nautiljon",
    sourceWeight: 0.38,
    cleanCachedNames: true,
  },
  parseMetadataRecordIdFromUrl(url) {
    try {
      const parsed = new URL(url);
      if (!/nautiljon\.com$/i.test(parsed.hostname.replace(/^www\./i, ""))) {
        return null;
      }
      return parsed.pathname.match(/volume-\d+,(\d+)\.html$/i)?.[1] ?? null;
    } catch {
      return null;
    }
  },
  createMetadataAdapter() {
    return {
      id: PROVIDER_KEY,
      async resolve(ctx) {
        throwIfAborted(ctx.signal);
        const pinnedUrl = pinnedProviderRecordUrl(ctx, PROVIDER_KEY);
        if (pinnedUrl) {
          const pinned = mapNautiljonMetadata(
            await fetchNautiljonVolumeByUrl(pinnedUrl, ctx.signal),
          );
          if (pinned) return pinned;
        }
        return mapNautiljonMetadata(
          await resolveNautiljonVolume({
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
    getNautiljonSuggestions(cleanedName),
  metadataSearch: (query) => resolveNautiljonVolume({ name: query }),
  mappingProbe: {
    sampleInput: SAMPLE_QUERY,
    context: { name: SAMPLE_QUERY, type: "books" },
  },
  runMappingProbe: async () =>
    metadataProbe(
      mapNautiljonMetadata(
        await resolveNautiljonVolume({ name: SAMPLE_QUERY }),
      ),
    ),
  collectMappingRawKeys: async (context) => {
    const ctx = probeContextOrDefault(context, { name: SAMPLE_QUERY });
    return collectNautiljonMappingRawKeys(ctx.name);
  },
  refreshBarcodePriceOffers: refreshNautiljonOffers,
});
