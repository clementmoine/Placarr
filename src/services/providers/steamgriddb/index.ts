import {
  createMetadataHealthCheck,
  createUnconfiguredHealthCheck,
} from "@/lib/providerHealthUtils";
import { fetchFromSteamGridDB, pingSteamGridDB } from "./fetch";

import type { ProviderModule } from "@/types/providerModule";
import type { MetadataResult } from "@/types/metadataProvider";
import { teardownMetadataWhen } from "@/lib/providerTeardownHelpers";

export { fetchFromSteamGridDB, pingSteamGridDB } from "./fetch";

export const steamgriddbModule: ProviderModule = {
  info: {
    id: "steamgriddb",
    label: "SteamGridDB",
    types: ["games"],
    capabilities: ["cover"],
    auth: { kind: "key", env: ["STEAMGRIDDB_API_KEY"], free: true },
    canonical: true,
    notes: "Artworks communautaires ; grille verticale = format boîte.",
  },
  createMetadataAdapter: () => ({
    id: "steamgriddb",
    async resolve({ name }) {
      return (await fetchFromSteamGridDB(name)) as MetadataResult | null;
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
};
