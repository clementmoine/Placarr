/**
 * Gibert promote/reuse of durable SearchYield (typed catalogsearch hits)
 * via ProviderEvidence — bridges Next scan and worker refresh.
 */
import {
  getFreshProviderEvidence,
  putProviderEvidence,
  PROVIDER_EVIDENCE_SEARCH_KIND,
  PROVIDER_EVIDENCE_SEARCH_TTL_MS,
} from "@/core/enrich/providerEvidenceStore";

const PROVIDER_ID = "gibert";

/** Typed SearchYield hit (subset required for promote/reuse). */
export type GibertSearchEvidenceHit = {
  title: string;
  productUrl: string;
  barcode?: string;
  coverUrl?: string;
  priceCents?: number;
};

function isGibertSearchHits(
  value: unknown,
): value is GibertSearchEvidenceHit[] {
  if (!Array.isArray(value)) return false;
  return value.every((row) => {
    if (!row || typeof row !== "object") return false;
    const record = row as Record<string, unknown>;
    return (
      typeof record.title === "string" &&
      typeof record.productUrl === "string" &&
      record.productUrl.trim().length > 0 &&
      (record.barcode === undefined || typeof record.barcode === "string") &&
      (record.coverUrl === undefined || typeof record.coverUrl === "string") &&
      (record.priceCents === undefined || typeof record.priceCents === "number")
    );
  });
}

function isGibertSearchUrl(url: string): boolean {
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
export async function readGibertSearchEvidence(
  searchUrl: string,
): Promise<GibertSearchEvidenceHit[] | null> {
  try {
    if (!isGibertSearchUrl(searchUrl)) return null;
    const row = await getFreshProviderEvidence(PROVIDER_ID, searchUrl);
    if (!row || row.kind !== PROVIDER_EVIDENCE_SEARCH_KIND) return null;
    if (!isGibertSearchHits(row.yieldJson)) return null;
    return row.yieldJson;
  } catch (error) {
    console.warn("[Gibert] Failed to read durable search evidence:", error);
    return null;
  }
}

/** Persist typed search hits so worker can skip repeating the same search GET. */
export async function promoteGibertSearchEvidence(
  searchUrl: string,
  hits: GibertSearchEvidenceHit[],
): Promise<void> {
  if (!isGibertSearchUrl(searchUrl)) return;
  try {
    await putProviderEvidence({
      providerId: PROVIDER_ID,
      url: searchUrl,
      kind: PROVIDER_EVIDENCE_SEARCH_KIND,
      yieldJson: hits,
      ttlMs: PROVIDER_EVIDENCE_SEARCH_TTL_MS,
    });
  } catch (error) {
    console.warn("[Gibert] Failed to promote durable search evidence:", error);
  }
}
