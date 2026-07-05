import { normalizeProductBarcode } from "@/core/identify/normalize";
import {
  retailerCatalogBarcodeGate,
  retailerProductUrlBarcodeConflicts,
  retailerProductBarcodeConfirmed,
} from "@/core/commerce/retailer/productUrl";
import { createMetadataHealthCheck, pingUrl } from "@/core/catalog/healthUtils";
import { throwIfAborted } from "@/lib/http/abort";
import {
  CHASSE_AUX_LIVRES_CATALOG_BY_TYPE,
  catalogForShelfType,
} from "@/core/catalog/shelfCatalogSlug";
import { isNameOnlyRetailerTitleMatch } from "@/core/commerce/retailer/titleMatch";
import { catalogTitleAlignedWithItem as isChasseTitleAligned } from "@/core/commerce/retailer/catalogTitleAlignment";
import { listProbe, probeErrorResult, retry } from "@/lib/dev/mappingProbe";
import {
  mappingRawKeysFromFetch,
  probeContextOrDefault,
} from "@/lib/dev/mappingRawKeys";
import { createTeardownBarcodeTask } from "@/lib/dev/teardownUtils";
import { scopedContribution } from "@/core/identify/lookup/sourceContribution";
import type { BarcodeLookupPayload } from "@/core/identify/lookup/payload";
import { pricedOffers } from "@/core/catalog/priceOffers";
import { providerProductUrlsForKey } from "@/core/commerce/pricing/providerProductUrls";

export { catalogTitleAlignedWithItem as isChasseTitleAligned } from "@/core/commerce/retailer/catalogTitleAlignment";

import type { BarcodeLookupType, ProviderModule } from "@/types/providerModule";
import type { BarcodePriceRefreshContext } from "@/types/providerModule";
import type {
  MetadataAttachment,
  MetadataFact,
  MetadataResult,
} from "@/types/metadataProvider";
import type { MetadataProviderAdapter } from "@/types/providerModule";

import {
  fetchChasseAuxLivresMetadataProduct,
  fetchFromChasseAuxLivres,
  fetchPricesFromChasseAuxLivres,
  isChasseAuxLivresSearchProtected,
  type ChasseAuxLivresProduct,
} from "./fetch";
import { chasseCoverDownloadCandidates } from "./coverUrl";

export {
  fetchChasseAuxLivresMetadataProduct,
  fetchFromChasseAuxLivres,
  fetchPricesFromChasseAuxLivres,
  isChasseAuxLivresSearchProtected,
};

const BARCODE_TYPES: BarcodeLookupType[] = [
  "games",
  "books",
  "musics",
  "movies",
  "boardgames",
  "generic",
];

const CATALOG: Record<BarcodeLookupType, string> = {
  games: CHASSE_AUX_LIVRES_CATALOG_BY_TYPE.games,
  books: CHASSE_AUX_LIVRES_CATALOG_BY_TYPE.books,
  musics: CHASSE_AUX_LIVRES_CATALOG_BY_TYPE.musics,
  movies: CHASSE_AUX_LIVRES_CATALOG_BY_TYPE.movies,
  boardgames: CHASSE_AUX_LIVRES_CATALOG_BY_TYPE.boardgames,
  generic: "",
};
const PRICE_SOURCE = "ChasseAuxLivres";
const CHASSE_PROVIDER_KEY = "chasseauxlivres";

function chasseCatalogLists(payload: BarcodeLookupPayload) {
  return [
    payload.calFr,
    payload.calDvd,
    payload.calMusic,
    payload.calToys,
    payload.calJeuxVideo,
    payload.calGeneric,
  ];
}

function extractChasseScanOffers(payload: BarcodeLookupPayload) {
  for (const list of chasseCatalogLists(payload)) {
    const priced = list.find(
      (entry) => entry.priceNew != null || entry.priceUsed != null,
    );
    if (priced) {
      const extra = {
        productName: priced.name,
        sourceUrl: priced.productUrl,
        shippingCents: priced.shippingUsed ?? priced.shippingNew ?? null,
        totalCents: priced.priceUsed ?? priced.priceNew ?? null,
      };
      return pricedOffers(PRICE_SOURCE, [
        {
          condition: "new",
          priceCents: priced.priceNew,
          rawValue: priced,
          extra,
        },
        {
          condition: "used",
          priceCents: priced.priceUsed,
          rawValue: priced,
          extra,
        },
      ]);
    }
  }
  return [];
}

