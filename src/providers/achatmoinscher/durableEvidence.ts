/**
 * AchatMoinsCher promote/reuse of durable SearchYield (typed search hits)
 * via ProviderEvidence — bridges Next scan and worker refresh.
 */
import {
  getFreshProviderEvidence,
  putProviderEvidence,
  PROVIDER_EVIDENCE_SEARCH_KIND,
  PROVIDER_EVIDENCE_SEARCH_TTL_MS,
} from "@/core/enrich/providerEvidenceStore";

import type { AchatMoinsCherSearchHit } from "./cache";

const PROVIDER_ID = "achatmoinscher";

function isAchatMoinsCherSearchHits(
  value: unknown,
): value is AchatMoinsCherSearchHit[] {
  if (!Array.isArray(value)) return false;
  return value.every((row) => {
    if (!row || typeof row !== "object") return false;
    const record = row as Record<string, unknown>;
    return (
      typeof record.productId === "string" &&
      record.productId.trim().length > 0 &&
      typeof record.title === "string"
    );
  });
}

function isAchatMoinsCherSearchUrl(url: string): boolean {
  return url.includes("recherche.php");
}

/** Fresh SearchYield hits for a `recherche.php?q=` URL, or null. */
export async function readAchatMoinsCherSearchEvidence(
  searchUrl: string,
): Promise<AchatMoinsCherSearchHit[] | null> {
  try {
    if (!isAchatMoinsCherSearchUrl(searchUrl)) return null;
    const row = await getFreshProviderEvidence(PROVIDER_ID, searchUrl);
    if (!row || row.kind !== PROVIDER_EVIDENCE_SEARCH_KIND) return null;
    if (!isAchatMoinsCherSearchHits(row.yieldJson)) return null;
    return row.yieldJson;
  } catch (error) {
    console.warn(
      "[AchatMoinsCher] Failed to read durable search evidence:",
      error,
    );
    return null;
  }
}

/** Persist typed search hits so worker can skip repeating the same search GET. */
export async function promoteAchatMoinsCherSearchEvidence(
  searchUrl: string,
  hits: AchatMoinsCherSearchHit[],
): Promise<void> {
  if (!isAchatMoinsCherSearchUrl(searchUrl)) return;
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
      "[AchatMoinsCher] Failed to promote durable search evidence:",
      error,
    );
  }
}
