/**
 * HDJV promote/reuse of durable SearchYield (typed ajax_recherche hits)
 * via ProviderEvidence — bridges Next scan and worker refresh.
 */
import {
  getFreshProviderEvidence,
  putProviderEvidence,
  PROVIDER_EVIDENCE_SEARCH_KIND,
  PROVIDER_EVIDENCE_SEARCH_TTL_MS,
} from "@/core/enrich/providerEvidenceStore";

const PROVIDER_ID = "hdjv";

/** Typed SearchYield hit (subset required for promote/reuse). */
export type HdjvSearchEvidenceHit = {
  label: string;
  title: string;
  support: string;
  ficheUrl: string;
  gameCode: string;
};

function isHdjvSearchHits(value: unknown): value is HdjvSearchEvidenceHit[] {
  if (!Array.isArray(value)) return false;
  return value.every((row) => {
    if (!row || typeof row !== "object") return false;
    const record = row as Record<string, unknown>;
    return (
      typeof record.label === "string" &&
      typeof record.title === "string" &&
      typeof record.support === "string" &&
      typeof record.ficheUrl === "string" &&
      record.ficheUrl.trim().length > 0 &&
      typeof record.gameCode === "string" &&
      record.gameCode.trim().length > 0
    );
  });
}

function isHdjvSearchUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.pathname.includes("ajax_recherche_jeu.php") &&
      Boolean(parsed.searchParams.get("q")?.trim()) &&
      Boolean(parsed.searchParams.get("support")?.trim())
    );
  } catch {
    return (
      url.includes("ajax_recherche_jeu.php") &&
      url.includes("q=") &&
      url.includes("support=")
    );
  }
}

/** Fresh SearchYield hits for an `ajax_recherche_jeu.php?q=&support=` URL, or null. */
export async function readHdjvSearchEvidence(
  searchUrl: string,
): Promise<HdjvSearchEvidenceHit[] | null> {
  try {
    if (!isHdjvSearchUrl(searchUrl)) return null;
    const row = await getFreshProviderEvidence(PROVIDER_ID, searchUrl);
    if (!row || row.kind !== PROVIDER_EVIDENCE_SEARCH_KIND) return null;
    if (!isHdjvSearchHits(row.yieldJson)) return null;
    return row.yieldJson;
  } catch (error) {
    console.warn("[HDJV] Failed to read durable search evidence:", error);
    return null;
  }
}

/** Persist typed search hits so worker can skip repeating the same search GET. */
export async function promoteHdjvSearchEvidence(
  searchUrl: string,
  hits: HdjvSearchEvidenceHit[],
): Promise<void> {
  if (!isHdjvSearchUrl(searchUrl)) return;
  try {
    await putProviderEvidence({
      providerId: PROVIDER_ID,
      url: searchUrl,
      kind: PROVIDER_EVIDENCE_SEARCH_KIND,
      yieldJson: hits,
      ttlMs: PROVIDER_EVIDENCE_SEARCH_TTL_MS,
    });
  } catch (error) {
    console.warn("[HDJV] Failed to promote durable search evidence:", error);
  }
}