function chassePriceOfferExtras(
  result: Awaited<ReturnType<typeof fetchPricesFromChasseAuxLivres>>,
) {
  return {
    productName: result?.productName,
    sourceUrl: result?.sourceUrl,
  };
}

function chassePricedOffersFromResult(
  result: NonNullable<
    Awaited<ReturnType<typeof fetchPricesFromChasseAuxLivres>>
  >,
) {
  const extra = chassePriceOfferExtras(result);
  return pricedOffers(PRICE_SOURCE, [
    {
      condition: "used",
      priceCents: result.priceUsed,
      rawValue: result,
      extra: {
        ...extra,
        shippingCents: result.shippingUsed ?? null,
        totalCents: result.priceUsed ?? null,
      },
    },
    {
      condition: "new",
      priceCents: result.priceNew,
      rawValue: result,
      extra: {
        ...extra,
        shippingCents: result.shippingNew ?? null,
        totalCents: result.priceNew ?? null,
      },
    },
  ]);
}

function chasseProductBarcodeConfirmed(
  product: ChasseAuxLivresProduct,
  itemBarcode?: string | null,
): boolean {
  const normalizedItemBarcode = normalizeProductBarcode(itemBarcode);
  if (!normalizedItemBarcode) return true;

  const gate = retailerCatalogBarcodeGate({
    productUrl: product.productUrl,
    productBarcode: product.barcode,
    itemBarcode: normalizedItemBarcode,
  });

  return (
    gate.catalogBarcodeConfirmed &&
    !gate.barcodeContradicted &&
    !gate.urlBarcodeConflicts
  );
}

function buildChasseProductValidator(input: {
  itemBarcode?: string | null;
  expectedNames: string[];
  shelfType: string;
}): (product: ChasseAuxLivresProduct) => boolean {
  const normalizedItemBarcode = normalizeProductBarcode(input.itemBarcode);
  return (product: ChasseAuxLivresProduct) => {
    if (
      normalizedItemBarcode &&
      !chasseProductBarcodeConfirmed(product, normalizedItemBarcode)
    ) {
      return false;
    }

    if (normalizedItemBarcode) {
      return true;
    }

    if (input.expectedNames.length === 0) return true;

    return input.expectedNames.some((name) =>
      input.shelfType === "games"
        ? isNameOnlyRetailerTitleMatch(name, product.name)
        : isChasseTitleAligned(name, product.name),
    );
  };
}

async function refreshChasseAuxLivresOffers(ctx: BarcodePriceRefreshContext) {
  const catalog = catalogForShelfType(ctx.shelfType);
  const expectedNames = Array.from(
    new Set([ctx.primaryName, ...ctx.fallbackNames].filter(Boolean)),
  );
  const validateProduct = buildChasseProductValidator({
    itemBarcode: ctx.cleanedBarcode,
    expectedNames,
    shelfType: ctx.shelfType,
  });

  const resolvedProductUrls = providerProductUrlsForKey(
    CHASSE_PROVIDER_KEY,
    ctx.providerProductUrls,
  ).filter((url) => {
    if (!ctx.cleanedBarcode) return true;
    if (retailerProductUrlBarcodeConflicts(url, ctx.cleanedBarcode)) {
      return false;
    }
    return retailerProductBarcodeConfirmed(url, null, ctx.cleanedBarcode);
  });

  for (const productUrl of resolvedProductUrls) {
    const result = await fetchPricesFromChasseAuxLivres(productUrl, catalog, {
      validateProduct,
      anchoredItemBarcode: ctx.cleanedBarcode,
    });
    if (result) return chassePricedOffersFromResult(result);
  }

  for (const query of ctx.cleanedBarcode
    ? [ctx.cleanedBarcode, ...ctx.fallbackNames]
    : ctx.fallbackNames) {
    if (!query?.trim()) continue;
    const result = await fetchPricesFromChasseAuxLivres(query, catalog, {
      validateProduct,
      anchoredItemBarcode: ctx.cleanedBarcode,
    });
    if (result) return chassePricedOffersFromResult(result);
  }
  return [];
}

function buildChasseAuxLivresAttachments(
  product: NonNullable<
    Awaited<ReturnType<typeof fetchChasseAuxLivresMetadataProduct>>
  >,
): MetadataAttachment[] | undefined {
  const images = product.images ?? [];
  const urls =
    images.length > 0
      ? images
      : product.coverUrl
        ? [product.coverUrl]
        : [];
  if (urls.length === 0) return undefined;

  return urls.map((url, index) => ({
    type: index === 0 ? ("cover" as const) : ("image" as const),
    url,
    role: "fr",
    source: "chasseauxlivres",
  }));
}

