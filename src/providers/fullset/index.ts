import { metadataProbe } from "@/lib/dev/mappingProbe";
import {
  mappingRawKeysFromFetch,
  probeContextOrDefault,
} from "@/lib/dev/mappingRawKeys";
import { teardownMetadataWhen } from "@/core/catalog/teardownHelpers";
import { defineProvider } from "@/providers/shared/defineProvider";
import type {
  MetadataAdapterContext,
  MetadataProviderAdapter,
} from "@/types/providerModule";

import { fetchFullSetItem, searchFullSet } from "./fetch";
import { createFullSetResolver, mapFullSetMetadata } from "./resolver";

const fetchFromFullSet = createFullSetResolver();

export const fullsetModule = defineProvider({
  info: {
    id: "fullset",
    label: "Full Set",
    types: ["games", "hardware"],
    capabilities: ["identify", "price", "releaseDate"],
    auth: { kind: "scrape" },
    supplyMode: "scrape_cache",
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
  metadataSearch: (query) => fetchFromFullSet({ name: query, type: "games" }),
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
});

export { createFullSetResolver, fetchFullSetItem, searchFullSet };
