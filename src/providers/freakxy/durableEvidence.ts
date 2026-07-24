/**
 * Freakxy promote/reuse of durable SearchYield (typed Magento catalogsearch hits)
 * via ProviderEvidence — bridges Next scan and worker refresh.
 */
import {
  getFreshProviderEvidence,
  putProviderEvidence,
  PROVIDER_EVIDENCE_SEARCH_KIND,
  PROVIDER_EVIDENCE_SEARCH_TTL_MS,
} from "@/core/enrich/providerEvidenceStore";

const PROVIDER_ID = "freakxy";

/** Typed SearchYield hit (subset required for promote/reuse). */
export type FreakxySearchEvidenceHit = {
  name: string;
  coverUrl?: string | null;
};

function isFreakxySearchHits(
  value: unknown,
): value is FreakxySearchEvidenceHit[] {
  if (!Array.isArray(value)) return false;
  return value.every((row) => {
    if (!row || typeof row !== "object") return false;
    const record = row as Record<string, unknown>;
    return (
      typeof record.name === "string" &&
      record.name.trim().length > 0 &&
      (record.coverUrl === undefined ||
        record.coverUrl === null ||
        typeof record.coverUrl === "string")
    );
  });
}

function isFreakxySearchUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.pathname.includes("/catalogsearch/result") &&
      Boolean(parsed.searchParams.get("q")?.trim())
    );
  } catch {
    return url.includes("/catalogsearch/result") && url.includes("q=");
  }
}

/** Fresh SearchYield hits for a `/catalogsearch/result/?q=` URL, or null. */
export async function readFreakxySearchEvidence(
  searchUrl: string,
): Promise<FreakxySearchEvidenceHit[] | null> {
  try {
    if (!isFreakxySearchUrl(searchUrl)) return null;
    const row = await getFreshProviderEvidence(PROVIDER_ID, searchUrl);
    if (!row || row.kind !== PROVIDER_EVIDENCE_SEARCH_KIND) return null;
    if (!isFreakxySearchHits(row.yieldJson)) return null;
    return row.yieldJson;
  } catch (error) {
    console.warn("[Freakxy] Failed to read durable search evidence:", error);
    return null;
  }
}

/** Persist typed search hits so worker can skip repeating the same search GET. */
export async function promoteFreakxySearchEvidence(
  searchUrl: string,
  hits: FreakxySearchEvidenceHit[],
): Promise<void> {
  if (!isFreakxySearchUrl(searchUrl)) return;
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
      "[Freakxy] Failed to promote durable search evidence:",
      error,
    );
  }
}
