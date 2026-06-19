import { metadataProbe } from "@/lib/mappingProbeUtils";
import {
  createMetadataHealthCheck,
  pingUrl,
} from "@/lib/providerHealthUtils";
import { teardownMetadataWhen } from "@/lib/providerTeardownHelpers";

import type { MetadataResult } from "@/types/metadataProvider";
import type { MetadataProviderAdapter, ProviderModule } from "@/types/providerModule";

import { searchPrestashopProduct } from "./fetch";
import { createPrestashopResolver } from "./resolver";

import type { PrestashopRetailerConfig } from "./types";

type Resolver = (
  name: string,
  barcode?: string | null,
) => Promise<MetadataResult | null>;

const RESOLVER_DEP_KEYS: Record<string, string> = {
  monsieurde: "fetchFromMonsieurde",
  ludifolie: "fetchFromLudifolie",
  bcdjeux: "fetchFromBcdjeux",
  lepassetemps: "fetchFromLepassetemps",
};

export function createPrestashopModule(
  config: PrestashopRetailerConfig,
): ProviderModule {
  const resolver = createPrestashopResolver(config);
  const depKey = RESOLVER_DEP_KEYS[config.id] || `fetchFrom${config.id}`;

  return {
    info: {
      id: config.id,
      label: config.label,
      types: ["boardgames"],
      capabilities: [
        "identify",
        "description",
        "cover",
        "price",
        "ageRating",
        "duration",
        "players",
        "people",
        "releaseDate",
      ],
      auth: { kind: "scrape" },
      canonical: false,
      notes: `Recherche PrestaShop AJAX (${config.label}).`,
    },
    evidence: {
      label: config.label,
      sourceWeight: 0.12,
    },
    createMetadataAdapter(deps) {
      const fetch = (deps as Record<string, unknown>)[depKey] as
        | Resolver
        | undefined;
      const resolve = fetch || resolver;
      return {
        id: config.id,
        async resolve({ name, barcode }) {
          return resolve(name, barcode);
        },
      } satisfies MetadataProviderAdapter;
    },
    healthCheck: createMetadataHealthCheck(
      config.id,
      config.label,
      async () => {
        const start = Date.now();
        const isUp = await pingUrl(config.baseUrl);
        return {
          ok: isUp,
          latency: Date.now() - start,
          error: isUp ? null : "Host unreachable",
        };
      },
    ),
    testHandlers: {
      [`${config.id}-metadata`]: {
        label: `${config.label} - Metadata`,
        kind: "metadata",
        run: (query) => resolver(query),
      },
      [`${config.id}-barcode`]: {
        label: `${config.label} - Barcode`,
        kind: "metadata-barcode",
        run: (query) => resolver("", query),
      },
    },
    buildTeardownMetadataTasks(ctx) {
      return teardownMetadataWhen(
        ctx,
        config.label,
        () => resolver(ctx.name, ctx.barcode),
        "boardgames",
      );
    },
    mappingProbe: {
      sampleInput: "3558380126133",
      context: { name: "Catan", barcode: "3558380126133" },
    },
    runMappingProbe: async () => {
      const product = await searchPrestashopProduct(
        config,
        "Catan",
        "3558380126133",
      );
      if (!product) {
        return {
          rawKeys: [],
          mappedKeys: [],
          unusedKeys: [],
          attachmentsCount: 0,
          factsCount: 0,
          example: null,
          statusHint: "empty",
          reason: `Aucun produit ${config.label} trouvé`,
        };
      }
      return metadataProbe({
        title: product.title,
        description: product.description,
        imageUrl: product.imageUrl,
        barcode: product.barcode,
        facts: product.priceCents
          ? [{ kind: "price", label: "Prix", value: String(product.priceCents) }]
          : undefined,
      });
    },
  };
}
