export type AchatMoinsCherSearchHit = {
  productId: string;
  title: string;
};

const SEARCH_TTL_MS = 15 * 60 * 1000;
const PRODUCT_HTML_TTL_MS = 30 * 60 * 1000;

type TimedEntry<T> = { expires: number; value: T };

const searchHitsCache = new Map<
  string,
  TimedEntry<AchatMoinsCherSearchHit[]>
>();
const productHtmlCache = new Map<string, TimedEntry<string>>();

function normalizeSearchKey(query: string): string {
  return query.trim().toLowerCase().replace(/\s+/g, " ");
}

export function resetAchatMoinsCherResponseCacheForTests(): void {
  searchHitsCache.clear();
  productHtmlCache.clear();
}

export function getCachedAchatMoinsCherSearchHits(
  query: string,
): AchatMoinsCherSearchHit[] | undefined {
  const key = normalizeSearchKey(query);
  if (!key) return undefined;
  const cached = searchHitsCache.get(key);
  if (!cached || cached.expires <= Date.now()) {
    searchHitsCache.delete(key);
    return undefined;
  }
  return cached.value;
}

export function cacheAchatMoinsCherSearchHits(
  query: string,
  hits: AchatMoinsCherSearchHit[],
): void {
  const key = normalizeSearchKey(query);
  if (!key) return;
  searchHitsCache.set(key, {
    expires: Date.now() + SEARCH_TTL_MS,
    value: hits,
  });
}

export function getCachedAchatMoinsCherProductHtml(
  productId: string,
): string | undefined {
  const key = productId.trim();
  if (!key) return undefined;
  const cached = productHtmlCache.get(key);
  if (!cached || cached.expires <= Date.now()) {
    productHtmlCache.delete(key);
    return undefined;
  }
  return cached.value;
}

export function cacheAchatMoinsCherProductHtml(
  productId: string,
  html: string,
): void {
  const key = productId.trim();
  if (!key) return;
  productHtmlCache.set(key, {
    expires: Date.now() + PRODUCT_HTML_TTL_MS,
    value: html,
  });
}
