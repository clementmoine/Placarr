import { metadataProbe, probeErrorResult } from "@/lib/dev/mappingProbe";
import {
  collectObjectMappingSignals,
  mergeMappingSignalSets,
} from "@/lib/dev/scrapeMappingSignals";
import { probeContextOrDefault } from "@/lib/dev/mappingRawKeys";
import { createMetadataHealthCheck, pingUrl } from "@/core/catalog/healthUtils";
import { pricedOffers } from "@/core/catalog/priceOffers";
import { teardownMetadataWhen } from "@/core/catalog/teardownHelpers";
import { providerProductUrlsForKey } from "@/core/commerce/pricing/providerProductUrls";
import { retailerProductUrlBarcodeConflicts } from "@/core/commerce/retailer/productUrl";

import type { MetadataResult } from "@/types/metadataProvider";
import type {
  BarcodeLookupType,
  BarcodePriceRefreshContext,
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
  productUrl?: string;
};

/** Slim barcode hit — keep URL + price so scan offers can pin external links. */
export type ScrapeCatalogBarcodeHit = {
  title: string;
  imageUrl?: string | null;
  productUrl?: string | null;
  priceCents?: number | null;
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
  fetchBarcodeProduct: (
    config: T,
    barcode: string,
  ) => Promise<ScrapeCatalogBarcodeHit | null>;
  /** Optional URL-first price refresh (e.g. Shopify `/products/{handle}`). */
  fetchProductByUrl?: (
    config: T,
    productUrl: string,
    barcode?: string | null,
  ) => Promise<ScrapeCatalogProduct | null>;
};

function moduleSupportsShelfType(
  types: readonly string[],
  shelfType: string,
): boolean {
  return types.includes(shelfType as MediaType);
}

function offersFromPricedProduct(
  label: string,
  product: {
    title?: string | null;
    priceCents?: number | null;
    productUrl?: string | null;
  },
  rawValue: unknown,
) {
  if (product.priceCents == null || product.priceCents <= 0) return [];
  return pricedOffers(label, [
    {
      condition: "new",
      priceCents: product.priceCents,
      rawValue,
      extra: {
        productName: product.title ?? undefined,
        sourceUrl: product.productUrl ?? undefined,
        totalCents: product.priceCents,
      },
    },
  ]);
}

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

    async function refreshCatalogOffers(
      ctx: BarcodePriceRefreshContext,
    ): Promise<ReturnType<typeof pricedOffers>> {
      if (!moduleSupportsShelfType(config.types, ctx.shelfType)) return [];

      const pinnedUrls = providerProductUrlsForKey(
        config.id,
        ctx.providerProductUrls,
      ).filter(
        (url) =>
          !ctx.cleanedBarcode ||
          !retailerProductUrlBarcodeConflicts(url, ctx.cleanedBarcode),
      );

      if (deps.fetchProductByUrl) {
        for (const productUrl of pinnedUrls) {
          const product = await deps.fetchProductByUrl(
            config,
            productUrl,
            ctx.cleanedBarcode,
          );
          const offers = offersFromPricedProduct(
            config.label,
            {
              title: product?.title,
              priceCents: product?.priceCents,
              productUrl: product?.productUrl || productUrl,
            },
            product,
          );
          if (offers.length > 0) return offers;
        }
      }

      if (ctx.cleanedBarcode) {
        const hit = await deps.fetchBarcodeProduct(config, ctx.cleanedBarcode);
        return offersFromPricedProduct(config.label, hit ?? {}, hit);
      }

      return [];
    }

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
      extractScanPriceOffers(payload, shelfType) {
        if (!moduleSupportsShelfType(config.types, shelfType)) return [];
        const hit = payload.retailers.find(
          (retailer) => retailer.providerId === config.id,
        );
        return offersFromPricedProduct(config.label, hit ?? {}, hit);
      },
      refreshBarcodePriceOffers: refreshCatalogOffers,
    };
  };
}
