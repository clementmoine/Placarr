/**
 * Bedetheque promote/reuse of durable series SearchYield (typed ajax/tout hits)
 * via ProviderEvidence — bridges Next scan and worker refresh.
 */
import {
  getFreshProviderEvidence,
  putProviderEvidence,
  PROVIDER_EVIDENCE_SEARCH_KIND,
  PROVIDER_EVIDENCE_SEARCH_TTL_MS,
} from "@/core/enrich/providerEvidenceStore";

const PROVIDER_ID = "bedetheque";

/** Typed series SearchYield hit. */
export type BedethequeSeriesEvidenceHit = {
  id: number;
  label: string;
};

function isBedethequeSeriesHits(
  value: unknown,
): value is BedethequeSeriesEvidenceHit[] {
  if (!Array.isArray(value)) return false;
  return value.every((row) => {
    if (!row || typeof row !== "object") return false;
    const record = row as Record<string, unknown>;
    return (
      typeof record.id === "number" &&
      Number.isFinite(record.id) &&
      typeof record.label === "string" &&
      record.label.trim().length > 0
    );
  });
}

function isBedethequeSeriesSearchUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.pathname.includes("/ajax/tout") &&
      Boolean(parsed.searchParams.get("term")?.trim())
    );
  } catch {
    return url.includes("/ajax/tout") && url.includes("term=");
  }
}

/** Fresh series SearchYield for an `/ajax/tout?term=` URL, or null. */
export async function readBedethequeSeriesEvidence(
  searchUrl: string,
): Promise<BedethequeSeriesEvidenceHit[] | null> {
  try {
    if (!isBedethequeSeriesSearchUrl(searchUrl)) return null;
    const row = await getFreshProviderEvidence(PROVIDER_ID, searchUrl);
    if (!row || row.kind !== PROVIDER_EVIDENCE_SEARCH_KIND) return null;
    if (!isBedethequeSeriesHits(row.yieldJson)) return null;
    return row.yieldJson;
  } catch (error) {
    console.warn(
      "[Bedetheque] Failed to read durable series evidence:",
      error,
    );
    return null;
  }
}

/** Persist typed series hits so worker can skip repeating the same ajax GET. */
export async function promoteBedethequeSeriesEvidence(
  searchUrl: string,
  hits: BedethequeSeriesEvidenceHit[],
): Promise<void> {
  if (!isBedethequeSeriesSearchUrl(searchUrl)) return;
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
      "[Bedetheque] Failed to promote durable series evidence:",
      error,
    );
  }
}
