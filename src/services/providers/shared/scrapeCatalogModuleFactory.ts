import { metadataProbe } from "@/lib/dev/mappingProbe";
import { createMetadataHealthCheck, pingUrl } from "@/lib/provider/healthUtils";
import { teardownMetadataWhen } from "@/lib/provider/teardownHelpers";

import type { MetadataResult } from "@/types/metadataProvider";
import type {
  BarcodeLookupType,
  MetadataAdapterContext,
  MetadataProviderAdapter,
  ProviderModule,
} from "@/types/providerModule";
import type { Capability, MediaType } from "@/types/providerRegistry";

export type ScrapeCatalogRetailerConfig = {
  id: string;
  label: string;
  baseUrl: string;
  types: MediaType[];
  barcodeTypes?: BarcodeLookupType[];
  capabilities?: Capability[];
  sample?: { name: string; barcode: string };
};

export type ScrapeCatalogProduct = {
  title: string;
  description?: string;
  imageUrl?: string;
  barcode?: string;
  priceCents?: number;
};

type CatalogResolver = (
  ctx: MetadataAdapterContext,
) => Promise<MetadataResult | null>;

export type ScrapeCatalogModuleFactoryDeps<
  T extends ScrapeCatalogRetailerConfig,
> = {
  platformLabel: string;
  defaultCapabilities: Capability[];
  defaultSample: { name: string; barcode: string };
  createResolver: (config: T) => CatalogResolver;
  searchProduct: (
    config: T,
    name: string,
    barcode: string,
  ) => Promise<ScrapeCatalogProduct | null>;
  fetchBarcodeProduct: (config: T, barcode: string) => Promise<unknown>;
};

export function createScrapeCatalogModule<T extends ScrapeCatalogRetailerConfig>(
  deps: ScrapeCatalogModuleFactoryDeps<T>,
) {
  return function buildModule(config: T): ProviderModule {
    const resolver = deps.createResolver(config);
    const barcodeTypes: BarcodeLookupType[] = config.barcodeTypes ?? [
      ...config.types,
      "generic",
    ];
    const sample = config.sample ?? deps.defaultSample;
    const capabilities = config.capabilities ?? deps.defaultCapabilities;

    return {
      info: {
        id: config.id,
        label: config.label,
        types: config.types,
        capabilities,
        auth: { kind: "scrape" },
        canonical: false,
        websiteUrl: config.baseUrl,
        notes: `Recherche ${deps.platformLabel} par EAN (${config.label}).`,
      },
      evidence: {
        label: config.label,
        sourceWeight: 0.24,
        trustedRetailer: true,
      },
      createMetadataAdapter() {
        return {
          id: config.id,
          async resolve(ctx: MetadataAdapterContext) {
            return resolver(ctx);
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
          run: (query) => resolver({ name: query }),
        },
        [`${config.id}-barcode`]: {
          label: `${config.label} - Barcode`,
          kind: "metadata-barcode",
          run: (query) => resolver({ name: "", barcode: query }),
        },
      },
      buildBarcodeTasks(_deps, type, { barcode }) {
        if (!barcodeTypes.includes(type)) {
          return {} as Record<string, Promise<unknown>>;
        }
        return {
          [config.id]: deps.fetchBarcodeProduct(config, barcode),
        };
      },
      buildTeardownMetadataTasks(ctx) {
        return config.types.flatMap((mediaType) =>
          teardownMetadataWhen(
            ctx,
            config.label,
            () => resolver(ctx),
            mediaType,
          ),
        );
      },
      mappingProbe: {
        sampleInput: sample.barcode,
        context: { name: sample.name, barcode: sample.barcode },
      },
      runMappingProbe: async () => {
        const product = await deps.searchProduct(
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
  };
}
