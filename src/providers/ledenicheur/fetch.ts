import axios from "axios";

import {
  barcodesEquivalent,
  normalizeProductBarcode,
} from "@/core/identify/normalize";
import {
  catalogTitleAlignedWithItem,
  retailerCatalogTitleContradictsItem,
} from "@/core/commerce/retailer/catalogTitleAlignment";
import { retailerBarcodeContradictsItem } from "@/core/commerce/retailer/productUrl";
import type { LeDenicheurPrices } from "@/core/identify/lookup/providerTypes";

export type { LeDenicheurPrices } from "@/core/identify/lookup/providerTypes";

const BASE_URL = "https://ledenicheur.fr";
const BFF_URL = `${BASE_URL}/_internal/bff`;

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  Accept: "application/json",
  "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
  "Content-Type": "application/json",
  Origin: BASE_URL,
  Referer: `${BASE_URL}/`,
};

const SEARCH_QUERY = `
  query searchPage($query: String!, $offset: Int, $limit: Int) {
    newSearch(query: $query, allProductsFilter: true) {
      results {
        products(offset: $offset, limit: $limit) {
          pageInfo {
            total
          }
          nodes {
            ... on Product {
              __typename
              name
              pathName
              priceSummary {
                regular
                alternative
                inStock
                count
              }
              media {
                first(width: _280)
              }
            }
            ... on Offer {
              __typename
              name
              externalUri
              offerPrice {
                regular
              }
              store {
                name
              }
              media {
                first
              }
            }
          }
        }
      }
    }
  }
`;

const PRODUCT_DETAIL_QUERY = `
  query productPrices($id: Int!) {
    product(id: $id) {
      name
      pathName
      priceSummary {
        regular
        alternative
        inStock
        count
      }
      media {
        first(width: _280)
      }
    }
  }
`;

type LeDenicheurPriceSummary = {
  regular?: number | string | null;
  alternative?: number | string | null;
  inStock?: number | string | null;
  count?: number | null;
};

type LeDenicheurProductNode = {
  __typename?: "Product";
  name?: string | null;
  pathName?: string | null;
  priceSummary?: LeDenicheurPriceSummary | null;
  media?: { first?: string | null } | null;
};

type LeDenicheurOfferNode = {
  __typename?: "Offer";
  name?: string | null;
  externalUri?: string | null;
  offerPrice?: { regular?: number | string | null } | null;
  store?: { name?: string | null } | null;
  media?: { first?: string | null } | null;
};

type LeDenicheurNode = LeDenicheurProductNode | LeDenicheurOfferNode;

// Le BFF renvoie le payload GraphQL parfois enveloppé (`{ data: {...} }`),
// parfois à plat — les deux formes sont tolérées.
type LeDenicheurProductDetailEnvelope = {
  data?: { product?: LeDenicheurProductNode | null };
  product?: LeDenicheurProductNode | null;
};
type LeDenicheurSearchEnvelope = {
  data?: { newSearch?: { results?: { products?: { nodes?: unknown[] } } } };
  newSearch?: { results?: { products?: { nodes?: unknown[] } } };
};

