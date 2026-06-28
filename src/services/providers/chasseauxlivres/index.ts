import { createMetadataHealthCheck, pingUrl } from "@/lib/provider/healthUtils";
import {
  CHASSE_AUX_LIVRES_CATALOG_BY_TYPE,
  catalogForShelfType,
} from "@/lib/provider/catalog";
import { metadataTitleSimilarity } from "@/lib/metadata/titleMatching";
import { isNameOnlyRetailerTitleMatch } from "@/lib/retailer/titleMatch";
import { listProbe, probeErrorResult, retry } from "@/lib/dev/mappingProbe";
import { createTeardownBarcodeTask } from "@/lib/dev/teardownUtils";
import { scopedContribution } from "@/lib/barcode/lookup/sourceContribution";
import type { BarcodeLookupPayload } from "@/lib/barcode/lookup/payload";
import { pricedOffers } from "@/lib/provider/priceOffers";
import { normalizeVolumeTitleText, hasExplicitVolumeMarker } from "@/lib/title/volumeNumber";

import type { BarcodeLookupType, ProviderModule } from "@/types/providerModule";
import type { BarcodePriceRefreshContext } from "@/types/providerModule";
import type { MetadataFact, MetadataResult } from "@/types/metadataProvider";
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
      return pricedOffers(PRICE_SOURCE, [
        { condition: "new", priceCents: priced.priceNew, rawValue: priced },
        { condition: "used", priceCents: priced.priceUsed, rawValue: priced },
      ]);
    }
  }
  return [];
}

async function refreshChasseAuxLivresOffers(ctx: BarcodePriceRefreshContext) {
  const catalog = catalogForShelfType(ctx.shelfType);
  const expectedNames = Array.from(
    new Set([ctx.primaryName, ...ctx.fallbackNames].filter(Boolean)),
  );
  const validateProduct =
    expectedNames.length > 0
      ? (product: ChasseAuxLivresProduct) =>
          expectedNames.some((name) =>
            ctx.shelfType === "games"
              ? isNameOnlyRetailerTitleMatch(name, product.name)
              : isChasseTitleAligned(name, product.name),
          )
      : undefined;

  for (const query of [ctx.cleanedBarcode, ...ctx.fallbackNames]) {
    if (!query.trim()) continue;
    const result = await fetchPricesFromChasseAuxLivres(query, catalog, {
      validateProduct,
    });
    if (result) {
      return pricedOffers(PRICE_SOURCE, [
        { condition: "used", priceCents: result.priceUsed, rawValue: result },
        { condition: "new", priceCents: result.priceNew, rawValue: result },
      ]);
    }
  }
  return [];
}

function titleNumbers(value: string): string[] {
  return Array.from(
    new Set(normalizeVolumeTitleText(value).match(/\d+/g) || []),
  );
}

export function isChasseTitleAligned(query: string, title: string) {
  const cleanQuery = query.trim();
  const cleanTitle = title.trim();
  if (!cleanQuery || !cleanTitle) return true;

  const queryNumbers = titleNumbers(cleanQuery);
  const titleNumberSet = new Set(titleNumbers(cleanTitle));
  if (
    queryNumbers.length > 0 &&
    queryNumbers.some((number) => !titleNumberSet.has(number))
  ) {
    return false;
  }

  if (
    queryNumbers.length === 0 &&
    !hasExplicitVolumeMarker(cleanQuery) &&
    hasExplicitVolumeMarker(cleanTitle)
  ) {
    return false;
  }

  const q = normalizeVolumeTitleText(cleanQuery);
  const t = normalizeVolumeTitleText(cleanTitle);
  return (
    q.includes(t) || t.includes(q) || metadataTitleSimilarity(q, t) >= 0.45
  );
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
    attachments: product.coverUrl
      ? [
          {
            type: "cover",
            url: product.coverUrl,
            role: "fr",
            source: "chasseauxlivres",
          },
        ]
      : undefined,
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
    coverUrlHost: "img.chasse-aux-livres.fr",
    remoteImageFallback: true,
    remoteImageReferer: "https://www.chasse-aux-livres.fr/",
    bookCoverPriority: "primary",
    requiresTitleAlignment: true,
    bookIsbnBootstrapSource: true,
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
      async resolve({ type, name, barcode, lookupQueries }: any) {
        const normalizedBarcode = String(barcode || "").trim();
        const queries =
          lookupQueries && lookupQueries.length > 0
            ? lookupQueries
            : [String(name || "").trim()];
        const catalog = catalogForShelfType(type || "books");

        if (normalizedBarcode) {
          const product = await fetchChasseAuxLivresMetadataProduct(
            normalizedBarcode,
            catalog,
            {
              validateProduct: (candidate) =>
                !name || isChasseTitleAligned(name, candidate.name),
            },
          );
          if (product) return mapChasseAuxLivresMetadata(product);
        }

        for (const query of queries) {
          if (!query?.trim()) continue;
          const product = await fetchChasseAuxLivresMetadataProduct(
            query.trim(),
            catalog,
            {
              validateProduct: (candidate) =>
                isChasseTitleAligned(String(name || query).trim(), candidate.name),
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
      "No listing for sample ISBN — site HTML may have changed or blocked the request",
      "empty",
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
