/**
 * Philibert promote/reuse of durable SearchYield (typed search hits)
 * via ProviderEvidence — bridges Next scan and worker refresh.
 */
import {
  getFreshProviderEvidence,
  putProviderEvidence,
  PROVIDER_EVIDENCE_SEARCH_KIND,
  PROVIDER_EVIDENCE_SEARCH_TTL_MS,
} from "@/core/enrich/providerEvidenceStore";

const PROVIDER_ID = "philibert";

/** Typed SearchYield hit (subset required for promote/reuse). */
export type PhilibertSearchEvidenceHit = {
  url: string;
  title?: string;
  barcode?: string;
};

function isPhilibertSearchHits(
  value: unknown,
): value is PhilibertSearchEvidenceHit[] {
  if (!Array.isArray(value)) return false;
  return value.every((row) => {
    if (!row || typeof row !== "object") return false;
    const record = row as Record<string, unknown>;
    return (
      typeof record.url === "string" &&
      record.url.trim().length > 0 &&
      (record.title === undefined || typeof record.title === "string") &&
      (record.barcode === undefined || typeof record.barcode === "string")
    );
  });
}

function isPhilibertSearchUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.pathname.includes("/recherche") &&
      Boolean(parsed.searchParams.get("search_query")?.trim())
    );
  } catch {
    return url.includes("/recherche") && url.includes("search_query=");
  }
}

/** Fresh SearchYield hits for a `/fr/recherche?search_query=` URL, or null. */
export async function readPhilibertSearchEvidence(
  searchUrl: string,
): Promise<PhilibertSearchEvidenceHit[] | null> {
  try {
    if (!isPhilibertSearchUrl(searchUrl)) return null;
    const row = await getFreshProviderEvidence(PROVIDER_ID, searchUrl);
    if (!row || row.kind !== PROVIDER_EVIDENCE_SEARCH_KIND) return null;
    if (!isPhilibertSearchHits(row.yieldJson)) return null;
    return row.yieldJson;
  } catch (error) {
    console.warn(
      "[Philibert] Failed to read durable search evidence:",
      error,
    );
    return null;
  }
}

/** Persist typed search hits so worker can skip repeating the same search GET. */
export async function promotePhilibertSearchEvidence(
  searchUrl: string,
  hits: PhilibertSearchEvidenceHit[],
): Promise<void> {
  if (!isPhilibertSearchUrl(searchUrl)) return;
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
      "[Philibert] Failed to promote durable search evidence:",
      error,
    );
  }
}
