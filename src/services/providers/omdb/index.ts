import axios from "axios";

import { createKeyHealthCheck } from "@/lib/providerHealthUtils";
import { createOMDbResolver, type OMDbResolveOptions } from "./resolver";
import { teardownMetadataWhen } from "@/lib/providerTeardownHelpers";

import type { ProviderModule } from "@/types/providerModule";
import type { MetadataProviderAdapter } from "@/types/providerModule";
import type { MetadataResult } from "@/types/metadataProvider";

type NameResolver = (
  name: string,
  options?: OMDbResolveOptions,
) => Promise<MetadataResult | null>;

const fetchFromOMDb = createOMDbResolver();

export const omdbModule: ProviderModule = {
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
    canonical: true,
    notes: "Ratings complémentaires (IMDb/Rotten) + classification.",
  },
  createMetadataAdapter() {
    return {
      id: "omdb",
      async resolve({ name, imdbId, fallbackNames }: any) {
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
  testHandlers: {
    "omdb-metadata": {
      label: "OMDb - Metadata",
      kind: "metadata",
      run: (query) => fetchFromOMDb(query),
    },
  },
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
      const details = await axios.get("https://www.omdbapi.com/", {
        params: { apikey: key, t: "Aladdin", plot: "short" },
        timeout: 8000,
      });
      return Object.keys(details.data || {});
    } catch {
      return [];
    }
  },
};

export { createOMDbResolver };