function mapChasseAuxLivresMetadata(
  product: Awaited<ReturnType<typeof fetchChasseAuxLivresMetadataProduct>>,
): MetadataResult | null {
  if (!product?.name) return null;

  const facts: MetadataFact[] = [];
  if (product.productUrl) {
    facts.push({
      kind: "external-link",
      label: "Chasse aux Livres",
      value: "Voir la fiche",
      url: product.productUrl,
      source: "chasseauxlivres",
      confidence: 0.62,
      priority: 32,
    });
  }
  if (product.sku) {
    facts.push({
      kind: "identifier",
      label: "Référence Chasse aux Livres",
      value: product.sku,
      source: "chasseauxlivres",
      confidence: 0.56,
      priority: 22,
    });
  }
  if (product.barcode) {
    facts.push({
      kind: "identifier",
      label: product.barcode.length === 13 ? "EAN-13" : "Code-barres",
      value: product.barcode,
      source: "chasseauxlivres",
      confidence: 0.68,
      priority: 42,
    });
  }
  if (product.category) {
    facts.push({
      kind: "category",
      label: "Catégorie",
      value: product.category,
      source: "chasseauxlivres",
      confidence: 0.58,
      priority: 24,
    });
  }
  if (product.ratingValue && product.ratingCount) {
    facts.push({
      kind: "rating",
      label: "Chasse aux Livres",
      value: `${product.ratingValue.toFixed(1)}/5 (${product.ratingCount} avis)`,
      source: "chasseauxlivres",
      confidence: 0.62,
      priority: 54,
    });
  }

  return {
    title: product.name,
    barcode: product.barcode || null,
    authors: product.authors?.map((name) => ({ name })),
    publishers: product.publisher ? [{ name: product.publisher }] : undefined,
    description: product.description,
    imageUrl: product.coverUrl,
    regionalTitles: [{ region: "fr", text: product.name }],
    attachments: buildChasseAuxLivresAttachments(product),
    facts: facts.length > 0 ? facts : undefined,
    externalIds: product.sku ? { chasseauxlivres: product.sku } : undefined,
  };
}

