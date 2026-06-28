import axios from "axios";

import { createKeyHealthCheck } from "@/lib/provider/healthUtils";

import type { ProviderModule } from "@/types/providerModule";
import type { MetadataProviderAdapter } from "@/types/providerModule";
import { formatScore } from "@/services/metadata/searchUtils";
import { resolveWithLookupQueries } from "@/services/metadata/searchUtils";
import { fetchCoverFromCoverProject } from "@/services/providers/coverproject/resolver";
import { createRawgResolver } from "./resolver";
import { teardownMetadataWhen } from "@/lib/provider/teardownHelpers";
import { isRawgQuotaBlocked } from "./quota";

const fetchFromRawg = createRawgResolver({
  formatScore,
  fetchCoverFromCoverProject,
});
import type { MetadataResult } from "@/types/metadataProvider";

type NameResolver = (name: string) => Promise<MetadataResult | null>;

export const rawgModule: ProviderModule = {
  info: {
    id: "rawg",
    label: "RAWG",
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
    canonical: true,
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
      async resolve({ name, lookupQueries }) {
        return resolveWithLookupQueries(lookupQueries, name, (query) =>
          fetchFromRawg(query),
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
  testHandlers: {
    "rawg-metadata": {
      label: "RAWG - Metadata",
      kind: "metadata",
      run: (query) => fetchFromRawg(query),
    },
  },
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
      const res = await axios.get("https://api.rawg.io/api/games", {
        params: { search: "Hades", key },
        timeout: 8000,
      });
      return Object.keys(res.data?.results?.[0] || {});
    } catch {
      return [];
    }
  },
};

export { createRawgResolver } from "./resolver";
