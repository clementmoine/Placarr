import { bookIdentifierLabel } from "@/core/identify/shelfLabels";
import {
  METADATA_OBSERVATION_SCHEMA_VERSION,
  observationsFromMetadataResult,
} from "@/core/enrich/observations";
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
import type { MetadataProviderAdapter } from "@/types/providerModule";

import {
  collectPlanetebdMappingRawKeys,
  fetchPlanetebdAlbum,
  getPlanetebdSuggestions,
  resolvePlanetebdMetadata,
  type PlanetebdAlbum,
} from "./fetch";

export {
  fetchPlanetebdAlbum,
  getPlanetebdSuggestions,
  parsePlanetebdAlbumPage,
  parsePlanetebdSearchHits,
  planetebdSearchUrl,
  resolvePlanetebdMetadata,
  searchPlanetebdHits,
} from "./fetch";

const PROVIDER_KEY = "planetebd";
const SAMPLE_QUERY = "Astérix en Lusitanie";

function buildAttachments(
  album: PlanetebdAlbum,
): MetadataAttachment[] | undefined {
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

export function mapPlanetebdMetadata(
  album: PlanetebdAlbum | null,
): MetadataResult | null {
  if (!album?.title) return null;

  const facts: MetadataFact[] = [
    {
      kind: "external-link",
      label: "Planète BD",
      value: "Voir la fiche",
      url: album.sourceUrl,
      source: PROVIDER_KEY,
      confidence: 0.64,
      priority: 34,
    },
  ];

  if (album.ratingLabel || album.ratingStars) {
    facts.push({
      kind: "rating",
      label: "Planète BD",
      value: album.ratingLabel
        ? album.ratingStars
          ? `${album.ratingLabel} (${album.ratingStars}/5)`
          : album.ratingLabel
        : `${album.ratingStars}/5`,
      source: PROVIDER_KEY,
      confidence: 0.58,
      priority: 48,
    });
  }

  for (const genre of album.genres.slice(0, 12)) {
    facts.push({
      kind: "tag",
      label: "Genre",
      value: genre,
      source: PROVIDER_KEY,
      confidence: 0.55,
      priority: 24,
    });
  }

  if (album.publisher) {
    facts.push({
      kind: "publisher",
      label: "Éditeur",
      value: album.publisher,
      source: PROVIDER_KEY,
      confidence: 0.6,
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
      confidence: 0.62,
      priority: 30,
    });
  }

  if (album.barcode) {
    facts.push({
      kind: "identifier",
      label: bookIdentifierLabel(album.barcode),
      value: album.barcode,
      source: PROVIDER_KEY,
      confidence: 0.58,
      priority: 38,
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

  const metadata: MetadataResult = {
    title: album.title,
    authors: album.authors.length
      ? album.authors.map((name) => ({ name }))
      : undefined,
    publishers: album.publisher ? [{ name: album.publisher }] : undefined,
    description: album.description,
    releaseDate: album.releaseDate,
    imageUrl: album.imageUrl,
    barcode: album.barcode,
    regionalTitles: [{ region: "fr", text: album.title }],
    attachments: buildAttachments(album),
    facts,
    externalIds: { planetebd: album.id },
  };

  return {
    ...metadata,
    observations: observationsFromMetadataResult(metadata, {
      providerId: PROVIDER_KEY,
      providerLabel: "Planète BD",
      sourceDocumentRole: "reference_record",
      sourceUrl: album.sourceUrl,
      evidenceSignals: album.barcode
        ? ["title_match", "barcode_match"]
        : ["title_match"],
      titleRole: "catalog_title",
      aliasRole: "provider_grouped_alias",
      imageRole: "cover_front",
      factRole: "structured_fact",
      language: "fr",
    }),
    observationSchemaVersion: METADATA_OBSERVATION_SCHEMA_VERSION,
  };
}

export const planetebdModule = defineProvider({
  info: {
    id: "planetebd",
    label: "Planète BD",
    types: ["books"],
    nameDatabase: true,
    capabilities: [
      "identify",
      "cover",
      "description",
      "rating",
      "people",
      "releaseDate",
    ],
    auth: { kind: "scrape" },
    supplyMode: "scrape_cache",
    canonical: false,
    defaultLanguage: "fr",
    isRealBoxCover: true,
    coverUrlHost: "static.planetebd.com",
    coverProvenanceRules: {
      catalog: ["static.planetebd.com/dynamicImages/album/cover/"],
    },
    remoteImageReferer: "https://www.planetebd.com/",
    remoteImageFallback: true,
    bookCoverPriority: "primary",
    requiresTitleAlignment: true,
    websiteUrl: "https://www.planetebd.com/",
    notes:
      "Critiques / notes BD-manga FR — recherche mot-clef + fiche album (og:isbn, genres, série).",
  },
  evidence: {
    label: "Planète BD",
    sourceWeight: 0.3,
    cleanCachedNames: true,
  },
  parseMetadataRecordIdFromUrl(url) {
    try {
      const parsed = new URL(url);
      if (!/planetebd\.com$/i.test(parsed.hostname.replace(/^www\./i, ""))) {
        return null;
      }
      return parsed.pathname.match(/\/(\d+)\.html$/i)?.[1] ?? null;
    } catch {
      return null;
    }
  },
  createMetadataAdapter() {
    return {
      id: "planetebd",
      async resolve(ctx) {
        throwIfAborted(ctx.signal);
        const pinnedUrl = pinnedProviderRecordUrl(ctx, "planetebd");
        if (pinnedUrl) {
          const pinned = mapPlanetebdMetadata(
            await fetchPlanetebdAlbum(pinnedUrl),
          );
          if (pinned) return pinned;
        }
        return mapPlanetebdMetadata(
          await resolvePlanetebdMetadata({
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
    getPlanetebdSuggestions(cleanedName),
  metadataSearch: (query) => resolvePlanetebdMetadata({ name: query }),
  mappingProbe: {
    sampleInput: SAMPLE_QUERY,
    context: { name: SAMPLE_QUERY },
  },
  runMappingProbe: async () =>
    metadataProbe(
      mapPlanetebdMetadata(
        await resolvePlanetebdMetadata({ name: SAMPLE_QUERY }),
      ),
    ),
  collectMappingRawKeys: async (context) => {
    const ctx = probeContextOrDefault(context, { name: SAMPLE_QUERY });
    return collectPlanetebdMappingRawKeys(ctx.name);
  },
});
