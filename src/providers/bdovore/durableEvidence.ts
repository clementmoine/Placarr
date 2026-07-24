/**
 * Bdovore promote/reuse of durable series SearchYield (typed getjson Serie hits)
 * via ProviderEvidence — bridges Next scan and worker refresh.
 */
import {
  getFreshProviderEvidence,
  putProviderEvidence,
  PROVIDER_EVIDENCE_SEARCH_KIND,
  PROVIDER_EVIDENCE_SEARCH_TTL_MS,
} from "@/core/enrich/providerEvidenceStore";

const PROVIDER_ID = "bdovore";

/** Typed series SearchYield hit. */
export type BdovoreSeriesEvidenceHit = {
  id: string;
  label: string;
};

function isBdovoreSeriesHits(
  value: unknown,
): value is BdovoreSeriesEvidenceHit[] {
  if (!Array.isArray(value)) return false;
  return value.every((row) => {
    if (!row || typeof row !== "object") return false;
    const record = row as Record<string, unknown>;
    return (
      typeof record.id === "string" &&
      record.id.trim().length > 0 &&
      typeof record.label === "string" &&
      record.label.trim().length > 0
    );
  });
}

function isBdovoreSeriesSearchUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.pathname.includes("/getjson") &&
      parsed.searchParams.get("data")?.toLowerCase() === "serie" &&
      Boolean(parsed.searchParams.get("term")?.trim())
    );
  } catch {
    return (
      url.includes("/getjson") &&
      /data=Serie/i.test(url) &&
      url.includes("term=")
    );
  }
}

/** Fresh series SearchYield for a `/getjson?data=Serie&term=` URL, or null. */
export async function readBdovoreSeriesEvidence(
  searchUrl: string,
): Promise<BdovoreSeriesEvidenceHit[] | null> {
  try {
    if (!isBdovoreSeriesSearchUrl(searchUrl)) return null;
    const row = await getFreshProviderEvidence(PROVIDER_ID, searchUrl);
    if (!row || row.kind !== PROVIDER_EVIDENCE_SEARCH_KIND) return null;
    if (!isBdovoreSeriesHits(row.yieldJson)) return null;
    return row.yieldJson;
  } catch (error) {
    console.warn("[Bdovore] Failed to read durable series evidence:", error);
    return null;
  }
}

/** Persist typed series hits so worker can skip repeating the same getjson GET. */
export async function promoteBdovoreSeriesEvidence(
  searchUrl: string,
  hits: BdovoreSeriesEvidenceHit[],
): Promise<void> {
  if (!isBdovoreSeriesSearchUrl(searchUrl)) return;
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
      "[Bdovore] Failed to promote durable series evidence:",
      error,
    );
  }
}
