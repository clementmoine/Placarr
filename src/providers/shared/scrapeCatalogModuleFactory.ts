import { metadataProbe, probeErrorResult } from "@/lib/dev/mappingProbe";
import {
  collectObjectMappingSignals,
  mergeMappingSignalSets,
} from "@/lib/dev/scrapeMappingSignals";
import { probeContextOrDefault } from "@/lib/dev/mappingRawKeys";
import { createMetadataHealthCheck, pingUrl } from "@/core/catalog/healthUtils";
import { teardownMetadataWhen } from "@/core/catalog/teardownHelpers";

import type { MetadataResult } from "@/types/metadataProvider";
import type {
  BarcodeLookupType,
  MetadataAdapterContext,
  MetadataProviderAdapter,
  ProviderModule,
} from "@/types/providerModule";
import type {
  Capability,
  MediaType,
  ProviderInfo,
} from "@/types/providerRegistry";

/** Optional metadata traits merged into `ProviderModule.info` at factory build time. */
export type ScrapeCatalogMetadataInfo = Partial<
  Pick<
    ProviderInfo,
    | "defaultLanguage"
    | "isRealBoxCover"
    | "imageScoreAdjustment"
    | "remoteImageFallback"
    | "isSecondary"
    | "retailCatalogImageTitles"
    | "strictShelfPlatformCover"
    | "coverDefaultRegion"
  >
>;

export type ScrapeCatalogRetailerConfig = {
  id: string;
  label: string;
  baseUrl: string;
  types: MediaType[];
  barcodeTypes?: BarcodeLookupType[];
  capabilities?: Capability[];
  sample?: { name: string; barcode: string };
  metadataInfo?: ScrapeCatalogMetadataInfo;
  mappingProbeConfigHint?: string;
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

export function createScrapeCatalogModule<
  T extends ScrapeCatalogRetailerConfig,
>(deps: ScrapeCatalogModuleFactoryDeps<T>) {
  return function buildModule(config: T): ProviderModule {
    const resolver = deps.createResolver(config);
    const barcodeTypes: BarcodeLookupType[] = config.barcodeTypes ?? [
      ...config.types,
      "generic",
    ];
    const sample = config.sample ?? deps.defaultSample;
    const capabilities = config.capabilities ?? deps.defaultCapabilities;
    const boardGameShopDefaults: ScrapeCatalogMetadataInfo | undefined =
      config.types.length === 1 && config.types[0] === "boardgames"
        ? {
            defaultLanguage: "fr",
            isRealBoxCover: true,
            isSecondary: true,
          }
        : undefined;

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
        ...(config.mappingProbeConfigHint
          ? { mappingProbeConfigHint: config.mappingProbeConfigHint }
          : {}),
        ...boardGameShopDefaults,
        ...config.metadataInfo,
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
        try {
          const metadata = await resolver({
            name: sample.name,
            barcode: sample.barcode,
          });
          if (metadata) return metadataProbe(metadata);

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
        } catch (error) {
          const { PrestashopAccessDeniedError } = await import(
            "@/providers/prestashop/fetch"
          );
          if (error instanceof PrestashopAccessDeniedError) {
            return probeErrorResult(error.message, "blocked");
          }
          throw error;
        }
      },
      collectMappingRawKeys: async (context) => {
        const ctx = probeContextOrDefault(context, {
          name: sample.name,
          barcode: sample.barcode,
        });
        const product = await deps.searchProduct(
          config,
          ctx.name,
          ctx.barcode || sample.barcode,
        );
        let rawSearch: unknown = product;
        try {
          const barcodeHit = await deps.fetchBarcodeProduct(
            config,
            ctx.barcode || sample.barcode,
          );
          if (barcodeHit && typeof barcodeHit === "object") {
            rawSearch = barcodeHit;
          }
        } catch {
          // Search payload alone is enough for the audit.
        }
        return mergeMappingSignalSets(
          collectObjectMappingSignals(product),
          collectObjectMappingSignals(rawSearch),
        );
      },
    };
  };
}
