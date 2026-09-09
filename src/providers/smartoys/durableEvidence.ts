/**
 * Smartoys promote/reuse of durable SearchYield (typed search hits)
 * via ProviderEvidence — bridges Next scan and worker refresh.
 */
import {
  getFreshProviderEvidence,
  putProviderEvidence,
  PROVIDER_EVIDENCE_SEARCH_KIND,
  PROVIDER_EVIDENCE_SEARCH_TTL_MS,
} from "@/core/enrich/providerEvidenceStore";

const PROVIDER_ID = "smartoys";

/** Typed SearchYield hit (subset required for promote/reuse). */
export type SmartoysSearchEvidenceHit = {
  url: string;
  title: string;
};

function isSmartoysSearchHits(
  value: unknown,
): value is SmartoysSearchEvidenceHit[] {
  if (!Array.isArray(value)) return false;
  return value.every((row) => {
    if (!row || typeof row !== "object") return false;
    const record = row as Record<string, unknown>;
    return (
      typeof record.url === "string" &&
      record.url.trim().length > 0 &&
      typeof record.title === "string"
    );
  });
}

function isSmartoysSearchUrl(url: string): boolean {
  return (
    url.includes("advanced_search_result.php") && url.includes("keywords=")
  );
}

/** Fresh SearchYield hits for an `advanced_search_result.php?keywords=` URL, or null. */
export async function readSmartoysSearchEvidence(
  searchUrl: string,
): Promise<SmartoysSearchEvidenceHit[] | null> {
  try {
    if (!isSmartoysSearchUrl(searchUrl)) return null;
    const row = await getFreshProviderEvidence(PROVIDER_ID, searchUrl);
    if (!row || row.kind !== PROVIDER_EVIDENCE_SEARCH_KIND) return null;
    if (!isSmartoysSearchHits(row.yieldJson)) return null;
    return row.yieldJson;
  } catch (error) {
    console.warn("[Smartoys] Failed to read durable search evidence:", error);
    return null;
  }
}

/** Persist typed search hits so worker can skip repeating the same search GET. */
export async function promoteSmartoysSearchEvidence(
  searchUrl: string,
  hits: SmartoysSearchEvidenceHit[],
): Promise<void> {
  if (!isSmartoysSearchUrl(searchUrl)) return;
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
      "[Smartoys] Failed to promote durable search evidence:",
      error,
    );
  }
}