export const chasseauxlivresModule: ProviderModule = {
  info: {
    id: "chasseauxlivres",
    label: "Chasse aux Livres",
    types: ["books", "musics", "movies", "boardgames"],
    capabilities: [
      "identify",
      "price",
      "cover",
      "description",
      "rating",
      "people",
    ],
    metadataCapabilities: [
      "identify",
      "cover",
      "description",
      "rating",
      "people",
    ],
    auth: { kind: "scrape" },
    canonical: false,
    defaultLanguage: "fr",
    imageScoreAdjustment: -25,
    remoteImageFallback: true,
    bookGallerySource: true,
    coverUrlHost: "img.chasse-aux-livres.fr",
    remoteImageReferer: "https://www.chasse-aux-livres.fr/",
    bookCoverPriority: "primary",
    requiresTitleAlignment: true,
    bookIsbnBootstrapSource: true,
    slowBarcodeLookup: true,
    websiteUrl: "https://www.chasse-aux-livres.fr/",
    apiKeyDashboardUrl: "https://www.chasse-aux-livres.fr/",
  },
  evidence: {
    label: "ChasseAuxLivres",
    sourceWeight: 0.16,
  },
  buildBarcodeTasks(deps, type, { barcode }) {
    if (!BARCODE_TYPES.includes(type)) {
      return {} as Record<string, Promise<unknown>>;
    }
    return {
      cal: deps.fetchFromChasseAuxLivres(barcode, CATALOG[type], {
        withPrices: true,
      }),
    };
  },
  contributeBarcodeLookupDeps: () => ({
    fetchFromChasseAuxLivres,
  }),
  createMetadataAdapter() {
    return {
      id: "chasseauxlivres",
      async resolve({ type, name, barcode, lookupQueries, signal }) {
        const normalizedBarcode = String(barcode || "").trim();
        const queries =
          lookupQueries && lookupQueries.length > 0
            ? lookupQueries
            : [String(name || "").trim()];
        const catalog = catalogForShelfType(type || "books");
        const validateProduct = buildChasseProductValidator({
          itemBarcode: normalizedBarcode,
          expectedNames: [String(name || "").trim(), ...queries].filter(
            Boolean,
          ),
          shelfType: type || "boardgames",
        });

        if (normalizedBarcode) {
          const product = await fetchChasseAuxLivresMetadataProduct(
            normalizedBarcode,
            catalog,
            {
              validateProduct,
              anchoredItemBarcode: normalizedBarcode,
              signal,
            },
          );
          if (product) return mapChasseAuxLivresMetadata(product);
          return null;
        }

        for (const query of queries) {
          if (!query?.trim()) continue;
          throwIfAborted(signal);
          const product = await fetchChasseAuxLivresMetadataProduct(
            query.trim(),
            catalog,
            {
              validateProduct,
              signal,
            },
          );
          if (product) return mapChasseAuxLivresMetadata(product);
        }
        return null;
      },
    } satisfies MetadataProviderAdapter;
  },
  buildTeardownBarcodeTasks(ctx, deps) {
    if (!ctx.barcode) return [];

    const catalogEntries = ctx.type
      ? [
          {
            label: "ChasseAuxLivres",
            catalog: CATALOG[ctx.type as BarcodeLookupType] || "",
          },
        ]
      : [
          { label: "ChasseAuxLivres:books", catalog: "fr" },
          { label: "ChasseAuxLivres:movies", catalog: "dvd" },
          { label: "ChasseAuxLivres:musics", catalog: "music" },
          {
            label: "ChasseAuxLivres:games",
            catalog: CHASSE_AUX_LIVRES_CATALOG_BY_TYPE.games,
          },
          { label: "ChasseAuxLivres:boardgames", catalog: "toys" },
        ];

    return catalogEntries.map((entry) =>
      createTeardownBarcodeTask(entry.label, () =>
        deps.fetchFromChasseAuxLivres(ctx.barcode!, entry.catalog),
      ),
    );
  },
  healthCheck: createMetadataHealthCheck(
    "chasseauxlivres",
    "Chasse aux Livres",
    async () => {
      const start = Date.now();
      const isUp = await pingUrl("https://www.chasse-aux-livres.fr");
      return {
        ok: isUp,
        latency: Date.now() - start,
        error: isUp ? null : "Host unreachable",
      };
    },
  ),
  testHandlers: {
    "chasseauxlivres-barcode": {
      label: "Chasse aux Livres - Barcode",
      kind: "scraped-list",
      run: (query, type) =>
        fetchFromChasseAuxLivres(query, catalogForShelfType(type)),
    },
  },
  mappingProbe: {
    sampleInput: "9780140328721",
    context: { name: "", barcode: "9780140328721" },
    catalog: "fr",
  },
  runMappingProbe: async () => {
    const products = await retry(
      () => fetchFromChasseAuxLivres("9780140328721", "fr"),
      2,
    );
    const probe = listProbe(products);
    if (probe) return probe;
    if (await isChasseAuxLivresSearchProtected("9780140328721", "fr")) {
      return probeErrorResult(
        "Search redirects to a protected login page — Chasse aux Livres blocks anonymous server requests",
        "blocked",
      );
    }
    return probeErrorResult(
      process.env.FLARESOLVERR_URL?.trim()
        ? "No listing for sample ISBN — site HTML may have changed or blocked the request"
        : "No listing for sample ISBN — set FLARESOLVERR_URL for server-side scrape or run probe from an unblocked network",
      "empty",
    );
  },
  collectMappingRawKeys: async (context) => {
    const ctx = probeContextOrDefault(context, {
      name: "",
      barcode: "9780140328721",
    });
    return mappingRawKeysFromFetch(() =>
      fetchFromChasseAuxLivres(ctx.barcode || "9780140328721", "fr"),
    );
  },
  buildBarcodeSources(payload, ctx) {
    // Per-type category feeds, with the generic feed as the unknown-type fallback.
    const L = "ChasseAuxLivres";
    return [
      ...scopedContribution(L, "books", payload.calFr, payload.calGeneric, ctx),
      ...scopedContribution(
        L,
        "games",
        payload.calJeuxVideo,
        payload.calGeneric,
        ctx,
      ),
      ...scopedContribution(
        L,
        "musics",
        payload.calMusic,
        payload.calGeneric,
        ctx,
      ),
      ...scopedContribution(
        L,
        "movies",
        payload.calDvd,
        payload.calGeneric,
        ctx,
      ),
      ...scopedContribution(
        L,
        "boardgames",
        payload.calToys,
        payload.calGeneric,
        ctx,
      ),
    ];
  },
  extractScanPriceOffers: extractChasseScanOffers,
  refreshBarcodePriceOffers: refreshChasseAuxLivresOffers,
  expandCoverDownloadCandidates: chasseCoverDownloadCandidates,
};
