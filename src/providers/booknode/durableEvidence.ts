/**
 * Booknode promote/reuse of durable SearchYield (typed search candidates)
 * via ProviderEvidence — bridges Next scan and worker refresh.
 */
import {
  getFreshProviderEvidence,
  putProviderEvidence,
  PROVIDER_EVIDENCE_SEARCH_KIND,
  PROVIDER_EVIDENCE_SEARCH_TTL_MS,
} from "@/core/enrich/providerEvidenceStore";

const PROVIDER_ID = "booknode";

export type BooknodeSearchHit = {
  title: string;
  url: string;
};

function isBooknodeSearchHits(value: unknown): value is BooknodeSearchHit[] {
  if (!Array.isArray(value)) return false;
  return value.every((row) => {
    if (!row || typeof row !== "object") return false;
    const record = row as Record<string, unknown>;
    return (
      typeof record.title === "string" &&
      typeof record.url === "string" &&
      record.url.trim().length > 0
    );
  });
}

function isBooknodeSearchUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.pathname.includes("/search") &&
      Boolean(parsed.searchParams.get("q")?.trim())
    );
  } catch {
    return url.includes("/search?") && url.includes("q=");
  }
}

/** Fresh SearchYield candidates for a `/search?q=` URL, or null. */
export async function readBooknodeSearchEvidence(
  searchUrl: string,
): Promise<BooknodeSearchHit[] | null> {
  try {
    if (!isBooknodeSearchUrl(searchUrl)) return null;
    const row = await getFreshProviderEvidence(PROVIDER_ID, searchUrl);
    if (!row || row.kind !== PROVIDER_EVIDENCE_SEARCH_KIND) return null;
    if (!isBooknodeSearchHits(row.yieldJson)) return null;
    return row.yieldJson;
  } catch (error) {
    console.warn("[Booknode] Failed to read durable search evidence:", error);
    return null;
  }
}

/** Persist typed search candidates so worker can skip repeating the same search GET. */
export async function promoteBooknodeSearchEvidence(
  searchUrl: string,
  hits: BooknodeSearchHit[],
): Promise<void> {
  if (!isBooknodeSearchUrl(searchUrl)) return;
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
      "[Booknode] Failed to promote durable search evidence:",
      error,
    );
  }
}
