/**
 * Chasse aux Livres promote/reuse of durable SearchYield (typed listing hits)
 * via ProviderEvidence — bridges Next scan and worker refresh.
 */
import {
  getFreshProviderEvidence,
  putProviderEvidence,
  PROVIDER_EVIDENCE_SEARCH_KIND,
  PROVIDER_EVIDENCE_SEARCH_TTL_MS,
} from "@/core/enrich/providerEvidenceStore";

const PROVIDER_ID = "chasseauxlivres";

/** Typed SearchYield hit (subset required for promote/reuse). */
export type ChasseSearchEvidenceHit = {
  name: string;
  productUrl: string;
  coverUrl?: string;
};

function isChasseSearchHits(
  value: unknown,
): value is ChasseSearchEvidenceHit[] {
  if (!Array.isArray(value)) return false;
  return value.every((row) => {
    if (!row || typeof row !== "object") return false;
    const record = row as Record<string, unknown>;
    return (
      typeof record.name === "string" &&
      typeof record.productUrl === "string" &&
      record.productUrl.trim().length > 0
    );
  });
}

function isChasseSearchUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.pathname.includes("/search") &&
      Boolean(parsed.searchParams.get("query")?.trim())
    );
  } catch {
    return url.includes("/search?") && url.includes("query=");
  }
}

/** Fresh SearchYield hits for a `/search?query=&catalog=` URL, or null. */
export async function readChasseSearchEvidence(
  searchUrl: string,
): Promise<ChasseSearchEvidenceHit[] | null> {
  try {
    if (!isChasseSearchUrl(searchUrl)) return null;
    const row = await getFreshProviderEvidence(PROVIDER_ID, searchUrl);
    if (!row || row.kind !== PROVIDER_EVIDENCE_SEARCH_KIND) return null;
    if (!isChasseSearchHits(row.yieldJson)) return null;
    return row.yieldJson;
  } catch (error) {
    console.warn(
      "[ChasseAuxLivres] Failed to read durable search evidence:",
      error,
    );
    return null;
  }
}

/** Persist typed search hits so worker can skip repeating search + REST pages. */
export async function promoteChasseSearchEvidence(
  searchUrl: string,
  hits: ChasseSearchEvidenceHit[],
): Promise<void> {
  if (!isChasseSearchUrl(searchUrl) || hits.length === 0) return;
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
      "[ChasseAuxLivres] Failed to promote durable search evidence:",
      error,
    );
  }
}
