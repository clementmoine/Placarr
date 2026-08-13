import { createMetadataHealthCheck } from "@/core/catalog/healthUtils";
import { matchPriceSeekQueries } from "@/core/catalog/matchContext";
import { pricedOffers } from "@/core/catalog/priceOffers";
import { providerProductUrlsForKey } from "@/core/commerce/pricing/providerProductUrls";
import { metadataProbe } from "@/lib/dev/mappingProbe";
import {
  mappingRawKeysFromFetch,
  probeContextOrDefault,
} from "@/lib/dev/mappingRawKeys";
import { throwIfAborted } from "@/lib/http/abort";
import { pinnedProviderRecordUrl } from "@/providers/shared/pinnedRecord";
import type {
  MetadataAttachment,
  MetadataFact,
  MetadataResult,
} from "@/types/metadataProvider";
import type {
  BarcodePriceRefreshContext,
  MetadataProviderAdapter,
  ProviderModule,
} from "@/types/providerModule";

import {
  enrichBackMarketProductGallery,
  fetchFromBackMarket,
  fetchFromBackMarketProductUrl,
  fetchPricesFromBackMarket,
  fetchPricesFromBackMarketProductUrl,
  parseBackMarketProductUuidFromUrl,
  pingBackMarket,
  type BackMarketProduct,
} from "./fetch";

export {
  backmarketSearchUrl,
  enrichBackMarketProductGallery,
  fetchFromBackMarket,
  fetchFromBackMarketProductUrl,
  fetchPricesFromBackMarket,
  fetchPricesFromBackMarketProductUrl,
  parseBackMarketProductGallery,
  parseBackMarketProductPage,
  parseBackMarketProductUuidFromUrl,
  parseBackMarketSearchHits,
  pingBackMarket,
  type BackMarketHit,
  type BackMarketPrices,
  type BackMarketProduct,
} from "./fetch";

const PRICE_SOURCE = "Back Market";
const PROVIDER_ID = "backmarket";
const LANGUAGE = "fr";
const SAMPLE_QUERY = "Nintendo Wii Bleu";

function buildAttachments(
  product: BackMarketProduct,
): MetadataAttachment[] | undefined {
  const urls = Array.from(
    new Set(
      [...(product.imageUrls ?? []), product.coverUrl].filter(
        (url): url is string => Boolean(url?.trim()),
      ),
    ),
  );
  if (urls.length === 0) return undefined;
  return urls.map((url) => ({
    type: "cover" as const,
    url,
    title: product.title,
    role: LANGUAGE,
    source: PROVIDER_ID,
    retailCatalogImageTitlesSource: true,
  }));
}

function formatEuroCents(cents: number): string {
  return `${(cents / 100).toFixed(2).replace(".", ",")} €`;
}

export function mapBackMarketMetadata(
  product: BackMarketProduct | null,
): MetadataResult | null {
  if (!product?.title) return null;

  const uuid = parseBackMarketProductUuidFromUrl(product.sourceUrl);
  const facts: MetadataFact[] = [
    {
      kind: "external-link",
      label: "Back Market",
      value: "Voir la fiche",
      url: product.sourceUrl,
      source: PROVIDER_ID,
      confidence: 0.62,
      priority: 32,
    },
  ];

  if (product.brand?.trim()) {
    facts.push({
      kind: "brand",
      label: "Marque",
      value: product.brand.trim(),
      source: PROVIDER_ID,
      confidence: 0.7,
      priority: 28,
    });
  }

  if (product.grade?.trim()) {
    facts.push({
      kind: "condition",
      label: "État",
      value: product.grade.trim(),
      source: PROVIDER_ID,
      confidence: 0.75,
      priority: 30,
    });
  }

  if (product.category?.trim()) {
    facts.push({
      kind: "media-format",
      label: "Catégorie",
      value: product.category.trim(),
      source: PROVIDER_ID,
      confidence: 0.55,
      priority: 20,
    });
  }

  if (
    product.warrantyMonths != null &&
    Number.isFinite(product.warrantyMonths)
  ) {
    facts.push({
      kind: "warranty",
      label: "Garantie",
      value: `${product.warrantyMonths} mois`,
      source: PROVIDER_ID,
      confidence: 0.65,
      priority: 22,
    });
  }

  if (product.priceCents > 0) {
    facts.push({
      kind: "observed-price",
      label: "Back Market",
      value: formatEuroCents(product.priceCents),
      source: PROVIDER_ID,
      confidence: 0.7,
      priority: 34,
    });
  }

  return {
    title: product.title,
    imageUrl: product.imageUrls?.[0] || product.coverUrl || undefined,
    regionalTitles: [{ region: LANGUAGE, text: product.title }],
    attachments: buildAttachments(product),
    facts,
    externalIds: uuid ? { [PROVIDER_ID]: uuid } : undefined,
  };
}

async function resolveBackMarketProduct(
  ctx: Parameters<MetadataProviderAdapter["resolve"]>[0],
): Promise<BackMarketProduct | null> {
  throwIfAborted(ctx.signal);
  const shelfType = ctx.match?.shelfType || ctx.type || "hardware";
  if (shelfType !== "hardware" && shelfType !== "games") return null;

  const expectedNames = Array.from(
    new Set(
      [
        String(ctx.name || "").trim(),
        ...(ctx.lookupQueries ?? []),
        ...(ctx.fallbackNames ?? []),
        ...(ctx.match?.titles ?? []),
      ].filter(Boolean),
    ),
  );
  if (expectedNames.length === 0) return null;

  const pinned = pinnedProviderRecordUrl(ctx, PROVIDER_ID);
  if (pinned) {
    const fromUrl = await fetchFromBackMarketProductUrl(pinned, expectedNames, {
      shelfType,
      signal: ctx.signal,
    });
    if (fromUrl) {
      return enrichBackMarketProductGallery(fromUrl, { signal: ctx.signal });
    }
  }

  for (const query of expectedNames) {
    const product = await fetchFromBackMarket(query, expectedNames, {
      shelfType,
      signal: ctx.signal,
    });
    if (product) {
      return enrichBackMarketProductGallery(product, { signal: ctx.signal });
    }
  }
  return null;
}