function cleanQuery(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeForMatch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function meaningfulTokens(query: string) {
  const genericTokens = new Set([
    "blu",
    "bluray",
    "book",
    "coffret",
    "collector",
    "collection",
    "complete",
    "dvd",
    "edition",
    "film",
    "game",
    "jeu",
    "jeux",
    "limited",
    "livre",
    "movie",
    "pour",
    "saison",
    "season",
    "switch",
    "vol",
    "volume",
  ]);

  return (
    normalizeForMatch(query)
      .match(/[a-z0-9]{3,}/g)
      ?.filter((token) => !genericTokens.has(token)) ?? []
  );
}

function seasonNumbers(value: string) {
  return Array.from(
    normalizeForMatch(value).matchAll(/\b(?:saison|season)\s*(\d{1,2})\b/g),
  )
    .map((match) => match[1])
    .filter(Boolean);
}

function hasConflictingSeason(query: string, productName?: string | null) {
  const expectedSeasons = seasonNumbers(query);
  if (expectedSeasons.length === 0) return false;

  const productSeasons = seasonNumbers(productName || "");
  return (
    productSeasons.length > 0 &&
    !productSeasons.some((season) => expectedSeasons.includes(season))
  );
}

function isBarcodeLike(query: string) {
  return /^\d{8,14}$/.test(query.replace(/[^\d]/g, ""));
}

function isProbablyRelevant(
  query: string,
  productName?: string | null,
  options?: LeDenicheurFetchOptions,
) {
  if (isBarcodeLike(query)) return !options?.itemBarcode;
  if (hasConflictingSeason(query, productName)) return false;

  const tokens = meaningfulTokens(query);
  if (tokens.length === 0) return true;
  const normalizedProduct = normalizeForMatch(productName || "");
  return tokens.some((token) => normalizedProduct.includes(token));
}

function uniqueQueries(queryOrQueries: string | string[]) {
  const queries = Array.isArray(queryOrQueries)
    ? queryOrQueries
    : [queryOrQueries];
  const seen = new Set<string>();
  return queries
    .map(cleanQuery)
    .filter((query) => {
      const key = query.toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 5);
}

function priceToCents(value: unknown): number | null {
  if (value === undefined || value === null) return null;
  const amount =
    typeof value === "number"
      ? value
      : Number(String(value).replace(/\s/g, "").replace(",", "."));
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return Math.round(amount * 100);
}

function absoluteLeDenicheurUrl(pathName?: string | null) {
  if (!pathName) return undefined;
  if (/^https?:\/\//i.test(pathName)) return pathName;
  return `${BASE_URL}${pathName.startsWith("/") ? "" : "/"}${pathName}`;
}

export function extractLeDenicheurProductId(pathName?: string | null) {
  if (!pathName) return null;
  const match = pathName.match(/[?&]p=(\d+)/);
  if (!match) return null;
  const productId = Number(match[1]);
  return Number.isFinite(productId) ? productId : null;
}

/** LeDenicheur exposes new vs used as `regular` vs `alternative` on product pages. */
export function parseLeDenicheurPriceSummary(
  summary?: LeDenicheurPriceSummary | null,
): Pick<LeDenicheurPrices, "priceNew" | "priceUsed"> {
  const regular = priceToCents(summary?.regular);
  const inStock = priceToCents(summary?.inStock);
  const alternative = priceToCents(summary?.alternative);
  const priceNew = regular ?? inStock ?? undefined;

  let priceUsed: number | undefined;
  if (alternative != null && priceNew != null && alternative !== priceNew) {
    // `alternative` is usually the used/lowest offer, but on some SKUs it can be
    // a marketplace outlier (e.g. PC listing at 1000€ vs 13€ new).
    if (alternative <= priceNew * 4) {
      priceUsed = alternative;
    }
  }

  return { priceNew, priceUsed };
}

function buildProductPrices(
  product: LeDenicheurProductNode,
  detail: LeDenicheurProductNode | null,
  productGtin?: string | null,
): LeDenicheurPrices | null {
  const summary = detail?.priceSummary ?? product.priceSummary;
  const { priceNew, priceUsed } = parseLeDenicheurPriceSummary(summary);
  if (!priceNew && !priceUsed) return null;

  return {
    priceNew,
    priceUsed,
    sourceUrl: absoluteLeDenicheurUrl(detail?.pathName ?? product.pathName),
    productName: detail?.name ?? product.name ?? undefined,
    productGtin: productGtin ?? undefined,
    offerCount: summary?.count ?? undefined,
    coverUrl: detail?.media?.first ?? product.media?.first ?? null,
  };
}

function parseOfferNode(node: LeDenicheurOfferNode): LeDenicheurPrices | null {
  const priceNew = priceToCents(node.offerPrice?.regular);
  if (!priceNew) return null;
  return {
    priceNew,
    sourceUrl: node.externalUri || undefined,
    productName: node.name || undefined,
    merchantName: node.store?.name || undefined,
    offerCount: 1,
    coverUrl: node.media?.first || null,
  };
}

export function extractLeDenicheurProductGtinsFromHtml(html: string): string[] {
  const seen = new Set<string>();
  const add = (raw: string | null | undefined) => {
    const normalized = normalizeProductBarcode(raw);
    if (normalized) seen.add(normalized);
  };

  const rscBlock = html.match(
    /\\"children\\":\\"GTIN\\"[\s\S]{0,2000}?\\"children\\":\\"([^"\\]+)\\"/,
  );
  if (rscBlock?.[1]) {
    for (const part of rscBlock[1].split(/[,\s]+/)) {
      add(part);
    }
  }

  const commaSeparatedGtins =
    html.match(/>\s*((?:\d{12,14}\s*,\s*)+\d{12,14})\s*</) ??
    html.match(/GTIN[\s\S]{0,800}?((?:\d{12,14}\s*,\s*)+\d{12,14})/i);
  if (commaSeparatedGtins?.[1]) {
    for (const part of commaSeparatedGtins[1].split(/,\s*/)) {
      add(part);
    }
  }

  for (const match of html.matchAll(/"gtin\d*"\s*:\s*"(\d{8,14})"/gi)) {
    add(match[1]);
  }

  const labelProximity = html.match(
    /GTIN[\s\S]{0,400}?>\s*([\d,\s]{12,})\s*</i,
  );
  if (labelProximity?.[1]) {
    for (const part of labelProximity[1].split(/[,\s]+/)) {
      if (part.length >= 12) add(part);
    }
  }

  return [...seen];
}

export function leDenicheurGtinForItem(
  html: string,
  itemBarcode: string,
): string | null {
  const normalizedItem = normalizeProductBarcode(itemBarcode);
  if (!normalizedItem) return null;

  for (const gtin of extractLeDenicheurProductGtinsFromHtml(html)) {
    if (barcodesEquivalent(gtin, normalizedItem)) {
      return gtin;
    }
  }
  return null;
}

export type LeDenicheurGtinAlignment = "confirmed" | "contradicted" | "unknown";

export function leDenicheurProductGtinAlignment(
  html: string,
  itemBarcode: string,
): LeDenicheurGtinAlignment {
  const gtins = extractLeDenicheurProductGtinsFromHtml(html);
  if (gtins.length === 0) return "unknown";
  return leDenicheurGtinForItem(html, itemBarcode)
    ? "confirmed"
    : "contradicted";
}

export function extractLeDenicheurProductGtinFromHtml(
  html: string,
): string | null {
  return extractLeDenicheurProductGtinsFromHtml(html)[0] ?? null;
}

type ProductPageGtinProbe = {
  productGtin: string | null;
  gtinAlignment: LeDenicheurGtinAlignment;
};

async function fetchLeDenicheurProductPageHtml(
  productId: number,
): Promise<string | null> {
  try {
    const response = await axios.get(`${BASE_URL}/product.php?p=${productId}`, {
      headers: {
        "User-Agent": HEADERS["User-Agent"],
        "Accept-Language": HEADERS["Accept-Language"],
      },
      timeout: 6000,
      validateStatus: (status) => status >= 200 && status < 500,
    });
    if (response.status >= 400 || typeof response.data !== "string") {
      return null;
    }
    return response.data;
  } catch {
    return null;
  }
}

async function probeLeDenicheurProductPageGtin(
  productId: number,
  itemBarcode?: string | null,
): Promise<ProductPageGtinProbe> {
  const html = await fetchLeDenicheurProductPageHtml(productId);
  if (!html) {
    return { productGtin: null, gtinAlignment: "unknown" };
  }
  if (!itemBarcode?.trim()) {
    return {
      productGtin: extractLeDenicheurProductGtinFromHtml(html),
      gtinAlignment: "unknown",
    };
  }
  const gtinAlignment = leDenicheurProductGtinAlignment(html, itemBarcode);
  return {
    productGtin: leDenicheurGtinForItem(html, itemBarcode),
    gtinAlignment,
  };
}

async function fetchLeDenicheurProductGtinAlignment(
  productId: number,
  itemBarcode: string,
): Promise<LeDenicheurGtinAlignment> {
  const probe = await probeLeDenicheurProductPageGtin(productId, itemBarcode);
  return probe.gtinAlignment;
}

/** Fetches the product-page GTIN and checks it against the item barcode. */
export async function leDenicheurProductUrlContradictsItem(
  sourceUrl: string,
  itemBarcode: string,
  itemTitle?: string | null,
): Promise<boolean> {
  const productId = extractLeDenicheurProductId(sourceUrl);
  if (!productId) return false;
  const alignment = await fetchLeDenicheurProductGtinAlignment(
    productId,
    itemBarcode,
  );
  if (alignment === "contradicted") return true;
  if (alignment === "confirmed") return false;
  if (!itemTitle?.trim()) return false;

  const detail = await fetchProductDetail(productId);
  return retailerCatalogTitleContradictsItem({
    productTitle: detail?.name,
    itemTitle,
  });
}

function productPassesItemBarcodeGate(input: {
  product: LeDenicheurProductNode;
  productGtin?: string | null;
  gtinAlignment?: LeDenicheurGtinAlignment;
  query: string;
  options?: LeDenicheurFetchOptions;
}): boolean {
  const { product, productGtin, gtinAlignment, query, options } = input;
  const itemBarcode = options?.itemBarcode;
  if (!itemBarcode?.trim()) return true;

  if (
    retailerBarcodeContradictsItem({
      productUrl: product.pathName,
      productBarcode: productGtin,
      itemBarcode,
    })
  ) {
    return false;
  }

  if (gtinAlignment === "contradicted") return false;
  if (gtinAlignment === "confirmed" || productGtin) return true;

  const anchorTitle = options?.itemTitle?.trim() || query;
  if (
    retailerCatalogTitleContradictsItem({
      productTitle: product.name,
      itemTitle: anchorTitle,
    })
  ) {
    return false;
  }

  return (
    catalogTitleAlignedWithItem(anchorTitle, product.name ?? "") &&
    isProbablyRelevant(anchorTitle, product.name, options)
  );
}

async function fetchProductDetail(
  productId: number,
): Promise<LeDenicheurProductNode | null> {
  try {
    const response = await axios.post(
      BFF_URL,
      {
        query: PRODUCT_DETAIL_QUERY,
        variables: { id: productId },
      },
      {
        headers: HEADERS,
        timeout: 6000,
        validateStatus: (status) => status >= 200 && status < 500,
      },
    );

    if (response.status >= 400) return null;
    const envelope = response.data as LeDenicheurProductDetailEnvelope;
    return envelope?.data?.product ?? envelope?.product ?? null;
  } catch {
    return null;
  }
}

/**
 * The detail POST exists to recover the used/alternative price the search list
 * often omits. Skip that round-trip only when the search node already carries
 * *both* new and used prices — then the detail fetch is pure redundancy, so we
 * halve latency without dropping pricing data.
 */
function searchNodeHasCompletePricing(
  product: LeDenicheurProductNode,
): boolean {
  const { priceNew, priceUsed } = parseLeDenicheurPriceSummary(
    product.priceSummary,
  );
  return priceNew != null && priceUsed != null;
}

async function resolveProductNode(
  product: LeDenicheurProductNode,
  options?: LeDenicheurFetchOptions,
  query = "",
  probe?: ProductPageGtinProbe,
): Promise<LeDenicheurPrices | null> {
  const productId = extractLeDenicheurProductId(product.pathName);
  const resolvedProbe =
    probe ??
    (productId
      ? await probeLeDenicheurProductPageGtin(productId, options?.itemBarcode)
      : { productGtin: null, gtinAlignment: "unknown" as const });
  if (
    !productPassesItemBarcodeGate({
      product,
      productGtin: resolvedProbe.productGtin,
      gtinAlignment: resolvedProbe.gtinAlignment,
      query,
      options,
    })
  ) {
    return null;
  }

  if (searchNodeHasCompletePricing(product)) {
    return buildProductPrices(product, null, resolvedProbe.productGtin);
  }
  const detail = productId ? await fetchProductDetail(productId) : null;
  return buildProductPrices(product, detail, resolvedProbe.productGtin);
}

async function parseSearchResponse(
  data: unknown,
  query: string,
  options?: LeDenicheurFetchOptions,
): Promise<LeDenicheurPrices | null> {
  const envelope = data as LeDenicheurSearchEnvelope;
  const nodes =
    envelope?.data?.newSearch?.results?.products?.nodes ??
    envelope?.newSearch?.results?.products?.nodes;
  if (!Array.isArray(nodes)) return null;

  const productNodes = nodes.filter(
    (node) => (node as LeDenicheurNode).__typename !== "Offer",
  ) as LeDenicheurProductNode[];

  if (options?.itemBarcode) {
    const probeCache = new Map<number, ProductPageGtinProbe>();

    const loadProbe = async (productId: number) => {
      const cached = probeCache.get(productId);
      if (cached) return cached;
      const probe = await probeLeDenicheurProductPageGtin(
        productId,
        options.itemBarcode,
      );
      probeCache.set(productId, probe);
      return probe;
    };

    for (const product of productNodes) {
      const productId = extractLeDenicheurProductId(product.pathName);
      if (!productId) continue;
      const probe = await loadProbe(productId);
      if (probe.gtinAlignment !== "confirmed") continue;
      const result = await resolveProductNode(product, options, query, probe);
      if (result) return { ...result, matchedQuery: query };
    }

    for (const product of productNodes) {
      const productId = extractLeDenicheurProductId(product.pathName);
      if (!productId) continue;
      const probe = await loadProbe(productId);
      if (probe.gtinAlignment === "contradicted") continue;
      const result = await resolveProductNode(product, options, query, probe);
      if (result) return { ...result, matchedQuery: query };
    }

    return null;
  }

  for (const node of nodes) {
    const productName = (node as LeDenicheurNode).name;
    if ((node as LeDenicheurNode).__typename === "Offer") {
      if (!isProbablyRelevant(query, productName, options)) continue;
      const result = parseOfferNode(node as LeDenicheurOfferNode);
      if (result) return { ...result, matchedQuery: query };
      continue;
    }

    const product = node as LeDenicheurProductNode;
    if (!isProbablyRelevant(query, productName, options)) {
      continue;
    }

    const result = await resolveProductNode(product, options, query);
    if (result) return { ...result, matchedQuery: query };
  }

  return null;
}

async function fetchSingleQuery(
  query: string,
  options?: LeDenicheurFetchOptions,
): Promise<LeDenicheurPrices | null> {
  const response = await axios.post(
    BFF_URL,
    {
      query: SEARCH_QUERY,
      variables: {
        query,
        offset: 0,
        limit: options?.itemBarcode ? 24 : 5,
      },
    },
    {
      headers: HEADERS,
      timeout: 6000,
      validateStatus: (status) => status >= 200 && status < 500,
    },
  );

  if (response.status >= 400) {
    console.warn(
      `[LeDenicheur] BFF returned ${response.status} for query "${query}"`,
    );
    return null;
  }

  return parseSearchResponse(response.data, query, options);
}

export type LeDenicheurFetchOptions = {
  itemBarcode?: string | null;
  itemTitle?: string | null;
};

export async function fetchPricesFromLeDenicheur(
  queryOrQueries: string | string[],
  options?: LeDenicheurFetchOptions,
): Promise<LeDenicheurPrices | null> {
  const queries = uniqueQueries(queryOrQueries);
  if (queries.length === 0) return null;

  for (const query of queries) {
    try {
      console.log(`[LeDenicheur] Querying: ${query}`);
      const result = await fetchSingleQuery(query, options);
      if (result) return result;
    } catch (error) {
      console.error(
        `[LeDenicheur] Error fetching prices for "${query}":`,
        error instanceof Error ? error.message : error,
      );
    }
  }

  return null;
}

export async function pingLeDenicheur(): Promise<{
  ok: boolean;
  latency: number;
  error?: string;
}> {
  const start = Date.now();
  try {
    const result = await fetchSingleQuery("iphone 15");
    return {
      ok: !!result,
      latency: Date.now() - start,
      error: result ? undefined : "No product returned",
    };
  } catch (error) {
    return {
      ok: false,
      latency: Date.now() - start,
      error:
        (error instanceof Error && error.message) || "LeDenicheur unreachable",
    };
  }
}
