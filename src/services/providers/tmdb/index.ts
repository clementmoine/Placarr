import axios from "axios";

import { createKeyHealthCheck } from "@/lib/provider/healthUtils";

import type { ProviderModule } from "@/types/providerModule";
import type { MetadataProviderAdapter } from "@/types/providerModule";
import type { MetadataResult } from "@/types/metadataProvider";
import { cleanSearchQuery, formatScore } from "@/services/metadata/searchUtils";
import { createTMDBResolver } from "./resolver";
import { getTMDBSuggestions } from "./suggestions";
import { teardownMetadataWhen } from "@/lib/provider/teardownHelpers";

const fetchFromTMDB = createTMDBResolver({
  formatScore,
  cleanSearchQuery,
});

type NameResolver = (name: string) => Promise<MetadataResult | null>;

export const tmdbModule: ProviderModule = {
  info: {
    id: "tmdb",
    label: "TMDB",
    types: ["movies"],
    nameDatabase: true,
    capabilities: [
      "identify",
      "rating",
      "ageRating",
      "cover",
      "description",
      "releaseDate",
      "duration",
      "people",
    ],
    auth: { kind: "key", env: ["TMDB_API_KEY"], free: true },
    canonical: true,
    websiteUrl: "https://www.themoviedb.org/",
    apiKeyDashboardUrl: "https://www.themoviedb.org/settings/api",
    notes: "Films + séries (certifications = public conseillé).",
  },
  contributeGameBarcodeEnrichment: () => ({
    fetchMovieByTitle: (title) => fetchFromTMDB(title),
  }),
  evidence: {
    label: "TMDB",
    sourceWeight: 0.44,
    canonical: true,
    cleanCachedNames: true,
  },
  createMetadataAdapter() {
    return {
      id: "tmdb",
      async resolve({ name }) {
        return fetchFromTMDB(name);
      },
    } satisfies MetadataProviderAdapter;
  },
  suggestDatabaseTitles: ({ cleanedName }) => getTMDBSuggestions(cleanedName),
  healthCheck: createKeyHealthCheck(
    "tmdb",
    "TMDB",
    ["TMDB_API_KEY"],
    (key) => `https://api.themoviedb.org/3/configuration?api_key=${key}`,
  ),
  testHandlers: {
    "tmdb-metadata": {
      label: "TMDB - Metadata",
      kind: "metadata",
      run: (query) => fetchFromTMDB(query),
    },
  },
  buildTeardownMetadataTasks(ctx) {
    return teardownMetadataWhen(
      ctx,
      "TMDB",
      () => fetchFromTMDB(ctx.name),
      "movies",
    );
  },
  mappingProbe: {
    sampleInput: "Aladdin",
    context: { name: "Aladdin" },
  },
  collectMappingRawKeys: async () => {
    const key = process.env.TMDB_API_KEY;
    if (!key) return [];
    try {
      const search = await axios.get(
        "https://api.themoviedb.org/3/search/movie",
        {
          params: { query: "Aladdin", api_key: key, language: "fr-FR" },
          timeout: 8000,
        },
      );
      const id = search.data?.results?.[0]?.id;
      if (!id) return Object.keys(search.data?.results?.[0] || {});
      const details = await axios.get(
        `https://api.themoviedb.org/3/movie/${id}`,
        {
          params: { api_key: key, language: "fr-FR" },
          timeout: 8000,
        },
      );
      return Object.keys(details.data || {});
    } catch {
      return [];
    }
  },
  buildBarcodeSources(payload) {
    const hit = payload.tmdb;
    if (!hit?.title) return [];
    return [
      {
        mediaType: "movies",
        label: "TMDB",
        products: [
          { name: hit.title, coverUrl: hit.imageUrl },
          ...(hit.aliases || []).map((alias) => ({
            name: alias,
            coverUrl: hit.imageUrl,
            isAlias: true,
          })),
        ],
      },
    ];
  },
};

export { createTMDBResolver, parseTMDBSeriesIntent } from "./resolver";
