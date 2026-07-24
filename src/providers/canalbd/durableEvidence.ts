/**
 * Canal BD promote/reuse of durable SearchYield (typed recherche hits)
 * via ProviderEvidence — bridges Next scan and worker refresh.
 */
import {
  getFreshProviderEvidence,
  putProviderEvidence,
  PROVIDER_EVIDENCE_SEARCH_KIND,
  PROVIDER_EVIDENCE_SEARCH_TTL_MS,
} from "@/core/enrich/providerEvidenceStore";

const PROVIDER_ID = "canalbd";

/** Typed SearchYield hit (subset required for promote/reuse). */
export type CanalbdSearchEvidenceHit = {
  id: string;
  title: string;
  url: string;
  coverUrl?: string;
};

function isCanalbdSearchHits(
  value: unknown,
): value is CanalbdSearchEvidenceHit[] {
  if (!Array.isArray(value)) return false;
  return value.every((row) => {
    if (!row || typeof row !== "object") return false;
    const record = row as Record<string, unknown>;
    return (
      typeof record.id === "string" &&
      record.id.trim().length > 0 &&
      typeof record.title === "string" &&
      typeof record.url === "string" &&
      record.url.trim().length > 0 &&
      (record.coverUrl === undefined || typeof record.coverUrl === "string")
    );
  });
}

function isCanalbdSearchUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.pathname.includes("/recherche") &&
      Boolean(parsed.searchParams.get("q")?.trim())
    );
  } catch {
    return url.includes("/recherche") && url.includes("q=");
  }
}

/** Fresh SearchYield hits for a `/recherche/?q=` URL, or null. */
export async function readCanalbdSearchEvidence(
  searchUrl: string,
): Promise<CanalbdSearchEvidenceHit[] | null> {
  try {
    if (!isCanalbdSearchUrl(searchUrl)) return null;
    const row = await getFreshProviderEvidence(PROVIDER_ID, searchUrl);
    if (!row || row.kind !== PROVIDER_EVIDENCE_SEARCH_KIND) return null;
    if (!isCanalbdSearchHits(row.yieldJson)) return null;
    return row.yieldJson;
  } catch (error) {
    console.warn("[Canal BD] Failed to read durable search evidence:", error);
    return null;
  }
}

/** Persist typed search hits so worker can skip repeating the same search GET. */
export async function promoteCanalbdSearchEvidence(
  searchUrl: string,
  hits: CanalbdSearchEvidenceHit[],
): Promise<void> {
  if (!isCanalbdSearchUrl(searchUrl)) return;
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
      "[Canal BD] Failed to promote durable search evidence:",
      error,
    );
  }
}
