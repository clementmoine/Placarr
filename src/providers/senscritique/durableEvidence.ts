/**
 * SensCritique promote/reuse of durable SearchYield (typed GraphQL hits)
 * via ProviderEvidence — bridges Next scan and worker refresh.
 * Search is GraphQL GET; evidence uses a synthetic `/search?keywords=` URL key.
 */
import {
  getFreshProviderEvidence,
  putProviderEvidence,
  PROVIDER_EVIDENCE_SEARCH_KIND,
  PROVIDER_EVIDENCE_SEARCH_TTL_MS,
} from "@/core/enrich/providerEvidenceStore";

const PROVIDER_ID = "senscritique";

/** Typed SearchYield hit (subset required for promote/reuse). */
export type SensCritiqueSearchEvidenceHit = {
  id: number;
  title: string;
  universe?: string;
  year?: number;
  rating?: number;
  url: string;
  coverUrl?: string;
};

function isSensCritiqueSearchHits(
  value: unknown,
): value is SensCritiqueSearchEvidenceHit[] {
  if (!Array.isArray(value)) return false;
  return value.every((row) => {
    if (!row || typeof row !== "object") return false;
    const record = row as Record<string, unknown>;
    return (
      typeof record.id === "number" &&
      Number.isFinite(record.id) &&
      typeof record.title === "string" &&
      typeof record.url === "string" &&
      record.url.trim().length > 0 &&
      (record.universe === undefined || typeof record.universe === "string") &&
      (record.year === undefined || typeof record.year === "number") &&
      (record.rating === undefined || typeof record.rating === "number") &&
      (record.coverUrl === undefined || typeof record.coverUrl === "string")
    );
  });
}

function isSensCritiqueSearchUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.hostname.includes("senscritique.com") &&
      parsed.pathname.includes("/search") &&
      Boolean(parsed.searchParams.get("keywords")?.trim())
    );
  } catch {
    return url.includes("senscritique.com") && url.includes("keywords=");
  }
}

/** Synthetic evidence key for a SensCritique GraphQL search. */
export function sensCritiqueSearchEvidenceUrl(input: {
  keywords: string;
  universe?: string;
}): string {
  const url = new URL("https://www.senscritique.com/search");
  url.searchParams.set("keywords", input.keywords.trim());
  if (input.universe?.trim()) {
    url.searchParams.set("universe", input.universe.trim());
  }
  return url.toString();
}

/** Fresh SearchYield hits for a synthetic `/search?keywords=` URL, or null. */
export async function readSensCritiqueSearchEvidence(
  searchUrl: string,
): Promise<SensCritiqueSearchEvidenceHit[] | null> {
  try {
    if (!isSensCritiqueSearchUrl(searchUrl)) return null;
    const row = await getFreshProviderEvidence(PROVIDER_ID, searchUrl);
    if (!row || row.kind !== PROVIDER_EVIDENCE_SEARCH_KIND) return null;
    if (!isSensCritiqueSearchHits(row.yieldJson)) return null;
    return row.yieldJson;
  } catch (error) {
    console.warn(
      "[SensCritique] Failed to read durable search evidence:",
      error,
    );
    return null;
  }
}

/** Persist typed search hits so worker can skip repeating the same GraphQL GET. */
export async function promoteSensCritiqueSearchEvidence(
  searchUrl: string,
  hits: SensCritiqueSearchEvidenceHit[],
): Promise<void> {
  if (!isSensCritiqueSearchUrl(searchUrl)) return;
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
      "[SensCritique] Failed to promote durable search evidence:",
      error,
    );
  }
}
