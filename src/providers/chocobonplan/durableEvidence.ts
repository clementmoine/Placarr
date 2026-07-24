/**
 * ChocoBonPlan promote/reuse of durable SearchYield (typed Algolia deal hits)
 * via ProviderEvidence — bridges Next scan and worker refresh.
 * Algolia is POST; evidence uses a synthetic `/search?q=` URL key.
 */
import {
  getFreshProviderEvidence,
  putProviderEvidence,
  PROVIDER_EVIDENCE_SEARCH_KIND,
  PROVIDER_EVIDENCE_SEARCH_TTL_MS,
} from "@/core/enrich/providerEvidenceStore";

const PROVIDER_ID = "chocobonplan";

/** Typed SearchYield hit (subset required for promote/reuse). */
export type ChocoBonPlanSearchEvidenceHit = {
  title: string;
  url: string;
  image: string;
  objectID: string;
};

function isChocoBonPlanSearchHits(
  value: unknown,
): value is ChocoBonPlanSearchEvidenceHit[] {
  if (!Array.isArray(value)) return false;
  return value.every((row) => {
    if (!row || typeof row !== "object") return false;
    const record = row as Record<string, unknown>;
    return (
      typeof record.title === "string" &&
      record.title.trim().length > 0 &&
      typeof record.url === "string" &&
      record.url.trim().length > 0 &&
      typeof record.image === "string" &&
      typeof record.objectID === "string"
    );
  });
}

function isChocoBonPlanSearchUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.hostname.includes("chocobonplan.com") &&
      parsed.pathname.includes("/search") &&
      Boolean(parsed.searchParams.get("q")?.trim())
    );
  } catch {
    return url.includes("chocobonplan.com") && url.includes("q=");
  }
}

/** Synthetic evidence key for an Algolia deal search. */
export function chocoBonPlanSearchEvidenceUrl(query: string): string {
  const url = new URL("https://www.chocobonplan.com/search");
  url.searchParams.set("q", query.trim());
  return url.toString();
}

/** Fresh SearchYield hits for a synthetic `/search?q=` URL, or null. */
export async function readChocoBonPlanSearchEvidence(
  searchUrl: string,
): Promise<ChocoBonPlanSearchEvidenceHit[] | null> {
  try {
    if (!isChocoBonPlanSearchUrl(searchUrl)) return null;
    const row = await getFreshProviderEvidence(PROVIDER_ID, searchUrl);
    if (!row || row.kind !== PROVIDER_EVIDENCE_SEARCH_KIND) return null;
    if (!isChocoBonPlanSearchHits(row.yieldJson)) return null;
    return row.yieldJson;
  } catch (error) {
    console.warn(
      "[ChocoBonPlan] Failed to read durable search evidence:",
      error,
    );
    return null;
  }
}

/** Persist typed deal hits so worker can skip repeating the same Algolia POST. */
export async function promoteChocoBonPlanSearchEvidence(
  searchUrl: string,
  hits: ChocoBonPlanSearchEvidenceHit[],
): Promise<void> {
  if (!isChocoBonPlanSearchUrl(searchUrl)) return;
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
      "[ChocoBonPlan] Failed to promote durable search evidence:",
      error,
    );
  }
}
