import type {
  BarcodePriceRefreshContext,
  BarcodeLookupType,
  ProviderModule,
} from "@/types/providerModule";
import { matchPrimaryBarcode } from "@/core/catalog/matchContext";
import { normalizeProductBarcode } from "@/core/identify/normalize";
import { listProbe, probeErrorResult, retry } from "@/lib/dev/mappingProbe";
import {
  mappingRawKeysFromFetch,
  probeContextOrDefault,
} from "@/lib/dev/mappingRawKeys";
import {
  marketplaceContributions,
  typedOnlyContributions,
} from "@/core/identify/lookup/sourceContribution";
import {
  createMetadataHealthCheck,
  createUnconfiguredHealthCheck,
} from "@/core/catalog/healthUtils";
import { pricedOffers } from "@/core/catalog/priceOffers";

import { EBAY_ENV_NAMES, getEbayEnv } from "./env";
import {
  fetchEbayProductsByQuery,
  fetchFromEbay,
  fetchPricesFromEbay,
  pingEbay,
  type EbayProduct,
} from "./fetch";
import { fetchFromEbayCatalog } from "./catalog";
import { ebayCoverDownloadCandidates } from "./coverUrl";
import { prepareEbayProductsForGameShelf } from "./platformFilter";
import { ebayPriceSearchQueries } from "./searchQueries";
import { detectVideoGamePlatformKey } from "@/core/identify/platforms/platforms";
import {
  normalizeVideoGamePlatformKey,
  resolveGameAttachmentPlatformKey,
} from "@/core/enrich/media/platformKeyStamp";
import { resolveGameMetadataPlatform } from "@/core/enrich/platform";

export {
  fetchEbayProductsByQuery,
  fetchFromEbay,
  fetchFromEbayCatalog,
  fetchPricesFromEbay,
  pingEbay,
};

const BARCODE_TYPES: BarcodeLookupType[] = [
  "games",
  "musics",
  "movies",
  "books",
  "boardgames",
  "hardware",
  "generic",
];
const PRICE_SOURCE = "eBay";
const PROBE_BARCODE = "9782070368228";

function mapEbayMetadata(
  products: EbayProduct[],
  normalizedBarcode: string | null,
  platformKey?: string | null,
) {
  const catalogProduct = products.find(
    (product) => product.catalog && product.name,
  );
  const titledProduct =
    catalogProduct ?? products.find((product) => product.name);
  const imageProducts = products.filter((product) => product.coverUrl);
  const coverProduct =
    imageProducts.find((product) => product.catalog) ?? imageProducts[0];
  const imageUrl = coverProduct?.coverUrl || undefined;
  if (!imageUrl && !titledProduct?.name) return null;

  const epid =
    catalogProduct?.epid ?? products.find((product) => product.epid)?.epid;
  const brand = catalogProduct?.brand?.trim();

  const resolvedPlatformKey =
    normalizeVideoGamePlatformKey(platformKey) ??
    resolveGameAttachmentPlatformKey({
      title: catalogProduct?.name ?? titledProduct?.name,
    });

  return {
    title: catalogProduct?.name ?? titledProduct?.name,
    platformKey: resolvedPlatformKey,
    barcode: normalizedBarcode,
    imageUrl,
    externalIds: epid ? { ebay: epid } : undefined,
    attachments: imageProducts.slice(0, 6).map((product) => ({
      type: "cover" as const,
      url: product.coverUrl!,
      source: "ebay",
      title: product.name,
      role: product.catalog ? "catalog" : "marketplace",
      ...(resolvedPlatformKey ? { platformKey: resolvedPlatformKey } : {}),
    })),
    facts: brand
      ? [
          {
            kind: "brand",
            label: "Brand",
            value: brand,
            source: "ebay",
            confidence: 0.75,
            priority: 50,
          },
        ]
      : undefined,
  };
}

