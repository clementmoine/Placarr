import { httpGet } from "@/lib/http/httpClient";
import { createKeyHealthCheck } from "@/core/catalog/healthUtils";
import { createOMDbResolver } from "./resolver";
import { teardownMetadataWhen } from "@/core/catalog/teardownHelpers";
import { defineProvider } from "@/providers/shared/defineProvider";

import type { MetadataProviderAdapter } from "@/types/providerModule";

const fetchFromOMDb = createOMDbResolver();

export const omdbModule = defineProvider({
  info: {
    id: "omdb",
    label: "OMDb",
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
    auth: { kind: "key", env: ["OMDB_API_KEY"], free: true },
    supplyMode: "api_live",
    canonical: true,
    defaultLanguage: "en",
    isSecondary: true,
    websiteUrl: "https://www.omdbapi.com/",
    notes: "Ratings complémentaires (IMDb/Rotten) + classification.",
  },
  createMetadataAdapter() {
    return {
      id: "omdb",
      async resolve({ name, imdbId, fallbackNames }) {
        return fetchFromOMDb(name, { imdbId, fallbackNames });
      },
    } satisfies MetadataProviderAdapter;
  },
  healthCheck: createKeyHealthCheck(
    "omdb",
    "OMDb",
    ["OMDB_API_KEY"],
    (key) => `https://www.omdbapi.com/?apikey=${key}&i=tt0111161`,
  ),
  metadataSearch: (query) => fetchFromOMDb(query),
  buildTeardownMetadataTasks(ctx) {
    return teardownMetadataWhen(
      ctx,
      "OMDb",
      () => fetchFromOMDb(ctx.name),
      "movies",
    );
  },
  mappingProbe: {
    sampleInput: "Aladdin",
    context: { name: "Aladdin" },
  },
  collectMappingRawKeys: async () => {
    const key = process.env.OMDB_API_KEY;
    if (!key) return [];
    try {
      const details = await httpGet("https://www.omdbapi.com/", {
        params: { apikey: key, t: "Aladdin", plot: "short" },
        timeout: 8000,
      });
      return Object.keys(details.data || {});
    } catch {
      return [];
    }
  },
});

export { createOMDbResolver };
