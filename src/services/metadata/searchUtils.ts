export function formatScore(value: number, max: number): string | null {
  if (!Number.isFinite(value) || value <= 0) return null;
  const maximumFractionDigits = max <= 10 ? 1 : 0;
  return `${value.toLocaleString("fr-FR", {
    maximumFractionDigits,
  })}/${max}`;
}

export { cleanSearchQuery } from "@/lib/search/query";

/** Try provider lookups in query order until one succeeds. */
export async function resolveWithLookupQueries<T>(
  lookupQueries: string[] | undefined,
  name: string,
  resolver: (query: string) => Promise<T | null>,
  options?: { limit?: number },
): Promise<T | null> {
  const seen = new Set<string>();
  const queries: string[] = [];
  for (const candidate of lookupQueries?.length ? lookupQueries : [name]) {
    const key = candidate.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    queries.push(candidate.trim());
  }
  const limit = options?.limit ?? queries.length;
  for (const query of queries.slice(0, limit)) {
    const result = await resolver(query);
    if (result) return result;
  }
  return null;
}
