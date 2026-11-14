/**
 * Client cache for `/api/prints` catalogue trees (language / game / set filters).
 *
 * Prefetch from the shelf page so PrintPicker opens with filters ready instead
 * of waiting on a cold fetch + skeleton.
 */

export type PrintCatalogueRow = {
  id: string;
  label: string;
  aliases?: { label: string; language?: string }[];
  defaultLanguage?: string | null;
  sets?: {
    id: string;
    label: string;
    group?: string;
    languages?: string[];
  }[];
  languages?: string[];
};

type CacheEntry = {
  catalogues: readonly PrintCatalogueRow[];
  promise?: Promise<readonly PrintCatalogueRow[]>;
};

const cache = new Map<string, CacheEntry>();

function cacheKey(type: string, language: string | null | undefined): string {
  const lang = (language ?? "").trim().toLowerCase();
  return `${type}|${lang || "*"}`;
}

export function getCachedPrintCatalogues(
  type: string,
  language?: string | null,
): readonly PrintCatalogueRow[] | null {
  return cache.get(cacheKey(type, language))?.catalogues ?? null;
}

/**
 * Fetch (or reuse) catalogues for a shelf type. Concurrent callers share one
 * in-flight promise; a warm cache resolves synchronously via the Map.
 */
export async function loadPrintCatalogues(
  type: string,
  language?: string | null,
  signal?: AbortSignal,
): Promise<readonly PrintCatalogueRow[]> {
  const key = cacheKey(type, language);
  const hit = cache.get(key);
  if (hit?.catalogues.length) return hit.catalogues;
  if (hit?.promise) return hit.promise;

  const params = new URLSearchParams({ type });
  const lang = (language ?? "").trim();
  if (lang) params.set("language", lang);

  const promise = (async () => {
    const response = await fetch(`/api/prints?${params.toString()}`, {
      signal,
    });
    if (!response.ok) throw new Error(String(response.status));
    const data = (await response.json()) as {
      catalogues?: PrintCatalogueRow[];
    };
    const catalogues = data.catalogues ?? [];
    cache.set(key, { catalogues });
    return catalogues;
  })();

  cache.set(key, { catalogues: hit?.catalogues ?? [], promise });
  try {
    return await promise;
  } catch (error) {
    const current = cache.get(key);
    if (current?.promise === promise) {
      cache.set(key, { catalogues: current.catalogues });
    }
    throw error;
  }
}

/** Fire-and-forget warm for a print-search shelf. */
export function prefetchPrintCatalogues(
  type: string,
  language?: string | null,
): void {
  void loadPrintCatalogues(type, language).catch(() => {
    // Prefetch is best-effort — the modal still fetches on open.
  });
}
