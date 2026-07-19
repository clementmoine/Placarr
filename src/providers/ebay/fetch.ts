import axios from "axios";

import { priceListingMatchesAnyItemName } from "@/core/identify/titleUtils";

import { fetchFromEbayCatalog } from "./catalog";
import {
  cacheEbayGtinProducts,
  cacheEbaySearchProducts,
  cacheEbayPrices,
  getCachedEbayGtinProducts,
  getCachedEbaySearchProducts,
  getCachedEbayPrices,
} from "./cache";
import { bestEbayCoverUrl } from "./coverUrl";
import {
  EBAY_BROWSE_SEARCH_URL,
  EBAY_REQUEST_TIMEOUT_MS,
  getEbayEnv,
  getEbayMarketplaceId,
  type EbayCredentials,
} from "./env";
import { getEbayAccessToken, getEbayBrowseAccessToken } from "./oauth";
import type { EbayPrices, EbayProduct } from "./types";

export type { EbayPrices, EbayProduct } from "./types";
export { resetEbayTokenCache } from "./oauth";
export { resetEbayResponseCacheForTests } from "./cache";

type EbayItemSummary = {
  title?: string | null;
  image?: { imageUrl?: string | null } | null;
  thumbnailImages?: Array<{ imageUrl?: string | null }> | null;
  price?: { value?: string | null; currency?: string | null } | null;
  condition?: string | null;
  itemWebUrl?: string | null;
};

function priceToCents(value?: string | null): number | null {
  if (value === undefined || value === null) return null;
  const amount = Number(String(value).replace(/\s/g, "").replace(",", "."));
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return Math.round(amount * 100);
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle];
  return Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

function isBarcodeLike(value: string) {
  return /^\d{8,14}$/.test(value.replace(/[^\d]/g, ""));
}

function matchesExpectedTitle(title: string, expectedNames: string[]) {
  const names = expectedNames.filter(Boolean);
  if (names.length === 0) return true;
  const textNames = names.filter((name) => !isBarcodeLike(name));
  if (textNames.length === 0) return true;
  return priceListingMatchesAnyItemName(textNames, title);
}

function isNewCondition(condition?: string | null): boolean {
  return /^new/i.test(String(condition ?? "").trim());
}

type EbayBrowseSearchResult = {
  items: EbayItemSummary[];
  retryableFailure: boolean;
};

async function searchEbayBrowse(
  params: Record<string, string>,
  credentials: EbayCredentials,
): Promise<EbayBrowseSearchResult> {
  const token = await getEbayBrowseAccessToken(credentials);
  if (!token) return { items: [], retryableFailure: false };
  const res = await axios.get(EBAY_BROWSE_SEARCH_URL, {
    params: { limit: "10", ...params },
    headers: {
      Authorization: `Bearer ${token}`,
      "X-EBAY-C-MARKETPLACE-ID": getEbayMarketplaceId(),
      Accept: "application/json",
    },
    timeout: EBAY_REQUEST_TIMEOUT_MS,
    validateStatus: () => true,
  });
  if (res.status === 429 || res.status >= 500) {
    console.warn(
      `[eBay] Browse search transient failure (${res.status}) for ${JSON.stringify(params)}`,
    );
    return { items: [], retryableFailure: true };
  }
  if (res.status !== 200) return { items: [], retryableFailure: false };
  const items = res.data?.itemSummaries;
  return {
    items: Array.isArray(items) ? (items as EbayItemSummary[]) : [],
    retryableFailure: false,
  };
}

function listingsToProducts(
  items: EbayItemSummary[],
  expectedNames: string[],
): EbayProduct[] {
  const out: EbayProduct[] = [];
  for (const item of items) {
    const title = item.title?.trim();
    if (!title) continue;
    if (
      expectedNames.length > 0 &&
      !matchesExpectedTitle(title, expectedNames)
    ) {
      continue;
    }
    const coverUrl = bestEbayCoverUrl(
      item.image?.imageUrl || item.thumbnailImages?.[0]?.imageUrl || null,
    );
    if (!out.some((p) => p.name.toLowerCase() === title.toLowerCase())) {
      out.push({ name: title, coverUrl, catalog: false });
    }
  }
  return out.slice(0, 10);
}

function mergeCatalogAndListings(
  catalog: EbayProduct[],
  listings: EbayProduct[],
): EbayProduct[] {
  const out = [...catalog];
  for (const listing of listings) {
    const duplicate = out.some(
      (entry) => entry.name.toLowerCase() === listing.name.toLowerCase(),
    );
    if (!duplicate) out.push(listing);
  }
  return out.slice(0, 12);
}

async function fetchBrowseListingsByGtin(
  gtin: string,
  expectedNames: string[],
  credentials: EbayCredentials,
): Promise<EbayProduct[]> {
  const { items } = await searchEbayBrowse({ gtin }, credentials);
  return listingsToProducts(items, expectedNames);
}

async function fetchBrowseListingsByEpid(
  epid: string,
  expectedNames: string[],
  credentials: EbayCredentials,
): Promise<EbayProduct[]> {
  const { items } = await searchEbayBrowse({ epid }, credentials);
  return listingsToProducts(items, expectedNames);
}

/**
 * GTIN pipeline: Catalog API (canonical product) → Browse GTIN → Browse ePID
 * fallback when listings are sparse.
 */
