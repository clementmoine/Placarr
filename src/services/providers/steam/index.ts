import axios from "axios";

import {
  createMetadataHealthCheck,
  fetchWithTimeout,
} from "@/lib/providerHealthUtils";
import { fetchFromSteam } from "./fetch";

import type { ProviderModule } from "@/types/providerModule";
import type { MetadataResult } from "@/types/metadataProvider";
import { teardownMetadataWhen } from "@/lib/providerTeardownHelpers";

export { fetchFromSteam } from "./fetch";

export const steamModule: ProviderModule = {
  info: {
    id: "steam",
    label: "Steam",
    types: ["games"],
    capabilities: [
      "identify",
      "rating",
      "ageRating",
      "description",
      "cover",
      "screenshots",
      "releaseDate",
    ],
    auth: { kind: "none" },
    canonical: true,
    // PC capsule/header art, not the physical console box being scanned.
    digitalStorefrontArt: true,
    notes: "Jeux PC uniquement (store API).",
  },
  createMetadataAdapter: () => ({
    id: "steam",
    async resolve({ name, includePcSources }: any) {
      if (!includePcSources) return null;
      return (await fetchFromSteam(name)) as MetadataResult | null;
    },
  }),
  healthCheck: createMetadataHealthCheck("steam", "Steam", async () => {
    const start = Date.now();
    try {
      await fetchWithTimeout(
        axios.get("https://store.steampowered.com/api/storesearch/", {
          params: { term: "Hades", cc: "fr", l: "french" },
          timeout: 4000,
        }),
      );
      return {
        ok: true,
        latency: Date.now() - start,
        error: null,
      };
    } catch (error: unknown) {
      return {
        ok: false,
        latency: Date.now() - start,
        error:
          error instanceof Error ? error.message : "Steam Store unreachable",
      };
    }
  }),
  testHandlers: {
    "steam-metadata": {
      label: "Steam - Metadata",
      kind: "metadata",
      run: (query) => fetchFromSteam(query),
    },
  },
  buildTeardownMetadataTasks(ctx) {
    return teardownMetadataWhen(
      ctx,
      "Steam",
      () => fetchFromSteam(ctx.name),
      "games",
      { platformPattern: /\b(pc|windows|steam)\b/i },
    );
  },
  mappingProbe: {
    sampleInput: "Hades",
    context: { name: "Hades", includePcSources: true },
  },
  collectMappingRawKeys: async () => {
    try {
      const search = await axios.get(
        "https://store.steampowered.com/api/storesearch/",
        {
          params: { term: "Hades", cc: "fr", l: "french" },
          timeout: 8000,
        },
      );
      const id = search.data?.items?.[0]?.id;
      if (!id) return Object.keys(search.data?.items?.[0] || {});
      const details = await axios.get(
        "https://store.steampowered.com/api/appdetails",
        {
          params: { appids: id, cc: "fr", l: "french" },
          timeout: 8000,
        },
      );
      return Object.keys(details.data?.[String(id)]?.data || {});
    } catch {
      return [];
    }
  },
};
