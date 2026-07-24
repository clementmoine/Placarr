/**
 * Babelio promote/reuse of durable SearchYield (merged AJAX+HTML hits)
 * via ProviderEvidence — bridges Next scan and worker refresh.
 * Search is dual POST; evidence uses a synthetic `/recherche.php?term=` URL key.
 */
import {
  getFreshProviderEvidence,
  putProviderEvidence,
  PROVIDER_EVIDENCE_SEARCH_KIND,
  PROVIDER_EVIDENCE_SEARCH_TTL_MS,
} from "@/core/enrich/providerEvidenceStore";

const PROVIDER_ID = "babelio";

/** Typed SearchYield hit (subset required for promote/reuse). */
export type BabelioSearchEvidenceHit = {
  id: string;
  title: string;
  url: string;
  authors?: string[];
  coverUrl?: string;
  copies?: number;
  ratingValue?: number;
};

function isBabelioSearchHits(
  value: unknown,
): value is BabelioSearchEvidenceHit[] {
  if (!Array.isArray(value)) return false;
  return value.every((row) => {
    if (!row || typeof row !== "object") return false;
    const record = row as Record<string, unknown>;
    return (
      typeof record.id === "string" &&
      record.id.trim().length > 0 &&
      typeof record.title === "string" &&
      typeof record.url === "string" &&
      record.url.trim().length > 0 &&
      (record.authors === undefined ||
        (Array.isArray(record.authors) &&
          record.authors.every((a) => typeof a === "string"))) &&
      (record.coverUrl === undefined || typeof record.coverUrl === "string") &&
      (record.copies === undefined || typeof record.copies === "number") &&
      (record.ratingValue === undefined ||
        typeof record.ratingValue === "number")
    );
  });
}

function isBabelioSearchUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.pathname.includes("/recherche.php") &&
      Boolean(parsed.searchParams.get("term")?.trim())
    );
  } catch {
    return url.includes("/recherche.php") && url.includes("term=");
  }
}

/** Synthetic evidence key for a Babelio dual-search. */
export function babelioSearchEvidenceUrl(term: string): string {
  const url = new URL("https://www.babelio.com/recherche.php");
  url.searchParams.set("term", term.trim());
  return url.toString();
}

/** Fresh SearchYield hits for a synthetic `/recherche.php?term=` URL, or null. */
export async function readBabelioSearchEvidence(
  searchUrl: string,
): Promise<BabelioSearchEvidenceHit[] | null> {
  try {
    if (!isBabelioSearchUrl(searchUrl)) return null;
    const row = await getFreshProviderEvidence(PROVIDER_ID, searchUrl);
    if (!row || row.kind !== PROVIDER_EVIDENCE_SEARCH_KIND) return null;
    if (!isBabelioSearchHits(row.yieldJson)) return null;
    return row.yieldJson;
  } catch (error) {
    console.warn("[Babelio] Failed to read durable search evidence:", error);
    return null;
  }
}

/** Persist merged search hits so worker can skip repeating AJAX+HTML POSTs. */
export async function promoteBabelioSearchEvidence(
  searchUrl: string,
  hits: BabelioSearchEvidenceHit[],
): Promise<void> {
  if (!isBabelioSearchUrl(searchUrl)) return;
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
      "[Babelio] Failed to promote durable search evidence:",
      error,
    );
  }
}
