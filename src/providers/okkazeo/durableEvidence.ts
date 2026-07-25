/**
 * Okkazeo promote/reuse of durable SearchYield (typed resultats hits)
 * via ProviderEvidence — bridges Next scan and worker refresh.
 */
import {
  getFreshProviderEvidence,
  putProviderEvidence,
  PROVIDER_EVIDENCE_SEARCH_KIND,
  PROVIDER_EVIDENCE_SEARCH_TTL_MS,
} from "@/core/enrich/providerEvidenceStore";

const PROVIDER_ID = "okkazeo";

/** Typed SearchYield hit (subset required for promote/reuse). */
export type OkkazeoSearchEvidenceHit = {
  url: string;
  gameId?: string;
};

function isOkkazeoSearchHits(
  value: unknown,
): value is OkkazeoSearchEvidenceHit[] {
  if (!Array.isArray(value)) return false;
  return value.every((row) => {
    if (!row || typeof row !== "object") return false;
    const record = row as Record<string, unknown>;
    return (
      typeof record.url === "string" &&
      record.url.trim().length > 0 &&
      (record.gameId === undefined || typeof record.gameId === "string")
    );
  });
}

function isOkkazeoSearchUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.pathname.includes("/jeux/resultats") &&
      Boolean(
        parsed.searchParams.get("ean")?.trim() ||
          parsed.searchParams.get("titre_jeu")?.trim(),
      )
    );
  } catch {
    return (
      url.includes("/jeux/resultats") &&
      (url.includes("ean=") || url.includes("titre_jeu="))
    );
  }
}

/** Fresh SearchYield hits for a `/jeux/resultats?ean|titre_jeu=` URL, or null. */
export async function readOkkazeoSearchEvidence(
  searchUrl: string,
): Promise<OkkazeoSearchEvidenceHit[] | null> {
  try {
    if (!isOkkazeoSearchUrl(searchUrl)) return null;
    const row = await getFreshProviderEvidence(PROVIDER_ID, searchUrl);
    if (!row || row.kind !== PROVIDER_EVIDENCE_SEARCH_KIND) return null;
    if (!isOkkazeoSearchHits(row.yieldJson)) return null;
    return row.yieldJson;
  } catch (error) {
    console.warn("[Okkazeo] Failed to read durable search evidence:", error);
    return null;
  }
}

/** Persist typed search hits so worker can skip repeating the same search GET. */
export async function promoteOkkazeoSearchEvidence(
  searchUrl: string,
  hits: OkkazeoSearchEvidenceHit[],
): Promise<void> {
  if (!isOkkazeoSearchUrl(searchUrl)) return;
  try {
    await putProviderEvidence({
      providerId: PROVIDER_ID,
      url: searchUrl,
      kind: PROVIDER_EVIDENCE_SEARCH_KIND,
      yieldJson: hits,
      ttlMs: PROVIDER_EVIDENCE_SEARCH_TTL_MS,
    });
  } catch (error) {
    console.warn("[Okkazeo] Failed to promote durable search evidence:", error);
  }
}
