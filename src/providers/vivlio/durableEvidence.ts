/**
 * Vivlio promote/reuse of durable SearchYield (typed /search hits)
 * via ProviderEvidence — bridges Next scan and worker refresh.
 */
import {
  getFreshProviderEvidence,
  putProviderEvidence,
  PROVIDER_EVIDENCE_SEARCH_KIND,
  PROVIDER_EVIDENCE_SEARCH_TTL_MS,
} from "@/core/enrich/providerEvidenceStore";

const PROVIDER_ID = "vivlio";

/** Typed SearchYield hit (subset required for promote/reuse). */
export type VivlioSearchEvidenceHit = {
  title: string;
  productUrl: string;
  barcode?: string;
};

function isVivlioSearchHits(
  value: unknown,
): value is VivlioSearchEvidenceHit[] {
  if (!Array.isArray(value)) return false;
  return value.every((row) => {
    if (!row || typeof row !== "object") return false;
    const record = row as Record<string, unknown>;
    return (
      typeof record.title === "string" &&
      typeof record.productUrl === "string" &&
      record.productUrl.trim().length > 0 &&
      (record.barcode === undefined || typeof record.barcode === "string")
    );
  });
}

function isVivlioSearchUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      (parsed.pathname === "/search" || parsed.pathname.endsWith("/search")) &&
      Boolean(parsed.searchParams.get("search")?.trim())
    );
  } catch {
    return url.includes("/search?") && url.includes("search=");
  }
}

/** Fresh SearchYield hits for a `/search?search=` URL, or null. */
export async function readVivlioSearchEvidence(
  searchUrl: string,
): Promise<VivlioSearchEvidenceHit[] | null> {
  try {
    if (!isVivlioSearchUrl(searchUrl)) return null;
    const row = await getFreshProviderEvidence(PROVIDER_ID, searchUrl);
    if (!row || row.kind !== PROVIDER_EVIDENCE_SEARCH_KIND) return null;
    if (!isVivlioSearchHits(row.yieldJson)) return null;
    return row.yieldJson;
  } catch (error) {
    console.warn("[Vivlio] Failed to read durable search evidence:", error);
    return null;
  }
}

/** Persist typed search hits so worker can skip repeating the same search GET. */
export async function promoteVivlioSearchEvidence(
  searchUrl: string,
  hits: VivlioSearchEvidenceHit[],
): Promise<void> {
  if (!isVivlioSearchUrl(searchUrl)) return;
  try {
    await putProviderEvidence({
      providerId: PROVIDER_ID,
      url: searchUrl,
      kind: PROVIDER_EVIDENCE_SEARCH_KIND,
      yieldJson: hits,
      ttlMs: PROVIDER_EVIDENCE_SEARCH_TTL_MS,
    });
  } catch (error) {
    console.warn("[Vivlio] Failed to promote durable search evidence:", error);
  }
}
