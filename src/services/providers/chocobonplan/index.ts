import { createMetadataHealthCheck } from "@/lib/provider/healthUtils";
import { rawProbe } from "@/lib/dev/mappingProbe";
import { pricedOffers } from "@/lib/provider/priceOffers";
import { inferCover3dRoleFromHints } from "@/lib/media/coverPerspective";
import type { ProviderModule } from "@/types/providerModule";
import type { BarcodePriceRefreshContext } from "@/types/providerModule";
import type { MetadataProviderAdapter } from "@/types/providerModule";
import type { MetadataResult } from "@/types/metadataProvider";

import {
  fetchFromChocoBonPlan,
  fetchPricesFromChocoBonPlan,
  pingChocoBonPlan,
} from "./fetch";

export {
  fetchFromChocoBonPlan,
  fetchPricesFromChocoBonPlan,
  pingChocoBonPlan,
} from "./fetch";

const PRICE_SOURCE = "ChocoBonPlan";
const LANGUAGE = "fr";

function chocoBonPlanCoverRole(image: {
  url: string;
  type: string;
  title?: string;
}): string {
  if (image.type !== "cover") return LANGUAGE;
  return (
    inferCover3dRoleFromHints({
      url: image.url,
      title: image.title,
      coverDefaultRegion: LANGUAGE,
      role: LANGUAGE,
    }) ?? LANGUAGE
  );
}

function productToMetadata(product: NonNullable<
  Awaited<ReturnType<typeof fetchFromChocoBonPlan>>
>): MetadataResult {
  const facts =
    product.priceNew != null
      ? [
          {
            kind: "observed-price" as const,
            label: "ChocoBonPlan",
            value: `${(product.priceNew / 100).toFixed(2).replace(".", ",")} €`,
            source: "chocobonplan",
          },
        ]
      : undefined;

  return {
    title: product.title,
    description: product.description || undefined,
    imageUrl: product.coverUrl || undefined,
    heroImageUrl: product.backgroundImageUrl || undefined,
    regionalTitles: [{ region: LANGUAGE, text: product.title }],
    attachments:
      product.attachments && product.attachments.length > 0
        ? product.attachments.map((image) => ({
            type: image.type,
            url: image.url,
            source: "chocobonplan",
            role: chocoBonPlanCoverRole(image),
            title: image.title,
          }))
        : product.coverUrl
          ? [
              {
                type: "cover" as const,
                url: product.coverUrl,
                source: "chocobonplan",
                role: chocoBonPlanCoverRole({
                  url: product.coverUrl,
                  type: "cover",
                }),
              },
            ]
          : undefined,
    facts,
    externalIds: product.objectId
      ? { chocobonplan: product.objectId }
      : undefined,
  };
}

async function refreshChocoBonPlanOffers(ctx: BarcodePriceRefreshContext) {
  const queries = [ctx.cleanedBarcode, ...ctx.fallbackNames].filter(Boolean);
  const result = await fetchPricesFromChocoBonPlan(queries);
  if (!result?.priceNew) return [];
  return pricedOffers(PRICE_SOURCE, [
    {
      condition: "new",
      priceCents: result.priceNew,
      rawValue: result,
      extra: {
        productName: result.productName ?? null,
        sourceUrl: result.sourceUrl ?? null,
      },
    },
  ]);
}

export const chocobonplanModule: ProviderModule = {
  info: {
    id: "chocobonplan",
    label: "ChocoBonPlan",
    types: ["games", "movies", "musics", "boardgames"],
    capabilities: ["identify", "description", "cover", "price"],
    auth: { kind: "scrape" },
    canonical: false,
    isSecondary: true,
    requiresTitleAlignment: true,
    defaultLanguage: "fr",
    gameMediaGallerySource: true,
    isRealBoxCover: true,
    websiteUrl: "https://chocobonplan.com/",
    notes:
      "Bons plans FR (Algolia + fiches produit) : titre, description, visuels HD et meilleur prix observé.",
  },
  evidence: {
    label: "ChocoBonPlan",
    sourceWeight: 0.12,
  },
  createMetadataAdapter() {
    const adapter: MetadataProviderAdapter = {
      id: "chocobonplan",
      async resolve({ name, lookupQueries, platform, shelfName }) {
        const queries =
          lookupQueries && lookupQueries.length > 0
            ? lookupQueries
            : [String(name || "").trim()].filter(Boolean);
        if (queries.length === 0) return null;

        const product = await fetchFromChocoBonPlan(queries, queries, {
          platform,
          shelfName,
        });
        if (!product) return null;
        return productToMetadata(product);
      },
    };
    return adapter;
  },
  healthCheck: createMetadataHealthCheck(
    "chocobonplan",
    "ChocoBonPlan",
    async () => {
      const result = await pingChocoBonPlan();
      return {
        ok: result.ok,
        latency: result.latency,
        error: result.error ?? null,
      };
    },
  ),
  testHandlers: {
    "chocobonplan-metadata": {
      label: "ChocoBonPlan - Metadata",
      kind: "metadata",
      run: (query) => fetchFromChocoBonPlan(query),
    },
    "chocobonplan-prices": {
      label: "ChocoBonPlan - Prices",
      kind: "prices",
      run: (query) => fetchPricesFromChocoBonPlan(query),
    },
  },
  mappingProbe: {
    sampleInput: "Ball x Pit PS5",
    context: { name: "Ball x Pit PS5" },
  },
  runMappingProbe: async () =>
    rawProbe(await fetchFromChocoBonPlan("Ball x Pit PS5")),
  refreshBarcodePriceOffers: refreshChocoBonPlanOffers,
};
