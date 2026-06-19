import axios from "axios";

import { createKeyHealthCheck } from "@/lib/providerHealthUtils";

import type { ProviderModule } from "@/types/providerModule";
import type { MetadataProviderAdapter } from "@/types/providerModule";
import type { MetadataResult } from "@/types/metadataProvider";
import { cleanSearchQuery, formatScore } from "@/services/metadataSearchUtils";
import { createTMDBResolver } from "./resolver";
import { teardownMetadataWhen } from "@/lib/providerTeardownHelpers";

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
    notes: "Films + séries (certifications = public conseillé).",
  },
  evidence: {
    label: "TMDB",
    sourceWeight: 0.44,
    canonical: true,
    cleanCachedNames: true,
  },
  createMetadataAdapter(deps) {
    const fetchFromTMDB = deps.fetchFromTMDB as NameResolver;
    return {
      id: "tmdb",
      async resolve({ name }) {
        return fetchFromTMDB(name);
      },
    } satisfies MetadataProviderAdapter;
  },
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
};

export { createTMDBResolver, parseTMDBSeriesIntent } from "./resolver";