async function refreshEbayOffers(ctx: BarcodePriceRefreshContext) {
  const expectedNames = Array.from(
    new Set([ctx.primaryName, ...ctx.fallbackNames].filter(Boolean)),
  );
  const titleMatch = {
    shelfType: ctx.shelfType,
    ...(ctx.evidenceOnly ? { evidenceOnly: true } : {}),
  };
  const priceQueries = ebayPriceSearchQueries(
    ctx.primaryName,
    ctx.fallbackNames,
    matchPrimaryBarcode(ctx) || ctx.cleanedBarcode,
  );
  for (const query of priceQueries) {
    const result = await fetchPricesFromEbay(query, expectedNames, titleMatch);
    if (!result) continue;
    const extra = {
      productName: result.productName ?? null,
      sourceUrl: result.sourceUrl ?? null,
      offerCount: result.offerCount ?? null,
    };
    const offers = pricedOffers(PRICE_SOURCE, [
      {
        condition: "new",
        priceCents: result.priceNew,
        rawValue: result,
        extra,
      },
      {
        condition: "used",
        priceCents: result.priceUsed,
        rawValue: result,
        extra,
      },
    ]);
    if (offers.length) return offers;
  }
  return [];
}

export const ebayModule: ProviderModule = {
  info: {
    id: "ebay",
    label: "eBay",
    types: ["games", "movies", "musics", "books", "boardgames", "hardware"],
    capabilities: ["identify", "price", "cover"],
    metadataCapabilities: ["identify", "cover"],
    auth: {
      kind: "key",
      env: [...EBAY_ENV_NAMES],
      free: true,
    },
    supplyMode: "api_live",
    canonical: false,
    coverUrlHost: "i.ebayimg.com",
    remoteImageFallback: true,
    imageScoreAdjustment: -280,
    isSecondary: true,
    websiteUrl: "https://www.ebay.fr/",
    sourceAliases: ["PicClick", "picclick"],
    marketplaceSearchPriceSource: true,
    evidenceOnlyPriceRefresh: true,
    apiKeyDashboardUrl: "https://developer.ebay.com/my/keys",
    mappingProbeRetry: true,
    mappingProbeConfigHint:
      "eBay credentials missing — create an app at developer.ebay.com, set EBAY_CLIENT_ID / EBAY_CLIENT_SECRET, and enable Browse + Catalog (commerce.catalog.readonly) scopes",
    notes:
      "eBay Browse API (listings/prix) + Catalog API (produit canonique GTIN/ePID). OAuth client-credentials.",
  },
  expandCoverDownloadCandidates: ebayCoverDownloadCandidates,
  evidence: {
    label: "eBay",
    sourceWeight: 0.1,
  },
  buildBarcodeTasks(deps, type, { barcode }) {
    if (!BARCODE_TYPES.includes(type)) {
      return {} as Record<string, Promise<unknown>>;
    }
    return { ebay: deps.fetchFromEbay(barcode) };
  },
  contributeBarcodeLookupDeps: () => ({
    fetchFromEbay,
  }),
  testHandlers: {
    "ebay-barcode": {
      label: "eBay - Barcode",
      kind: "scraped-list",
      run: (query) => fetchFromEbay(query),
    },
  },
  createMetadataAdapter() {
    return {
      id: "ebay",
      async resolve({
        barcode,
        name,
        lookupQueries,
        platform,
        shelfName,
        type,
      }: {
        barcode?: string | null;
        name?: string | null;
        lookupQueries?: string[];
        platform?: string | null;
        shelfName?: string | null;
        type?: string | null;
      }) {
        const normalizedBarcode = normalizeProductBarcode(barcode);
        const queries =
          lookupQueries && lookupQueries.length > 0
            ? lookupQueries
            : [String(name || "").trim()].filter(Boolean);
        const expectedNames = Array.from(
          new Set([String(name || "").trim(), ...queries].filter(Boolean)),
        );
        const productTitle = expectedNames[0] ?? "";
        const titleMatch = { shelfType: type ?? null };
        const platformKey =
          type === "games"
            ? detectVideoGamePlatformKey(
                resolveGameMetadataPlatform(platform, shelfName, "games"),
              )
            : null;

        const merged: EbayProduct[] = [];
        const seenNames = new Set<string>();
        const addProducts = (batch: EbayProduct[]) => {
          for (const product of batch) {
            const key = product.name.trim().toLowerCase();
            if (!key || seenNames.has(key)) continue;
            seenNames.add(key);
            merged.push(product);
          }
        };

        if (normalizedBarcode) {
          const gtinProducts = await fetchFromEbay(
            normalizedBarcode,
            expectedNames,
            titleMatch,
          );
          addProducts(gtinProducts);
          if (gtinProducts.length === 0 && merged.length === 0) {
            for (const query of queries.slice(0, 1)) {
              addProducts(
                await fetchEbayProductsByQuery(
                  query,
                  expectedNames,
                  titleMatch,
                ),
              );
            }
          }
        } else {
          for (const query of queries) {
            addProducts(
              await fetchEbayProductsByQuery(query, expectedNames, titleMatch),
            );
          }
        }

        const products = prepareEbayProductsForGameShelf(
          merged,
          platformKey,
          productTitle,
        );

        return mapEbayMetadata(products, normalizedBarcode, platformKey);
      },
    };
  },
  mappingProbe: {
    sampleInput: PROBE_BARCODE,
    context: { name: "", barcode: PROBE_BARCODE },
  },
  runMappingProbe: async () => {
    if (!getEbayEnv()) {
      return probeErrorResult(
        `eBay credentials missing — set ${EBAY_ENV_NAMES.join(" / ")}`,
        "blocked",
      );
    }
    try {
      const products = await retry(() => fetchFromEbay(PROBE_BARCODE), 2);
      const probe = listProbe(products);
      if (probe) return probe;
      return probeErrorResult(
        "No eBay catalog or listing hits for sample barcode",
        "empty",
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (
        /timeout|timed out|ETIMEDOUT|ECONNABORTED|AbortError/i.test(message)
      ) {
        return probeErrorResult("eBay Browse API timed out", "blocked");
      }
      return probeErrorResult(message);
    }
  },
  collectMappingRawKeys: async (context) => {
    if (!getEbayEnv()) return [];
    const ctx = probeContextOrDefault(context, {
      name: "",
      barcode: PROBE_BARCODE,
    });
    return mappingRawKeysFromFetch(() =>
      fetchFromEbay(ctx.barcode || PROBE_BARCODE),
    );
  },
  healthCheck: getEbayEnv()
    ? createMetadataHealthCheck("ebay", "eBay", async () => {
        const result = await pingEbay();
        return {
          configured: true,
          ok: result.ok,
          latency: result.latency,
          error: result.error ?? null,
        };
      })
    : createUnconfiguredHealthCheck(
        "ebay",
        "eBay",
        `eBay credentials missing — set ${EBAY_ENV_NAMES.join(" / ")}`,
      ),
  barcodeLookupSlots: { ebay: () => [] },
  buildBarcodeSources(payload, ctx) {
    return [
      ...marketplaceContributions("eBay", payload.ebay, ctx, [
        "games",
        "musics",
        "movies",
        "books",
        "boardgames",
      ]),
      ...typedOnlyContributions("eBay", payload.ebay, ctx, ["hardware"]),
    ];
  },
  refreshBarcodePriceOffers: refreshEbayOffers,
};

import type { NamedListing } from "@/core/identify/gameLookup";

// This module owns the `ebay` barcode-lookup slot: it declares its type here
// and its empty value in `info.barcodeLookupSlots`, so core enumerates none.
declare module "@/core/identify/lookup/payload" {
  interface BarcodeLookupSlots {
    ebay: NamedListing[];
  }
}
