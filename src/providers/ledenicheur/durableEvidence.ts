/**
 * LeDénicheur promote/reuse of durable SearchYield (typed BFF product/offer nodes)
 * via ProviderEvidence — bridges Next scan and worker refresh.
 * Search is GraphQL POST; evidence uses a synthetic `/search?q=` URL key.
 */
import {
  getFreshProviderEvidence,
  putProviderEvidence,
  PROVIDER_EVIDENCE_SEARCH_KIND,
  PROVIDER_EVIDENCE_SEARCH_TTL_MS,
} from "@/core/enrich/providerEvidenceStore";

const PROVIDER_ID = "ledenicheur";

type PriceSummary = {
  regular?: number | string | null;
  alternative?: number | string | null;
  inStock?: number | string | null;
  count?: number | null;
};

/** Typed SearchYield hit — Product or Offer node from `newSearch`. */
export type LeDenicheurSearchEvidenceHit = {
  __typename?: "Product" | "Offer" | string;
  name?: string | null;
  pathName?: string | null;
  priceSummary?: PriceSummary | null;
  media?: { first?: string | null } | null;
  externalUri?: string | null;
  offerPrice?: { regular?: number | string | null } | null;
  store?: { name?: string | null } | null;
};

function isPriceSummary(value: unknown): value is PriceSummary {
  if (value == null) return true;
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  for (const key of ["regular", "alternative", "inStock"] as const) {
    const v = record[key];
    if (
      v != null &&
      typeof v !== "number" &&
      typeof v !== "string"
    ) {
      return false;
    }
  }
  if (record.count != null && typeof record.count !== "number") return false;
  return true;
}

function isLeDenicheurSearchHits(
  value: unknown,
): value is LeDenicheurSearchEvidenceHit[] {
  if (!Array.isArray(value)) return false;
  return value.every((row) => {
    if (!row || typeof row !== "object") return false;
    const record = row as Record<string, unknown>;
    const hasProductPath =
      typeof record.pathName === "string" && record.pathName.trim().length > 0;
    const hasOfferUri =
      typeof record.externalUri === "string" &&
      record.externalUri.trim().length > 0;
    if (!hasProductPath && !hasOfferUri) return false;
    if (record.name != null && typeof record.name !== "string") return false;
    if (!isPriceSummary(record.priceSummary)) return false;
    return true;
  });
}

function isLeDenicheurSearchUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.hostname.includes("ledenicheur.fr") &&
      parsed.pathname.includes("/search") &&
      Boolean(parsed.searchParams.get("q")?.trim())
    );
  } catch {
    return url.includes("ledenicheur.fr") && url.includes("q=");
  }
}

/** Synthetic evidence key for a LeDénicheur GraphQL search. */
export function leDenicheurSearchEvidenceUrl(query: string): string {
  const url = new URL("https://ledenicheur.fr/search");
  url.searchParams.set("q", query.trim());
  return url.toString();
}

/** Fresh SearchYield nodes for a synthetic `/search?q=` URL, or null. */
export async function readLeDenicheurSearchEvidence(
  searchUrl: string,
): Promise<LeDenicheurSearchEvidenceHit[] | null> {
  try {
    if (!isLeDenicheurSearchUrl(searchUrl)) return null;
    const row = await getFreshProviderEvidence(PROVIDER_ID, searchUrl);
    if (!row || row.kind !== PROVIDER_EVIDENCE_SEARCH_KIND) return null;
    if (!isLeDenicheurSearchHits(row.yieldJson)) return null;
    return row.yieldJson;
  } catch (error) {
    console.warn(
      "[LeDenicheur] Failed to read durable search evidence:",
      error,
    );
    return null;
  }
}

/** Persist typed search nodes so worker can skip repeating the same BFF search POST. */
export async function promoteLeDenicheurSearchEvidence(
  searchUrl: string,
  hits: LeDenicheurSearchEvidenceHit[],
): Promise<void> {
  if (!isLeDenicheurSearchUrl(searchUrl)) return;
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
      "[LeDenicheur] Failed to promote durable search evidence:",
      error,
    );
  }
}
