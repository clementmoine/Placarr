import {
  createMetadataHealthCheck,
  createUnconfiguredHealthCheck,
} from "@/lib/provider/healthUtils";
import { fetchFromIGDB, pingIGDB } from "./fetch";
import { getIGDBDatabaseSuggestions } from "./suggestions";
import { resolveWithLookupQueries } from "@/services/metadata/searchUtils";

import type { ProviderModule } from "@/types/providerModule";
import type { MetadataResult } from "@/types/metadataProvider";
import { teardownMetadataWhen } from "@/lib/provider/teardownHelpers";

export { fetchFromIGDB, getIGDBSuggestions, pingIGDB } from "./fetch";

export const igdbModule: ProviderModule = {
  info: {
    id: "igdb",
    label: "IGDB",
    types: ["games"],
    nameDatabase: true,
    requiresTitleAlignment: true,
    capabilities: [
      "identify",
      "description",
      "rating",
      "ageRating",
      "cover",
      "screenshots",
      "releaseDate",
      "duration",
      "people",
    ],
    auth: {
      kind: "key",
      env: ["IGDB_CLIENT_ID", "IGDB_CLIENT_SECRET"],
      free: true,
    },
    canonical: true,
    websiteUrl: "https://www.igdb.com/",
    apiKeyDashboardUrl: "https://dev.twitch.tv/console/apps",
  },
  evidence: {
    label: "IGDB",
    sourceWeight: 0.45,
    canonical: true,
  },
  createMetadataAdapter: () => ({
    id: "igdb",
    async resolve({ name, platform, lookupQueries }) {
      return resolveWithLookupQueries(lookupQueries, name, (query) =>
        fetchFromIGDB(query, platform),
      ) as Promise<MetadataResult | null>;
    },
  }),
  suggestDatabaseTitles: ({ name, cleanedName, platform }) =>
    getIGDBDatabaseSuggestions(name, cleanedName, platform),
  healthCheck: (() => {
    const clientId = process.env.IGDB_CLIENT_ID?.trim();
    const clientSecret = process.env.IGDB_CLIENT_SECRET?.trim();
    if (!clientId || !clientSecret) {
      return createUnconfiguredHealthCheck(
        "igdb",
        "IGDB",
        "IGDB_CLIENT_ID / IGDB_CLIENT_SECRET missing",
      );
    }
    return createMetadataHealthCheck("igdb", "IGDB", async () => {
      const result = await pingIGDB();
      return {
        ok: result.ok,
        latency: result.latency,
        error: result.error ?? null,
      };
    });
  })(),
  testHandlers: {
    "igdb-metadata": {
      label: "IGDB - Metadata",
      kind: "metadata",
      run: (query) => fetchFromIGDB(query),
    },
  },
  buildTeardownMetadataTasks(ctx) {
    return teardownMetadataWhen(
      ctx,
      "IGDB",
      () => fetchFromIGDB(ctx.name, ctx.platform),
      "games",
    );
  },
  mappingProbe: {
    sampleInput: "Hades",
    context: { name: "Hades" },
  },
};
