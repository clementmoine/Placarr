import axios from "axios";

import { priceListingMatchesAnyItemName } from "@/core/identify/titleUtils";

import { fetchFromEbayCatalog } from "./catalog";
import {
  cacheEbayBrowseSummaries,
  cacheEbayGtinProducts,
  cacheEbaySearchProducts,
  cacheEbayPrices,
  ebayBrowseGtinCacheKey,
  ebayBrowseQueryCacheKey,
  getCachedEbayBrowseSummaries,
  getCachedEbayGtinProducts,
  getCachedEbaySearchProducts,
  getCachedEbayPrices,
  type EbayBrowseSummary,
} from "./cache";
import {
  ebayBrowseSearchEvidenceUrl,
  promoteEbayBrowseSearchEvidence,
  readEbayBrowseSearchEvidence,
} from "./durableEvidence";
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

type EbayItemSummary = EbayBrowseSummary;

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

export type EbayTitleMatchOptions = {
  shelfType?: string | null;
  /** Reuse Browse SearchYield only — no live API. */
  evidenceOnly?: boolean;
};

function matchesExpectedTitle(
  title: string,
  expectedNames: string[],
  options?: EbayTitleMatchOptions,
) {
  const names = expectedNames.filter(Boolean);
  if (names.length === 0) return true;
  const textNames = names.filter((name) => !isBarcodeLike(name));
  if (textNames.length === 0) return true;
  return priceListingMatchesAnyItemName(textNames, title, {
    shelfType: options?.shelfType,
  });
}

function isNewCondition(condition?: string | null): boolean {
  return /^new/i.test(String(condition ?? "").trim());
}

type EbayBrowseSearchResult = {
  items: EbayItemSummary[];
  retryableFailure: boolean;
};