async function fetchEbayProductsByGtin(
  barcode: string,
  expectedNames: string[] = [],
): Promise<EbayProduct[]> {
  const cleaned = barcode.replace(/[^\d]/g, "").trim();
  if (!cleaned) return [];
  const credentials = getEbayEnv();
  if (!credentials) return [];

  const catalog = await fetchFromEbayCatalog(cleaned, expectedNames);
  let listings = await fetchBrowseListingsByGtin(
    cleaned,
    expectedNames,
    credentials,
  );

  if (listings.length === 0) {
    for (const product of catalog.slice(0, 2)) {
      if (!product.epid) continue;
      listings = await fetchBrowseListingsByEpid(
        product.epid,
        expectedNames,
        credentials,
      );
      if (listings.length > 0) break;
    }
  }

  return mergeCatalogAndListings(catalog, listings);
}

/** Resolve a barcode to eBay catalog + listing hits (name + cover). */
export async function fetchFromEbay(
  barcode: string,
  expectedNames: string[] = [],
): Promise<EbayProduct[]> {
  const cleaned = barcode.replace(/[^\d]/g, "").trim();
  if (!cleaned) return [];

  const cached = getCachedEbayGtinProducts(cleaned);
  if (cached) {
    console.info(`[eBay] GTIN cache hit for ${cleaned}`);
    return cached;
  }

  console.log(`[eBay] Querying GTIN: ${cleaned}`);
  try {
    const products = await fetchEbayProductsByGtin(barcode, expectedNames);
    cacheEbayGtinProducts(cleaned, products);
    return products;
  } catch (error: unknown) {
    console.error(
      `[eBay] Error querying GTIN ${barcode}:`,
      error instanceof Error ? error.message : error,
    );
    return [];
  }
}

/** Keyword search (used by the metadata adapter when a barcode finds nothing). */
export async function fetchEbayProductsByQuery(
  query: string,
  expectedNames: string[] = [],
): Promise<EbayProduct[]> {
  const cleaned = query.trim();
  if (!cleaned) return [];
  const credentials = getEbayEnv();
  if (!credentials) return [];

  const cached = getCachedEbaySearchProducts(cleaned);
  if (cached) {
    console.info(`[eBay] Search cache hit for "${cleaned}"`);
    return cached;
  }

  console.log(`[eBay] Querying search: ${cleaned}`);
  try {
    const { items, retryableFailure } = await searchEbayBrowse(
      { q: cleaned },
      credentials,
    );
    const products = listingsToProducts(items, expectedNames);
    if (!retryableFailure) {
      cacheEbaySearchProducts(cleaned, products);
    }
    return products;
  } catch (error: unknown) {
    console.error(
      `[eBay] Error querying ${cleaned}:`,
      error instanceof Error ? error.message : error,
    );
    return [];
  }
}

/** Median new/used prices (cents) from the listings matching the query. */
export async function fetchPricesFromEbay(
  query: string,
  expectedNames: string[] = [],
): Promise<EbayPrices | null> {
  const cleaned = query.trim();
  if (!cleaned) return null;
  const credentials = getEbayEnv();
  if (!credentials) return null;

  const cached = getCachedEbayPrices(cleaned);
  if (cached !== undefined) {
    console.info(`[eBay] Price cache hit for "${cleaned}"`);
    return cached;
  }

  try {
    const isBarcode = isBarcodeLike(cleaned);
    const { items, retryableFailure } = await searchEbayBrowse(
      isBarcode ? { gtin: cleaned.replace(/[^\d]/g, "") } : { q: cleaned },
      credentials,
    );
    if (retryableFailure) return null;

    const newPrices: number[] = [];
    const usedPrices: number[] = [];
    let firstTitle: string | null = null;
    let firstHref: string | null = null;
    let offerCount = 0;

    for (const item of items) {
      const title = item.title?.trim();
      if (!title || !matchesExpectedTitle(title, expectedNames)) continue;
      const price = priceToCents(item.price?.value);
      if (price === null) continue;
      offerCount++;
      if (isNewCondition(item.condition)) newPrices.push(price);
      else usedPrices.push(price);
      firstTitle = firstTitle || title;
      firstHref = firstHref || item.itemWebUrl || null;
    }

    const priceNew = median(newPrices);
    const priceUsed = median(usedPrices);
    if (priceNew === null && priceUsed === null) {
      cacheEbayPrices(cleaned, null);
      return null;
    }

    const result = {
      priceNew: priceNew ?? undefined,
      priceUsed: priceUsed ?? undefined,
      productName: firstTitle || undefined,
      sourceUrl: firstHref || undefined,
      offerCount,
    };
    cacheEbayPrices(cleaned, result);
    return result;
  } catch (error: unknown) {
    console.error(
      `[eBay Prices] Error querying ${cleaned}:`,
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}

export async function pingEbay(): Promise<{
  ok: boolean;
  latency: number;
  error?: string;
}> {
  const start = Date.now();
  const credentials = getEbayEnv();
  if (!credentials) {
    return { ok: false, latency: 0, error: "eBay credentials missing" };
  }
  try {
    const token = await getEbayAccessToken(credentials);
    return {
      ok: !!token,
      latency: Date.now() - start,
      error: token ? undefined : "OAuth token request failed",
    };
  } catch (error: unknown) {
    return {
      ok: false,
      latency: Date.now() - start,
      error: error instanceof Error ? error.message : "eBay unreachable",
    };
  }
}