async function refreshBackMarketOffers(ctx: BarcodePriceRefreshContext) {
  if (ctx.shelfType !== "hardware" && ctx.shelfType !== "games") return [];

  const expectedNames = Array.from(
    new Set([ctx.primaryName, ...ctx.fallbackNames].filter(Boolean)),
  );

  const fetchOpts = {
    shelfType: ctx.shelfType,
    ...(ctx.signal ? { signal: ctx.signal } : {}),
    ...(ctx.evidenceOnly ? { evidenceOnly: true } : {}),
  };

  // Price refresh carries fiche URLs as `providerProductUrls` (metadata
  // external links) — `providerRecordUrls` only exists on the adapter context.
  const pinnedUrl = providerProductUrlsForKey(
    PROVIDER_ID,
    ctx.providerProductUrls,
  )[0];
  if (pinnedUrl) {
    const pinned = await fetchPricesFromBackMarketProductUrl(
      pinnedUrl,
      expectedNames,
      fetchOpts,
    );
    if (pinned?.priceUsed != null) {
      return pricedOffers(PRICE_SOURCE, [
        {
          condition: "used",
          priceCents: pinned.priceUsed,
          rawValue: pinned,
          extra: {
            productName: pinned.productName ?? null,
            sourceUrl: pinned.sourceUrl ?? pinnedUrl,
          },
        },
      ]);
    }
  }

  for (const query of matchPriceSeekQueries(ctx)) {
    if (!query.trim()) continue;
    const result = await fetchPricesFromBackMarket(
      query,
      expectedNames,
      fetchOpts,
    );
    if (!result?.priceUsed) continue;
    return pricedOffers(PRICE_SOURCE, [
      {
        condition: "used",
        priceCents: result.priceUsed,
        rawValue: result,
        extra: {
          productName: result.productName ?? null,
          sourceUrl: result.sourceUrl ?? null,
        },
      },
    ]);
  }
  return [];
}

export const backmarketModule: ProviderModule = {
  info: {
    id: PROVIDER_ID,
    label: "Back Market",
    types: ["hardware", "games"],
    capabilities: ["identify", "cover", "price"],
    // Prices stay on refreshBarcodePriceOffers — metadata chase must not wait.
    metadataCapabilities: ["identify", "cover"],
    auth: { kind: "scrape" },
    supplyMode: "scrape_cache",
    canonical: false,
    marketplaceSearchPriceSource: true,
    evidenceOnlyPriceRefresh: true,
    requiresTitleAlignment: true,
    isSecondary: true,
    retailCatalogImageTitles: true,
    defaultLanguage: "fr",
    websiteUrl: "https://www.backmarket.fr/",
    coverUrlHost: "d2e6ccujb3mkqf.cloudfront.net",
    // Refurbished product photos — useful fallback, not box-art priority.
    imageScoreAdjustment: -120,
    notes:
      "Reconditionné (consoles / hardware) : titre, galerie produit, état, prix. Cloudflare — FLARESOLVERR_URL recommandé.",
    mappingProbeConfigHint: "FLARESOLVERR_URL",
  },
  evidence: {
    label: "Back Market",
    sourceWeight: 0.12,
  },
  parseMetadataRecordIdFromUrl: parseBackMarketProductUuidFromUrl,
  isVerifiedCatalogProductUrl(url) {
    return Boolean(parseBackMarketProductUuidFromUrl(url));
  },
  createMetadataAdapter() {
    return {
      id: PROVIDER_ID,
      async resolve(ctx) {
        return mapBackMarketMetadata(await resolveBackMarketProduct(ctx));
      },
    } satisfies MetadataProviderAdapter;
  },
  healthCheck: createMetadataHealthCheck(
    PROVIDER_ID,
    "Back Market",
    async () => {
      const result = await pingBackMarket();
      return {
        ok: result.ok,
        latency: result.latency,
        error: result.error ?? null,
      };
    },
  ),
  testHandlers: {
    "backmarket-metadata": {
      label: "Back Market - Metadata",
      kind: "metadata",
      run: async (query) =>
        mapBackMarketMetadata(
          await fetchFromBackMarket(query, [query], { shelfType: "hardware" }),
        ),
    },
    "backmarket-prices": {
      label: "Back Market - Prices",
      kind: "prices",
      run: (query) =>
        fetchPricesFromBackMarket(query, [query], { shelfType: "hardware" }),
    },
  },
  mappingProbe: {
    sampleInput: SAMPLE_QUERY,
    context: { name: SAMPLE_QUERY },
  },
  runMappingProbe: async () =>
    metadataProbe(
      mapBackMarketMetadata(
        await fetchFromBackMarket(SAMPLE_QUERY, [SAMPLE_QUERY], {
          shelfType: "hardware",
        }),
      ),
    ),
  collectMappingRawKeys: async (context) => {
    const ctx = probeContextOrDefault(context, {
      name: SAMPLE_QUERY,
    });
    return mappingRawKeysFromFetch(() =>
      fetchFromBackMarket(
        ctx.name || SAMPLE_QUERY,
        [ctx.name || SAMPLE_QUERY],
        {
          shelfType: "hardware",
        },
      ),
    );
  },
  refreshBarcodePriceOffers: refreshBackMarketOffers,
};
