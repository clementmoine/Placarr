import { metadataProbe } from "@/lib/mappingProbeUtils";
import { createMetadataHealthCheck, pingUrl } from "@/lib/providerHealthUtils";
import { teardownMetadataWhen } from "@/lib/providerTeardownHelpers";

import type { MetadataResult } from "@/types/metadataProvider";
import type {
  BarcodeLookupType,
  MetadataProviderAdapter,
  ProviderModule,
} from "@/types/providerModule";

import {
  fetchPrestashopBarcodeProduct,
  searchPrestashopProduct,
} from "./fetch";
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
  // The connector is type-agnostic: the shop declares its types. "generic" is
  // appended so typeless home-page scans still reach it (parity).
  const barcodeTypes: BarcodeLookupType[] = config.barcodeTypes ?? [
    ...config.types,
    "generic",
  ];
  const sample = config.sample ?? {
    name: "Catan",
    barcode: "3558380126133",
  };

  return {
    info: {
      id: config.id,
      label: config.label,
      types: config.types,
      capabilities: config.capabilities ?? [
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
      sourceWeight: 0.24,
      trustedRetailer: true,
    },
    createMetadataAdapter() {
      return {
        id: config.id,
        async resolve({ name, barcode }: any) {
          return resolver(name, barcode);
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
    buildBarcodeTasks(_deps, type, { barcode }) {
      if (!barcodeTypes.includes(type)) {
        return {} as Record<string, Promise<unknown>>;
      }
      return {
        [config.id]: fetchPrestashopBarcodeProduct(config, barcode),
      };
    },
    buildTeardownMetadataTasks(ctx) {
      return config.types.flatMap((mediaType) =>
        teardownMetadataWhen(
          ctx,
          config.label,
          () => resolver(ctx.name, ctx.barcode),
          mediaType,
        ),
      );
    },
    mappingProbe: {
      sampleInput: sample.barcode,
      context: { name: sample.name, barcode: sample.barcode },
    },
    runMappingProbe: async () => {
      const product = await searchPrestashopProduct(
        config,
        sample.name,
        sample.barcode,
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
          ? [
              {
                kind: "price",
                label: "Prix",
                value: String(product.priceCents),
              },
            ]
          : undefined,
      });
    },
  };
}
