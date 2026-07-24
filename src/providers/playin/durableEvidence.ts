/**
 * Play-In promote/reuse of durable SearchYield (typed catalogue hits)
 * via ProviderEvidence — bridges Next scan and worker refresh.
 */
import {
  getFreshProviderEvidence,
  putProviderEvidence,
  PROVIDER_EVIDENCE_SEARCH_KIND,
  PROVIDER_EVIDENCE_SEARCH_TTL_MS,
} from "@/core/enrich/providerEvidenceStore";

const PROVIDER_ID = "playin";

/** Typed SearchYield hit (subset required for promote/reuse). */
export type PlayInSearchEvidenceHit = {
  url: string;
  productId?: string;
};

function isPlayInSearchHits(
  value: unknown,
): value is PlayInSearchEvidenceHit[] {
  if (!Array.isArray(value)) return false;
  return value.every((row) => {
    if (!row || typeof row !== "object") return false;
    const record = row as Record<string, unknown>;
    return (
      typeof record.url === "string" &&
      record.url.trim().length > 0 &&
      (record.productId === undefined || typeof record.productId === "string")
    );
  });
}

function isPlayInSearchUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.pathname.includes("/catalogue") &&
      Boolean(parsed.searchParams.get("search")?.trim())
    );
  } catch {
    return url.includes("/catalogue") && url.includes("search=");
  }
}

/** Fresh SearchYield hits for a catalogue `?search=` URL, or null. */
export async function readPlayInSearchEvidence(
  searchUrl: string,
): Promise<PlayInSearchEvidenceHit[] | null> {
  try {
    if (!isPlayInSearchUrl(searchUrl)) return null;
    const row = await getFreshProviderEvidence(PROVIDER_ID, searchUrl);
    if (!row || row.kind !== PROVIDER_EVIDENCE_SEARCH_KIND) return null;
    if (!isPlayInSearchHits(row.yieldJson)) return null;
    return row.yieldJson;
  } catch (error) {
    console.warn("[Play-In] Failed to read durable search evidence:", error);
    return null;
  }
}

/** Persist typed search hits so worker can skip repeating the same search GET. */
export async function promotePlayInSearchEvidence(
  searchUrl: string,
  hits: PlayInSearchEvidenceHit[],
): Promise<void> {
  if (!isPlayInSearchUrl(searchUrl)) return;
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
      "[Play-In] Failed to promote durable search evidence:",
      error,
    );
  }
}
