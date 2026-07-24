/**
 * Back Market promote/reuse of durable SearchYield (typed listing cards)
 * via ProviderEvidence — bridges Next scan and worker refresh.
 */
import {
  getFreshProviderEvidence,
  putProviderEvidence,
  PROVIDER_EVIDENCE_SEARCH_KIND,
  PROVIDER_EVIDENCE_SEARCH_TTL_MS,
} from "@/core/enrich/providerEvidenceStore";

const PROVIDER_ID = "backmarket";

/** Typed SearchYield card (subset required for promote/reuse). */
export type BackMarketSearchHit = {
  title: string;
  priceCents: number;
  currency: string;
  sourceUrl: string;
  grade?: string | null;
  coverUrl?: string | null;
  imageUrls?: string[];
  brand?: string | null;
  model?: string | null;
  category?: string | null;
  productId?: string | null;
  reviewAverage?: number | null;
  warrantyMonths?: number | null;
};

function isBackMarketSearchHits(
  value: unknown,
): value is BackMarketSearchHit[] {
  if (!Array.isArray(value)) return false;
  return value.every((row) => {
    if (!row || typeof row !== "object") return false;
    const record = row as Record<string, unknown>;
    return (
      typeof record.title === "string" &&
      typeof record.priceCents === "number" &&
      Number.isFinite(record.priceCents) &&
      typeof record.currency === "string" &&
      typeof record.sourceUrl === "string" &&
      record.sourceUrl.trim().length > 0
    );
  });
}

function isBackMarketSearchUrl(url: string): boolean {
  try {
    return new URL(url).pathname.includes("/search");
  } catch {
    return url.includes("/search");
  }
}

/** Fresh SearchYield cards for a `/search?q=` URL, or null. */
export async function readBackMarketSearchEvidence(
  searchUrl: string,
): Promise<BackMarketSearchHit[] | null> {
  try {
    if (!isBackMarketSearchUrl(searchUrl)) return null;
    const row = await getFreshProviderEvidence(PROVIDER_ID, searchUrl);
    if (!row || row.kind !== PROVIDER_EVIDENCE_SEARCH_KIND) return null;
    if (!isBackMarketSearchHits(row.yieldJson)) return null;
    return row.yieldJson;
  } catch (error) {
    console.warn(
      "[Back Market] Failed to read durable search evidence:",
      error,
    );
    return null;
  }
}

/** Persist typed search cards so worker can skip repeating the same search GET. */
export async function promoteBackMarketSearchEvidence(
  searchUrl: string,
  hits: BackMarketSearchHit[],
): Promise<void> {
  if (!isBackMarketSearchUrl(searchUrl)) return;
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
      "[Back Market] Failed to promote durable search evidence:",
      error,
    );
  }
}
