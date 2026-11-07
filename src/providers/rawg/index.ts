import { httpGet, type JsonObject } from "@/lib/http/httpClient";

import { createKeyHealthCheck } from "@/core/catalog/healthUtils";

import type { MetadataProviderAdapter } from "@/types/providerModule";
import { formatScore } from "@/core/enrich/search/searchUtils";
import { resolveWithLookupQueries } from "@/core/enrich/search/searchUtils";
import { fetchCoverFromCoverProject } from "@/providers/coverproject/resolver";
import { createRawgResolver } from "./resolver";
import { teardownMetadataWhen } from "@/core/catalog/teardownHelpers";
import { defineProvider } from "@/providers/shared/defineProvider";
import { isRawgQuotaBlocked } from "./quota";

const fetchFromRawg = createRawgResolver({
  formatScore,
  fetchCoverFromCoverProject,
});

export const rawgModule = defineProvider({
  info: {
    id: "rawg",
    label: "RAWG",
    minRequestIntervalMs: 250,
    // Screenshot-style art (not a real box cover), so its covers rank lowest.
    coverUrlHost: "rawg.io",
    types: ["games"],
    requiresTitleAlignment: true,
    capabilities: [
      "identify",
      "rating",
      "description",
      "cover",
      "screenshots",
      "releaseDate",
      "duration",
    ],
    auth: { kind: "key", env: ["RAWG_API_KEY"], free: true },
    supplyMode: "api_live",
    canonical: true,
    defaultLanguage: "en",
    websiteUrl: "https://rawg.io/",
    apiKeyDashboardUrl: "https://rawg.io/apikeys",
  },
  evidence: {
    label: "RAWG",
    sourceWeight: 0.42,
    canonical: true,
    cleanCachedNames: true,
  },
  isMetadataQuotaBlocked: isRawgQuotaBlocked,
  createMetadataAdapter() {
    return {
      id: "rawg",
      async resolve({ name, lookupQueries, platform }) {
        return resolveWithLookupQueries(lookupQueries, name, (query) =>
          fetchFromRawg(query, platform),
        );
      },
    } satisfies MetadataProviderAdapter;
  },
  healthCheck: createKeyHealthCheck(
    "rawg",
    "RAWG",
    ["RAWG_API_KEY"],
    (key) => `https://api.rawg.io/api/platforms?key=${key}`,
  ),
  metadataSearch: (query) => fetchFromRawg(query),
  buildTeardownMetadataTasks(ctx) {
    return teardownMetadataWhen(
      ctx,
      "RAWG",
      () => fetchFromRawg(ctx.name),
      "games",
    );
  },
  mappingProbe: {
    sampleInput: "Hades",
    context: { name: "Hades" },
  },
  collectMappingRawKeys: async () => {
    const key = process.env.RAWG_API_KEY;
    if (!key) return [];
    try {
      const res = await httpGet<{ results?: JsonObject[] }>(
        "https://api.rawg.io/api/games",
        {
          params: { search: "Hades", key },
          timeout: 8000,
        },
      );
      return Object.keys(res.data?.results?.[0] || {});
    } catch {
      return [];
    }
  },
});

export { createRawgResolver } from "./resolver";
