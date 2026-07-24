/**
 * Decitre promote/reuse of durable SearchYield (typed /search hits)
 * via ProviderEvidence — bridges Next scan and worker refresh.
 */
import {
  getFreshProviderEvidence,
  putProviderEvidence,
  PROVIDER_EVIDENCE_SEARCH_KIND,
  PROVIDER_EVIDENCE_SEARCH_TTL_MS,
} from "@/core/enrich/providerEvidenceStore";

const PROVIDER_ID = "decitre";

/** Typed SearchYield hit (subset required for promote/reuse). */
export type DecitreSearchEvidenceHit = {
  title: string;
  productUrl: string;
  barcode?: string;
  coverUrl?: string;
  priceCents?: number;
  author?: string;
};

function isDecitreSearchHits(
  value: unknown,
): value is DecitreSearchEvidenceHit[] {
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
      (record.priceCents === undefined ||
        typeof record.priceCents === "number") &&
      (record.author === undefined || typeof record.author === "string")
    );
  });
}

function isDecitreSearchUrl(url: string): boolean {
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
export async function readDecitreSearchEvidence(
  searchUrl: string,
): Promise<DecitreSearchEvidenceHit[] | null> {
  try {
    if (!isDecitreSearchUrl(searchUrl)) return null;
    const row = await getFreshProviderEvidence(PROVIDER_ID, searchUrl);
    if (!row || row.kind !== PROVIDER_EVIDENCE_SEARCH_KIND) return null;
    if (!isDecitreSearchHits(row.yieldJson)) return null;
    return row.yieldJson;
  } catch (error) {
    console.warn("[Decitre] Failed to read durable search evidence:", error);
    return null;
  }
}

/** Persist typed search hits so worker can skip repeating the same search GET. */
export async function promoteDecitreSearchEvidence(
  searchUrl: string,
  hits: DecitreSearchEvidenceHit[],
): Promise<void> {
  if (!isDecitreSearchUrl(searchUrl)) return;
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
      "[Decitre] Failed to promote durable search evidence:",
      error,
    );
  }
}
