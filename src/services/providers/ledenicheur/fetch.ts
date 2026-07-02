import axios from "axios";

import type { LeDenicheurPrices } from "@/lib/barcode/lookup/providerTypes";

export type { LeDenicheurPrices } from "@/lib/barcode/lookup/providerTypes";

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

function isProbablyRelevant(query: string, productName?: string | null) {
  if (isBarcodeLike(query)) return true;
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
): LeDenicheurPrices | null {
  const summary = detail?.priceSummary ?? product.priceSummary;
  const { priceNew, priceUsed } = parseLeDenicheurPriceSummary(summary);
  if (!priceNew && !priceUsed) return null;

  return {
    priceNew,
    priceUsed,
    sourceUrl: absoluteLeDenicheurUrl(detail?.pathName ?? product.pathName),
    productName: detail?.name ?? product.name ?? undefined,
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
    return (
      (response.data as any)?.data?.product ??
      (response.data as any)?.product ??
      null
    );
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
function searchNodeHasCompletePricing(product: LeDenicheurProductNode): boolean {
  const { priceNew, priceUsed } = parseLeDenicheurPriceSummary(
    product.priceSummary,
  );
  return priceNew != null && priceUsed != null;
}

async function resolveProductNode(
  product: LeDenicheurProductNode,
): Promise<LeDenicheurPrices | null> {
  if (searchNodeHasCompletePricing(product)) {
    return buildProductPrices(product, null);
  }
  const productId = extractLeDenicheurProductId(product.pathName);
  const detail = productId ? await fetchProductDetail(productId) : null;
  return buildProductPrices(product, detail);
}

async function parseSearchResponse(
  data: unknown,
  query: string,
): Promise<LeDenicheurPrices | null> {
  const nodes =
    (data as any)?.data?.newSearch?.results?.products?.nodes ??
    (data as any)?.newSearch?.results?.products?.nodes;
  if (!Array.isArray(nodes)) return null;

  for (const node of nodes) {
    const productName = (node as LeDenicheurNode).name;
    if (!isProbablyRelevant(query, productName)) continue;

    const result =
      (node as LeDenicheurNode).__typename === "Offer"
        ? parseOfferNode(node as LeDenicheurOfferNode)
        : await resolveProductNode(node as LeDenicheurProductNode);
    if (result) return { ...result, matchedQuery: query };
  }

  return null;
}

async function fetchSingleQuery(
  query: string,
): Promise<LeDenicheurPrices | null> {
  const response = await axios.post(
    BFF_URL,
    {
      query: SEARCH_QUERY,
      variables: {
        query,
        offset: 0,
        limit: 5,
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

  return parseSearchResponse(response.data, query);
}

export async function fetchPricesFromLeDenicheur(
  queryOrQueries: string | string[],
): Promise<LeDenicheurPrices | null> {
  const queries = uniqueQueries(queryOrQueries);
  if (queries.length === 0) return null;

  for (const query of queries) {
    try {
      console.log(`[LeDenicheur] Querying: ${query}`);
      const result = await fetchSingleQuery(query);
      if (result) return result;
    } catch (error: any) {
      console.error(
        `[LeDenicheur] Error fetching prices for "${query}":`,
        error.message,
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
  } catch (error: any) {
    return {
      ok: false,
      latency: Date.now() - start,
      error: error?.message || "LeDenicheur unreachable",
    };
  }
}