/** Aggregate median new/used prices from Browse itemSummaries (no getItem). */
export function aggregateEbayPricesFromSummaries(
  items: EbayItemSummary[],
  expectedNames: string[] = [],
  options?: EbayTitleMatchOptions,
): EbayPrices | null {
  const newPrices: number[] = [];
  const usedPrices: number[] = [];
  let firstTitle: string | null = null;
  let firstHref: string | null = null;
  let offerCount = 0;

  for (const item of items) {
    const title = item.title?.trim();
    if (!title || !matchesExpectedTitle(title, expectedNames, options)) {
      continue;
    }
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
  if (priceNew === null && priceUsed === null) return null;

  return {
    priceNew: priceNew ?? undefined,
    priceUsed: priceUsed ?? undefined,
    productName: firstTitle || undefined,
    sourceUrl: firstHref || undefined,
    offerCount,
  };
}

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

/**
 * Browse once (or reuse SearchYield): RAM L1 → durable L2 → live.
 * Callers mine listings and/or prices from the same array.
 */
async function searchEbayBrowseCached(
  cacheKey: string,
  params: Record<string, string>,
  credentials: EbayCredentials | null,
  options?: { evidenceOnly?: boolean },
): Promise<EbayBrowseSearchResult> {
  const cached = getCachedEbayBrowseSummaries(cacheKey);
  if (cached) {
    return { items: cached, retryableFailure: false };
  }

  const searchUrl = ebayBrowseSearchEvidenceUrl(params);
  const fromEvidence = await readEbayBrowseSearchEvidence(searchUrl);
  if (fromEvidence) {
    console.info(`[eBay] Browse evidence hit for ${searchUrl}`);
    cacheEbayBrowseSummaries(cacheKey, fromEvidence);
    return { items: fromEvidence, retryableFailure: false };
  }
  if (options?.evidenceOnly || !credentials) {
    return { items: [], retryableFailure: false };
  }

  const result = await searchEbayBrowse(params, credentials);
  if (!result.retryableFailure) {
    cacheEbayBrowseSummaries(cacheKey, result.items);
    await promoteEbayBrowseSearchEvidence(searchUrl, result.items);
  }
  return result;
}

function listingsToProducts(
  items: EbayItemSummary[],
  expectedNames: string[],
  options?: EbayTitleMatchOptions,
): EbayProduct[] {
  const out: EbayProduct[] = [];
  for (const item of items) {
    const title = item.title?.trim();
    if (!title) continue;
    if (
      expectedNames.length > 0 &&
      !matchesExpectedTitle(title, expectedNames, options)
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
  credentials: EbayCredentials | null,
  options?: EbayTitleMatchOptions,
): Promise<EbayProduct[]> {
  const cacheKey = ebayBrowseGtinCacheKey(gtin);
  const { items } = await searchEbayBrowseCached(
    cacheKey,
    { gtin },
    credentials,
    { evidenceOnly: options?.evidenceOnly },
  );
  return listingsToProducts(items, expectedNames, options);
}

async function fetchBrowseListingsByEpid(
  epid: string,
  expectedNames: string[],
  credentials: EbayCredentials | null,
  options?: EbayTitleMatchOptions,
): Promise<EbayProduct[]> {
  const cacheKey = ebayBrowseQueryCacheKey(`epid:${epid}`);
  const { items } = await searchEbayBrowseCached(
    cacheKey,
    { epid },
    credentials,
    { evidenceOnly: options?.evidenceOnly },
  );
  return listingsToProducts(items, expectedNames, options);
}

/**
 * GTIN pipeline: Catalog API (canonical product) → Browse GTIN → Browse ePID
 * fallback when listings are sparse.
 */
async function fetchEbayProductsByGtin(
  barcode: string,
  expectedNames: string[] = [],
  options?: EbayTitleMatchOptions,
): Promise<EbayProduct[]> {
  const cleaned = barcode.replace(/[^\d]/g, "").trim();
  if (!cleaned) return [];
  const credentials = getEbayEnv();
  if (!credentials && !options?.evidenceOnly) return [];

  // Catalog API is always live HTTP — skip under evidence-only reconfront.
  const catalog = options?.evidenceOnly
    ? []
    : await fetchFromEbayCatalog(cleaned, expectedNames, options);
  let listings = await fetchBrowseListingsByGtin(
    cleaned,
    expectedNames,
    credentials,
    options,
  );

  if (listings.length === 0) {
    for (const product of catalog.slice(0, 2)) {
      if (!product.epid) continue;
      listings = await fetchBrowseListingsByEpid(
        product.epid,
        expectedNames,
        credentials,
        options,
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
  options?: EbayTitleMatchOptions,
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
    const products = await fetchEbayProductsByGtin(
      barcode,
      expectedNames,
      options,
    );
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
  options?: EbayTitleMatchOptions,
): Promise<EbayProduct[]> {
  const cleaned = query.trim();
  if (!cleaned) return [];
  const credentials = getEbayEnv();
  if (!credentials && !options?.evidenceOnly) return [];

  const cached = getCachedEbaySearchProducts(cleaned);
  if (cached) {
    console.info(`[eBay] Search cache hit for "${cleaned}"`);
    return cached;
  }

  console.log(`[eBay] Querying search: ${cleaned}`);
  try {
    const { items, retryableFailure } = await searchEbayBrowseCached(
      ebayBrowseQueryCacheKey(cleaned),
      { q: cleaned },
      credentials,
      { evidenceOnly: options?.evidenceOnly },
    );
    const products = listingsToProducts(items, expectedNames, options);
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
  options?: EbayTitleMatchOptions,
): Promise<EbayPrices | null> {
  const cleaned = query.trim();
  if (!cleaned) return null;
  const credentials = getEbayEnv();
  if (!credentials && !options?.evidenceOnly) return null;

  const cached = getCachedEbayPrices(cleaned);
  if (cached !== undefined) {
    console.info(`[eBay] Price cache hit for "${cleaned}"`);
    return cached;
  }

  try {
    const isBarcode = isBarcodeLike(cleaned);
    const digits = cleaned.replace(/[^\d]/g, "");
    const cacheKey = isBarcode
      ? ebayBrowseGtinCacheKey(digits)
      : ebayBrowseQueryCacheKey(cleaned);
    const browseParams: Record<string, string> = isBarcode
      ? { gtin: digits }
      : { q: cleaned };
    const { items, retryableFailure } = await searchEbayBrowseCached(
      cacheKey,
      browseParams,
      credentials,
      { evidenceOnly: options?.evidenceOnly },
    );
    if (retryableFailure) return null;

    const result = aggregateEbayPricesFromSummaries(
      items,
      expectedNames,
      options,
    );
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
