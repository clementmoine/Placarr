/**
 * Geedie promote/reuse of durable SearchYield (typed marketplace hits)
 * via ProviderEvidence — bridges Next scan and worker refresh.
 */
import {
  getFreshProviderEvidence,
  putProviderEvidence,
  PROVIDER_EVIDENCE_SEARCH_KIND,
  PROVIDER_EVIDENCE_SEARCH_TTL_MS,
} from "@/core/enrich/providerEvidenceStore";

const PROVIDER_ID = "geedie";

/** Typed SearchYield hit (subset required for promote/reuse). */
export type GeedieSearchEvidenceHit = {
  title: string;
  productUrl: string;
  thumbnailUrl: string;
};

function isGeedieSearchHits(
  value: unknown,
): value is GeedieSearchEvidenceHit[] {
  if (!Array.isArray(value)) return false;
  return value.every((row) => {
    if (!row || typeof row !== "object") return false;
    const record = row as Record<string, unknown>;
    return (
      typeof record.title === "string" &&
      typeof record.productUrl === "string" &&
      record.productUrl.trim().length > 0 &&
      typeof record.thumbnailUrl === "string"
    );
  });
}

function isGeedieSearchUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.pathname.includes("/marketplace/") &&
      Boolean(parsed.searchParams.get("search")?.trim())
    );
  } catch {
    return url.includes("/marketplace/") && url.includes("search=");
  }
}

/** Fresh SearchYield hits for a `/marketplace/…?search=` URL, or null. */
export async function readGeedieSearchEvidence(
  searchUrl: string,
): Promise<GeedieSearchEvidenceHit[] | null> {
  try {
    if (!isGeedieSearchUrl(searchUrl)) return null;
    const row = await getFreshProviderEvidence(PROVIDER_ID, searchUrl);
    if (!row || row.kind !== PROVIDER_EVIDENCE_SEARCH_KIND) return null;
    if (!isGeedieSearchHits(row.yieldJson)) return null;
    return row.yieldJson;
  } catch (error) {
    console.warn("[Geedie] Failed to read durable search evidence:", error);
    return null;
  }
}

/** Persist typed search hits so worker can skip repeating the same search GET. */
export async function promoteGeedieSearchEvidence(
  searchUrl: string,
  hits: GeedieSearchEvidenceHit[],
): Promise<void> {
  if (!isGeedieSearchUrl(searchUrl)) return;
  try {
    await putProviderEvidence({
      providerId: PROVIDER_ID,
      url: searchUrl,
      kind: PROVIDER_EVIDENCE_SEARCH_KIND,
      yieldJson: hits,
      ttlMs: PROVIDER_EVIDENCE_SEARCH_TTL_MS,
    });
  } catch (error) {
    console.warn("[Geedie] Failed to promote durable search evidence:", error);
  }
}
