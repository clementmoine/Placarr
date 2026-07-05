import type { EbayPrices, EbayProduct } from "./types";

const GTIN_CACHE_TTL_MS = 30 * 60 * 1000;
const SEARCH_CACHE_TTL_MS = 15 * 60 * 1000;
const PRICE_CACHE_TTL_MS = 30 * 60 * 1000;

type TimedEntry<T> = { expires: number; value: T };

const gtinCache = new Map<string, TimedEntry<EbayProduct[]>>();
const searchCache = new Map<string, TimedEntry<EbayProduct[]>>();
const priceCache = new Map<string, TimedEntry<EbayPrices | null>>();

function normalizeGtinKey(gtin: string): string {
  return gtin.replace(/[^\d]/g, "").trim();
}

function normalizeSearchKey(query: string): string {
  return query.trim().toLowerCase().replace(/\s+/g, " ");
}

export function resetEbayResponseCacheForTests(): void {
  gtinCache.clear();
  searchCache.clear();
  priceCache.clear();
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
