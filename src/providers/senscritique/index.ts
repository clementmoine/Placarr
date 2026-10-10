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

import { fetchSensCritiqueProduct, searchSensCritique } from "./fetch";
import {
  createSensCritiqueResolver,
  mapSensCritiqueMetadata,
} from "./resolver";

const fetchFromSensCritique = createSensCritiqueResolver();

export const senscritiqueModule = defineProvider({
  info: {
    id: "senscritique",
    label: "SensCritique",
    types: ["games", "books", "movies", "musics"],
    capabilities: [
      "identify",
      "description",
      "cover",
      "rating",
      "releaseDate",
      "screenshots",
    ],
    auth: { kind: "scrape" },
    supplyMode: "scrape_cache",
    canonical: false,
    defaultLanguage: "fr",
    isRealBoxCover: true,
    coverUrlHost: "media.senscritique.com",
    coverProvenanceRules: {
      catalog: ["media.senscritique.com"],
    },
    // GraphQL search is very fuzzy (a query can rank an unrelated franchise
    // first): results are validated against the requested title before merge.
    requiresTitleAlignment: true,
    websiteUrl: "https://www.senscritique.com/",
    notes:
      "Communauté FR multi-univers (GraphQL non officiel) : note + votes, synopsis FR, jaquettes. Games, books/comics, movies/TV, albums. Pas d'EAN — name-search uniquement.",
  },
  evidence: {
    label: "SensCritique",
    sourceWeight: 0.24,
  },
  createMetadataAdapter() {
    return {
      id: "senscritique",
      async resolve(ctx: MetadataAdapterContext) {
        return fetchFromSensCritique(ctx);
      },
    } satisfies MetadataProviderAdapter;
  },
  // Ping GraphQL (pas le site marketing) — défaut healthCheck via healthCheckUrl.
  healthCheckUrl:
    "https://gql.senscritique.com/graphql?query=%7B__typename%7D",
  metadataSearch: (query) =>
    fetchFromSensCritique({ name: query, type: "games" }),
  buildTeardownMetadataTasks(ctx) {
    return [
      ...teardownMetadataWhen(
        ctx,
        "SensCritique",
        () => fetchFromSensCritique(ctx),
        "games",
      ),
      ...teardownMetadataWhen(
        ctx,
        "SensCritique",
        () => fetchFromSensCritique(ctx),
        "books",
      ),
      ...teardownMetadataWhen(
        ctx,
        "SensCritique",
        () => fetchFromSensCritique(ctx),
        "movies",
      ),
      ...teardownMetadataWhen(
        ctx,
        "SensCritique",
        () => fetchFromSensCritique(ctx),
        "musics",
      ),
    ];
  },
  mappingProbe: {
    sampleInput: "Rayman",
    context: { name: "Rayman", type: "games" },
  },
  runMappingProbe: async () => {
    const hits = await searchSensCritique("Rayman", {
      universe: "game",
      limit: 1,
    });
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
        reason: "Aucun produit SensCritique trouvé",
      };
    }
    const product = await fetchSensCritiqueProduct(hit.id);
    if (!product) {
      return {
        rawKeys: [],
        mappedKeys: [],
        unusedKeys: [],
        attachmentsCount: 0,
        factsCount: 0,
        example: null,
        statusHint: "empty",
        reason: `Fiche SensCritique ${hit.id} introuvable`,
      };
    }
    return metadataProbe(mapSensCritiqueMetadata(product));
  },
  collectMappingRawKeys: async (context) => {
    const ctx = probeContextOrDefault(context, {
      name: "Rayman",
      type: "games",
    });
    const hits = await searchSensCritique(ctx.name || "Rayman", {
      universe: "game",
      limit: 1,
    });
    const hit = hits[0];
    if (!hit) return [];
    return mappingRawKeysFromFetch(() => fetchSensCritiqueProduct(hit.id));
  },
});

export {
  createSensCritiqueResolver,
  fetchSensCritiqueProduct,
  searchSensCritique,
};
