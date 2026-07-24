/**
 * Full Set promote/reuse of durable SearchYield (typed recherche hits)
 * via ProviderEvidence — bridges Next scan and worker refresh.
 * Rate-limited scrape: reuse pays most across refresh.
 */
import {
  getFreshProviderEvidence,
  putProviderEvidence,
  PROVIDER_EVIDENCE_SEARCH_KIND,
  PROVIDER_EVIDENCE_SEARCH_TTL_MS,
} from "@/core/enrich/providerEvidenceStore";

const PROVIDER_ID = "fullset";

/** Typed SearchYield hit (subset required for promote/reuse). */
export type FullSetSearchEvidenceHit = {
  url: string;
  title: string;
  category?: string;
  platformLabel?: string;
  year?: string;
  consoleSlug?: string;
};

function isFullSetSearchHits(
  value: unknown,
): value is FullSetSearchEvidenceHit[] {
  if (!Array.isArray(value)) return false;
  return value.every((row) => {
    if (!row || typeof row !== "object") return false;
    const record = row as Record<string, unknown>;
    return (
      typeof record.url === "string" &&
      record.url.trim().length > 0 &&
      typeof record.title === "string" &&
      record.title.trim().length > 0 &&
      (record.category === undefined || typeof record.category === "string") &&
      (record.platformLabel === undefined ||
        typeof record.platformLabel === "string") &&
      (record.year === undefined || typeof record.year === "string") &&
      (record.consoleSlug === undefined ||
        typeof record.consoleSlug === "string")
    );
  });
}

function isFullSetSearchUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.hostname.includes("full-set.net") &&
      parsed.pathname.includes("/recherche.php") &&
      Boolean(parsed.searchParams.get("q")?.trim())
    );
  } catch {
    return url.includes("full-set.net") && url.includes("q=");
  }
}

/** Evidence key for a Full Set `/recherche.php?q=` search. */
export function fullSetSearchEvidenceUrl(query: string): string {
  const url = new URL("https://full-set.net/recherche.php");
  url.searchParams.set("q", query.trim());
  return url.toString();
}

/** Fresh SearchYield hits for a `/recherche.php?q=` URL, or null. */
export async function readFullSetSearchEvidence(
  searchUrl: string,
): Promise<FullSetSearchEvidenceHit[] | null> {
  try {
    if (!isFullSetSearchUrl(searchUrl)) return null;
    const row = await getFreshProviderEvidence(PROVIDER_ID, searchUrl);
    if (!row || row.kind !== PROVIDER_EVIDENCE_SEARCH_KIND) return null;
    if (!isFullSetSearchHits(row.yieldJson)) return null;
    return row.yieldJson;
  } catch (error) {
    console.warn("[FullSet] Failed to read durable search evidence:", error);
    return null;
  }
}

/** Persist typed search hits so worker can skip repeating the rate-limited search GET. */
export async function promoteFullSetSearchEvidence(
  searchUrl: string,
  hits: FullSetSearchEvidenceHit[],
): Promise<void> {
  if (!isFullSetSearchUrl(searchUrl)) return;
  try {
    await putProviderEvidence({
      providerId: PROVIDER_ID,
      url: searchUrl,
      kind: PROVIDER_EVIDENCE_SEARCH_KIND,
      yieldJson: hits,
      ttlMs: PROVIDER_EVIDENCE_SEARCH_TTL_MS,
    });
  } catch (error) {
    console.warn(
      "[FullSet] Failed to promote durable search evidence:",
      error,
    );
  }
}
