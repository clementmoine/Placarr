/**
 * Izneo promote/reuse of durable SearchYield (typed series hits)
 * via ProviderEvidence — bridges Next scan and worker refresh.
 * Search is REST GET; evidence uses a synthetic `/search?q=` URL key.
 */
import {
  getFreshProviderEvidence,
  putProviderEvidence,
  PROVIDER_EVIDENCE_SEARCH_KIND,
  PROVIDER_EVIDENCE_SEARCH_TTL_MS,
} from "@/core/enrich/providerEvidenceStore";

const PROVIDER_ID = "izneo";

/** Typed SearchYield hit (subset required for promote/reuse). */
export type IzneoSearchEvidenceHit = {
  id: string;
  title: string;
  slug?: string;
  shelf?: string;
  ratingValue?: number;
  ratingCount?: number;
  genreName?: string;
};

function isIzneoSearchHits(value: unknown): value is IzneoSearchEvidenceHit[] {
  if (!Array.isArray(value)) return false;
  return value.every((row) => {
    if (!row || typeof row !== "object") return false;
    const record = row as Record<string, unknown>;
    return (
      typeof record.id === "string" &&
      record.id.trim().length > 0 &&
      typeof record.title === "string" &&
      record.title.trim().length > 0 &&
      (record.slug === undefined || typeof record.slug === "string") &&
      (record.shelf === undefined || typeof record.shelf === "string") &&
      (record.ratingValue === undefined ||
        typeof record.ratingValue === "number") &&
      (record.ratingCount === undefined ||
        typeof record.ratingCount === "number") &&
      (record.genreName === undefined || typeof record.genreName === "string")
    );
  });
}

function isIzneoSearchUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.hostname.includes("izneo.com") &&
      parsed.pathname.includes("/search") &&
      Boolean(parsed.searchParams.get("q")?.trim())
    );
  } catch {
    return url.includes("izneo.com") && url.includes("q=");
  }
}

/** Synthetic evidence key for an Izneo series search. */
export function izneoSearchEvidenceUrl(query: string): string {
  const url = new URL("https://www.izneo.com/search");
  url.searchParams.set("q", query.trim());
  return url.toString();
}

/** Fresh SearchYield hits for a synthetic `/search?q=` URL, or null. */
export async function readIzneoSearchEvidence(
  searchUrl: string,
): Promise<IzneoSearchEvidenceHit[] | null> {
  try {
    if (!isIzneoSearchUrl(searchUrl)) return null;
    const row = await getFreshProviderEvidence(PROVIDER_ID, searchUrl);
    if (!row || row.kind !== PROVIDER_EVIDENCE_SEARCH_KIND) return null;
    if (!isIzneoSearchHits(row.yieldJson)) return null;
    return row.yieldJson;
  } catch (error) {
    console.warn("[Izneo] Failed to read durable search evidence:", error);
    return null;
  }
}

/** Persist typed series hits so worker can skip repeating the same search GET. */
export async function promoteIzneoSearchEvidence(
  searchUrl: string,
  hits: IzneoSearchEvidenceHit[],
): Promise<void> {
  if (!isIzneoSearchUrl(searchUrl)) return;
  try {
    await putProviderEvidence({
      providerId: PROVIDER_ID,
      url: searchUrl,
      kind: PROVIDER_EVIDENCE_SEARCH_KIND,
      yieldJson: hits,
      ttlMs: PROVIDER_EVIDENCE_SEARCH_TTL_MS,
    });
  } catch (error) {
    console.warn("[Izneo] Failed to promote durable search evidence:", error);
  }
}
