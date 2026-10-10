/**
 * Shopify promote/reuse of durable SearchYield (typed product handles)
 * via ProviderEvidence — bridges Next scan and worker refresh.
 * Callers pass the shop registry id (`config.id`); core never hardcodes shops.
 */
import {
  getFreshProviderEvidence,
  putProviderEvidence,
  PROVIDER_EVIDENCE_SEARCH_KIND,
  PROVIDER_EVIDENCE_SEARCH_TTL_MS,
} from "@/core/enrich/providerEvidenceStore";

function isShopifySearchHandles(value: unknown): value is string[] {
  if (!Array.isArray(value)) return false;
  return value.every((row) => typeof row === "string" && row.trim().length > 0);
}

function isShopifySearchUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.pathname.includes("/search") &&
      Boolean(parsed.searchParams.get("q")?.trim())
    );
  } catch {
    return url.includes("/search") && url.includes("q=");
  }
}

/** Fresh SearchYield handles for a `/search?q=` URL, or null. */
export async function readShopifySearchEvidence(
  providerId: string,
  searchUrl: string,
): Promise<string[] | null> {
  try {
    if (!providerId.trim() || !isShopifySearchUrl(searchUrl)) return null;
    const row = await getFreshProviderEvidence(providerId, searchUrl);
    if (!row || row.kind !== PROVIDER_EVIDENCE_SEARCH_KIND) return null;
    if (!isShopifySearchHandles(row.yieldJson)) return null;
    return row.yieldJson;
  } catch (error) {
    console.warn(
      `[Shopify:${providerId}] Failed to read durable search evidence:`,
      error,
    );
    return null;
  }
}

/** Persist typed search handles so worker can skip repeating the same search GET. */
export async function promoteShopifySearchEvidence(
  providerId: string,
  searchUrl: string,
  handles: string[],
): Promise<void> {
  if (!providerId.trim() || !isShopifySearchUrl(searchUrl)) return;
  try {
    await putProviderEvidence({
      providerId,
      url: searchUrl,
      kind: PROVIDER_EVIDENCE_SEARCH_KIND,
      yieldJson: handles,
      ttlMs: PROVIDER_EVIDENCE_SEARCH_TTL_MS,
    });
  } catch (error) {
    console.warn(
      `[Shopify:${providerId}] Failed to promote durable search evidence:`,
      error,
    );
  }
}
