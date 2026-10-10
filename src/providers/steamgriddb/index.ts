import {
  createMetadataHealthCheck,
  createUnconfiguredHealthCheck,
} from "@/core/catalog/healthUtils";
import { fetchFromSteamGridDB, pingSteamGridDB } from "./fetch";
import {
  mappingRawKeysFromFetch,
  probeContextOrDefault,
} from "@/lib/dev/mappingRawKeys";
import { defineProvider } from "@/providers/shared/defineProvider";

import type { MetadataResult } from "@/types/metadataProvider";
import { teardownMetadataWhen } from "@/core/catalog/teardownHelpers";

export { fetchFromSteamGridDB, pingSteamGridDB } from "./fetch";

export const steamgriddbModule = defineProvider({
  info: {
    id: "steamgriddb",
    label: "SteamGridDB",
    types: ["games"],
    capabilities: ["cover"],
    auth: { kind: "key", env: ["STEAMGRIDDB_API_KEY"], free: true },
    supplyMode: "api_live",
    canonical: true,
    authoritative3dCoverRole: true,
    gridStyleCoverLabels: true,
    requiresTitleAlignment: true,
    platformAgnosticMetadata: true,
    websiteUrl: "https://www.steamgriddb.com/",
    notes: "Artworks communautaires ; grille verticale = format boîte.",
  },
  createMetadataAdapter: () => ({
    id: "steamgriddb",
    async resolve({ name, platform, shelfName }) {
      return (await fetchFromSteamGridDB(name, {
        platform,
        shelfName,
      })) as MetadataResult | null;
    },
  }),
  healthCheck: (() => {
    const key =
      process.env.STEAMGRIDDB_API_KEY?.trim() ||
      process.env.STEAM_GRID_DB_API_KEY?.trim();
    if (!key) {
      return createUnconfiguredHealthCheck(
        "steamgriddb",
        "SteamGridDB",
        "STEAMGRIDDB_API_KEY missing",
      );
    }
    return createMetadataHealthCheck("steamgriddb", "SteamGridDB", async () => {
      const result = await pingSteamGridDB();
      return {
        ok: result.ok,
        latency: result.latency,
        error: result.error ?? null,
      };
    });
  })(),
  // Label « Artwork » — pas le défaut « Metadata ».
  testHandlers: {
    "steamgriddb-metadata": {
      label: "SteamGridDB - Artwork",
      kind: "metadata",
      run: (query) => fetchFromSteamGridDB(query),
    },
  },
  buildTeardownMetadataTasks(ctx) {
    return teardownMetadataWhen(
      ctx,
      "SteamGridDB",
      () => fetchFromSteamGridDB(ctx.name),
      "games",
    );
  },
  mappingProbe: {
    sampleInput: "Hades",
    context: { name: "Hades" },
  },
  collectMappingRawKeys: async (context) => {
    const ctx = probeContextOrDefault(context, { name: "Hades" });
    return mappingRawKeysFromFetch(() => fetchFromSteamGridDB(ctx.name));
  },
});
