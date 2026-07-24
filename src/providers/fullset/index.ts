import { metadataProbe } from "@/lib/dev/mappingProbe";
import {
  mappingRawKeysFromFetch,
  probeContextOrDefault,
} from "@/lib/dev/mappingRawKeys";
import { createMetadataHealthCheck, pingUrl } from "@/core/catalog/healthUtils";
import { teardownMetadataWhen } from "@/core/catalog/teardownHelpers";
import type {
  MetadataAdapterContext,
  MetadataProviderAdapter,
  ProviderModule,
} from "@/types/providerModule";

import { fetchFullSetItem, searchFullSet } from "./fetch";
import { createFullSetResolver, mapFullSetMetadata } from "./resolver";

const fetchFromFullSet = createFullSetResolver();

export const fullsetModule: ProviderModule = {
  info: {
    id: "fullset",
    label: "Full Set",
    types: ["games", "hardware"],
    capabilities: ["identify", "price", "releaseDate"],
    auth: { kind: "scrape" },
    canonical: false,
    defaultLanguage: "fr",
    // Search is title-based over a collector index: results are validated
    // against the requested title (and platform) before merge.
    requiresTitleAlignment: true,
    // full-set.net returns 429 on rapid successive requests.
    rateLimited: true,
    mappingProbeRetry: true,
    websiteUrl: "https://full-set.net/",
    notes:
      "Full sets rétro FR : jeux + consoles/accessoires (cote médiane eBay, rareté). Pas d'EAN ni de jaquette propre — facts uniquement.",
  },
  evidence: {
    label: "Full Set",
    sourceWeight: 0.2,
  },
  createMetadataAdapter() {
    return {
      id: "fullset",
      async resolve(ctx: MetadataAdapterContext) {
        return fetchFromFullSet(ctx);
      },
    } satisfies MetadataProviderAdapter;
  },
  healthCheck: createMetadataHealthCheck("fullset", "Full Set", async () => {
    const start = Date.now();
    const isUp = await pingUrl("https://full-set.net/");
    return {
      ok: isUp,
      latency: Date.now() - start,
      error: isUp ? null : "Host unreachable",
    };
  }),
  testHandlers: {
    "fullset-metadata": {
      label: "Full Set - Metadata",
      kind: "metadata",
      run: (query) => fetchFromFullSet({ name: query, type: "games" }),
    },
  },
  buildTeardownMetadataTasks(ctx) {
    return [
      ...teardownMetadataWhen(
        ctx,
        "Full Set",
        () => fetchFromFullSet(ctx),
        "games",
      ),
      ...teardownMetadataWhen(
        ctx,
        "Full Set",
        () => fetchFromFullSet(ctx),
        "hardware",
      ),
    ];
  },
  mappingProbe: {
    sampleInput: "Rayman",
    context: { name: "Rayman" },
  },
  runMappingProbe: async () => {
    const hits = await searchFullSet("Rayman", { limit: 1 });
    const hit = hits[0];
    if (!hit) {
      return {
        rawKeys: [],
        mappedKeys: [],
        unusedKeys: [],
        attachmentsCount: 0,
        factsCount: 0,
        example: null,
        statusHint: "empty",
        reason: "Aucune fiche Full Set trouvée",
      };
    }
    const item = await fetchFullSetItem(hit.url);
    if (!item) {
      return {
        rawKeys: [],
        mappedKeys: [],
        unusedKeys: [],
        attachmentsCount: 0,
        factsCount: 0,
        example: null,
        statusHint: "empty",
        reason: `Fiche Full Set illisible: ${hit.url}`,
      };
    }
    return metadataProbe(mapFullSetMetadata(item));
  },
  collectMappingRawKeys: async (context) => {
    const ctx = probeContextOrDefault(context, { name: "Rayman" });
    const hits = await searchFullSet(ctx.name, { limit: 1 });
    const hit = hits[0];
    if (!hit) return [];
    return mappingRawKeysFromFetch(() => fetchFullSetItem(hit.url));
  },
};

export { createFullSetResolver, fetchFullSetItem, searchFullSet };
