import axios from "axios";

export interface LeDenicheurPrices {
  priceNew?: number;
  sourceUrl?: string;
  productName?: string;
  merchantName?: string;
  offerCount?: number;
  coverUrl?: string | null;
  matchedQuery?: string;
}

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

type LeDenicheurProductNode = {
  __typename?: "Product";
  name?: string | null;
  pathName?: string | null;
  priceSummary?: {
    regular?: number | string | null;
    alternative?: number | string | null;
    inStock?: number | string | null;
    count?: number | null;
  } | null;
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

function parseNode(node: LeDenicheurNode): LeDenicheurPrices | null {
  if (node.__typename === "Offer") {
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

  const product = node as LeDenicheurProductNode;
  const regularPrice = priceToCents(product.priceSummary?.regular);
  const inStockPrice = priceToCents(product.priceSummary?.inStock);
  const fallbackPrice = priceToCents(product.priceSummary?.alternative);
  const priceNew = regularPrice ?? inStockPrice ?? fallbackPrice;
  if (!priceNew) return null;

  return {
    priceNew,
    sourceUrl: absoluteLeDenicheurUrl(product.pathName),
    productName: product.name || undefined,
    offerCount: product.priceSummary?.count ?? undefined,
    coverUrl: product.media?.first || null,
  };
}

function parseSearchResponse(
  data: unknown,
  query: string,
): LeDenicheurPrices | null {
  const nodes =
    (data as any)?.data?.newSearch?.results?.products?.nodes ??
    (data as any)?.newSearch?.results?.products?.nodes;
  if (!Array.isArray(nodes)) return null;

  for (const node of nodes) {
    const productName = (node as LeDenicheurNode).name;
    if (!isProbablyRelevant(query, productName)) continue;
    const result = parseNode(node as LeDenicheurNode);
    if (result) return result;
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

  const result = parseSearchResponse(response.data, query);
  return result ? { ...result, matchedQuery: query } : null;
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
