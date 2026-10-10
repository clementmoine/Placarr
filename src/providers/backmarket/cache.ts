const HTML_TTL_MS = 30 * 60 * 1000;

type TimedEntry = { expires: number; value: string };

const htmlCache = new Map<string, TimedEntry>();

function normalizeCacheKey(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    // Search: keep q= ; product: strip query (canonical).
    if (parsed.pathname.includes("/search")) {
      const q = parsed.searchParams
        .get("q")
        ?.trim()
        .toLowerCase()
        .replace(/\s+/g, " ");
      return q ? `search:${q}` : parsed.toString();
    }
    parsed.search = "";
    return `p:${parsed.toString()}`;
  } catch {
    return url.trim().toLowerCase();
  }
}

export function resetBackMarketResponseCacheForTests(): void {
  htmlCache.clear();
}

export function getCachedBackMarketHtml(url: string): string | undefined {
  const key = normalizeCacheKey(url);
  if (!key) return undefined;
  const cached = htmlCache.get(key);
  if (!cached || cached.expires <= Date.now()) {
    htmlCache.delete(key);
    return undefined;
  }
  return cached.value;
}

export function cacheBackMarketHtml(url: string, html: string): void {
  const key = normalizeCacheKey(url);
  if (!key || !html) return;
  htmlCache.set(key, {
    expires: Date.now() + HTML_TTL_MS,
    value: html,
  });
}
