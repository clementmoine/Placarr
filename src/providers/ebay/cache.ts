import type { EbayPrices, EbayProduct } from "./types";

const GTIN_CACHE_TTL_MS = 30 * 60 * 1000;
const SEARCH_CACHE_TTL_MS = 15 * 60 * 1000;
const PRICE_CACHE_TTL_MS = 30 * 60 * 1000;
const BROWSE_SUMMARY_TTL_MS = 30 * 60 * 1000;

type TimedEntry<T> = { expires: number; value: T };

/** Raw Browse `itemSummaries` — shared SearchYield for listings + prices. */
export type EbayBrowseSummary = {
  title?: string | null;
  image?: { imageUrl?: string | null } | null;
  thumbnailImages?: Array<{ imageUrl?: string | null }> | null;
  price?: { value?: string | null; currency?: string | null } | null;
  condition?: string | null;
  itemWebUrl?: string | null;
};

const gtinCache = new Map<string, TimedEntry<EbayProduct[]>>();
const searchCache = new Map<string, TimedEntry<EbayProduct[]>>();
const priceCache = new Map<string, TimedEntry<EbayPrices | null>>();
const browseSummaryCache = new Map<string, TimedEntry<EbayBrowseSummary[]>>();

function normalizeGtinKey(gtin: string): string {
  return gtin.replace(/[^\d]/g, "").trim();
}

function normalizeSearchKey(query: string): string {
  return query.trim().toLowerCase().replace(/\s+/g, " ");
}

export function ebayBrowseGtinCacheKey(gtin: string): string {
  const digits = normalizeGtinKey(gtin);
  return digits ? `gtin:${digits}` : "";
}

export function ebayBrowseQueryCacheKey(query: string): string {
  const key = normalizeSearchKey(query);
  return key ? `q:${key}` : "";
}

export function resetEbayResponseCacheForTests(): void {
  gtinCache.clear();
  searchCache.clear();
  priceCache.clear();
  browseSummaryCache.clear();
}

export function getCachedEbayBrowseSummaries(
  cacheKey: string,
): EbayBrowseSummary[] | undefined {
  if (!cacheKey) return undefined;
  const cached = browseSummaryCache.get(cacheKey);
  if (!cached || cached.expires <= Date.now()) {
    browseSummaryCache.delete(cacheKey);
    return undefined;
  }
  return cached.value;
}

export function cacheEbayBrowseSummaries(
  cacheKey: string,
  items: EbayBrowseSummary[],
): void {
  if (!cacheKey) return;
  browseSummaryCache.set(cacheKey, {
    expires: Date.now() + BROWSE_SUMMARY_TTL_MS,
    value: items,
  });
}

export function getCachedEbayGtinProducts(
  gtin: string,
): EbayProduct[] | undefined {
  const key = normalizeGtinKey(gtin);
  if (!key) return undefined;
  const cached = gtinCache.get(key);
  if (!cached || cached.expires <= Date.now()) {
    gtinCache.delete(key);
    return undefined;
  }
  return cached.value;
}

export function cacheEbayGtinProducts(
  gtin: string,
  products: EbayProduct[],
): void {
  const key = normalizeGtinKey(gtin);
  if (!key) return;
  gtinCache.set(key, {
    expires: Date.now() + GTIN_CACHE_TTL_MS,
    value: products,
  });
}

export function getCachedEbaySearchProducts(
  query: string,
): EbayProduct[] | undefined {
  const key = normalizeSearchKey(query);
  if (!key) return undefined;
  const cached = searchCache.get(key);
  if (!cached || cached.expires <= Date.now()) {
    searchCache.delete(key);
    return undefined;
  }
  return cached.value;
}

export function cacheEbaySearchProducts(
  query: string,
  products: EbayProduct[],
): void {
  const key = normalizeSearchKey(query);
  if (!key) return;
  searchCache.set(key, {
    expires: Date.now() + SEARCH_CACHE_TTL_MS,
    value: products,
  });
}

export function getCachedEbayPrices(
  query: string,
): EbayPrices | null | undefined {
  const key = normalizeSearchKey(query);
  if (!key) return undefined;
  const cached = priceCache.get(key);
  if (!cached || cached.expires <= Date.now()) {
    priceCache.delete(key);
    return undefined;
  }
  return cached.value;
}

export function cacheEbayPrices(
  query: string,
  prices: EbayPrices | null,
): void {
  const key = normalizeSearchKey(query);
  if (!key) return;
  priceCache.set(key, {
    expires: Date.now() + PRICE_CACHE_TTL_MS,
    value: prices,
  });
}
