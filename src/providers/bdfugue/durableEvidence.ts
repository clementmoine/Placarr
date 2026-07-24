/**
 * BD Fugue promote/reuse of durable SearchYield (typed catalogsearch hits)
 * via ProviderEvidence — bridges Next scan and worker refresh.
 */
import {
  getFreshProviderEvidence,
  putProviderEvidence,
  PROVIDER_EVIDENCE_SEARCH_KIND,
  PROVIDER_EVIDENCE_SEARCH_TTL_MS,
} from "@/core/enrich/providerEvidenceStore";

const PROVIDER_ID = "bdfugue";

/** Typed SearchYield hit (subset required for promote/reuse). */
export type BdFugueSearchEvidenceHit = {
  title: string;
  productUrl: string;
  barcode?: string;
  coverUrl?: string;
};

function isBdFugueSearchHits(
  value: unknown,
): value is BdFugueSearchEvidenceHit[] {
  if (!Array.isArray(value)) return false;
  return value.every((row) => {
    if (!row || typeof row !== "object") return false;
    const record = row as Record<string, unknown>;
    return (
      typeof record.title === "string" &&
      typeof record.productUrl === "string" &&
      record.productUrl.trim().length > 0 &&
      (record.barcode === undefined || typeof record.barcode === "string") &&
      (record.coverUrl === undefined || typeof record.coverUrl === "string")
    );
  });
}

function isBdFugueSearchUrl(url: string): boolean {
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
export async function readBdFugueSearchEvidence(
  searchUrl: string,
): Promise<BdFugueSearchEvidenceHit[] | null> {
  try {
    if (!isBdFugueSearchUrl(searchUrl)) return null;
    const row = await getFreshProviderEvidence(PROVIDER_ID, searchUrl);
    if (!row || row.kind !== PROVIDER_EVIDENCE_SEARCH_KIND) return null;
    if (!isBdFugueSearchHits(row.yieldJson)) return null;
    return row.yieldJson;
  } catch (error) {
    console.warn("[BD Fugue] Failed to read durable search evidence:", error);
    return null;
  }
}

/** Persist typed search hits so worker can skip repeating the same search GET. */
export async function promoteBdFugueSearchEvidence(
  searchUrl: string,
  hits: BdFugueSearchEvidenceHit[],
): Promise<void> {
  if (!isBdFugueSearchUrl(searchUrl)) return;
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
      "[BD Fugue] Failed to promote durable search evidence:",
      error,
    );
  }
}
