/**
 * Esprit Jeu promote/reuse of durable SearchYield (typed search hits)
 * via ProviderEvidence — bridges Next scan and worker refresh.
 */
import {
  getFreshProviderEvidence,
  putProviderEvidence,
  PROVIDER_EVIDENCE_SEARCH_KIND,
  PROVIDER_EVIDENCE_SEARCH_TTL_MS,
} from "@/core/enrich/providerEvidenceStore";

const PROVIDER_ID = "espritjeu";

/** Typed SearchYield hit (subset required for promote/reuse). */
export type EspritJeuSearchEvidenceHit = {
  url: string;
  title?: string;
};

function isEspritJeuSearchHits(
  value: unknown,
): value is EspritJeuSearchEvidenceHit[] {
  if (!Array.isArray(value)) return false;
  return value.every((row) => {
    if (!row || typeof row !== "object") return false;
    const record = row as Record<string, unknown>;
    return (
      typeof record.url === "string" &&
      record.url.trim().length > 0 &&
      (record.title === undefined || typeof record.title === "string")
    );
  });
}

function isEspritJeuSearchUrl(url: string): boolean {
  return url.includes("resultat_recherche.php") && url.includes("keywords=");
}

/** Fresh SearchYield hits for a `resultat_recherche.php?keywords=` URL, or null. */
export async function readEspritJeuSearchEvidence(
  searchUrl: string,
): Promise<EspritJeuSearchEvidenceHit[] | null> {
  try {
    if (!isEspritJeuSearchUrl(searchUrl)) return null;
    const row = await getFreshProviderEvidence(PROVIDER_ID, searchUrl);
    if (!row || row.kind !== PROVIDER_EVIDENCE_SEARCH_KIND) return null;
    if (!isEspritJeuSearchHits(row.yieldJson)) return null;
    return row.yieldJson;
  } catch (error) {
    console.warn("[Esprit Jeu] Failed to read durable search evidence:", error);
    return null;
  }
}

/** Persist typed search hits so worker can skip repeating the same search GET. */
export async function promoteEspritJeuSearchEvidence(
  searchUrl: string,
  hits: EspritJeuSearchEvidenceHit[],
): Promise<void> {
  if (!isEspritJeuSearchUrl(searchUrl)) return;
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
      "[Esprit Jeu] Failed to promote durable search evidence:",
      error,
    );
  }
}
