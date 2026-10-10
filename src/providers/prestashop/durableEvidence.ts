/**
 * PrestaShop promote/reuse of durable SearchYield (typed AJAX search products)
 * via ProviderEvidence — bridges Next scan and worker refresh.
 * Callers pass the shop registry id (`config.id`); core never hardcodes shops.
 */
import {
  getFreshProviderEvidence,
  putProviderEvidence,
  PROVIDER_EVIDENCE_SEARCH_KIND,
  PROVIDER_EVIDENCE_SEARCH_TTL_MS,
} from "@/core/enrich/providerEvidenceStore";

import type { PrestashopSearchProduct } from "./types";

function isPrestashopSearchProducts(
  value: unknown,
): value is PrestashopSearchProduct[] {
  if (!Array.isArray(value)) return false;
  return value.every((row) => {
    if (!row || typeof row !== "object") return false;
    const record = row as Record<string, unknown>;
    return (
      typeof record.name === "string" ||
      typeof record.link === "string" ||
      typeof record.id_product === "number"
    );
  });
}

function isPrestashopSearchUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return Boolean(
      parsed.searchParams.get("search_query")?.trim() ||
      parsed.searchParams.get("s")?.trim(),
    );
  } catch {
    return url.includes("search_query=") || /(?:\?|&)s=/.test(url);
  }
}

/** Fresh SearchYield products for a Presta AJAX search URL, or null. */
export async function readPrestashopSearchEvidence(
  providerId: string,
  searchUrl: string,
): Promise<PrestashopSearchProduct[] | null> {
  try {
    if (!providerId.trim() || !isPrestashopSearchUrl(searchUrl)) return null;
    const row = await getFreshProviderEvidence(providerId, searchUrl);
    if (!row || row.kind !== PROVIDER_EVIDENCE_SEARCH_KIND) return null;
    if (!isPrestashopSearchProducts(row.yieldJson)) return null;
    return row.yieldJson;
  } catch (error) {
    console.warn(
      `[PrestaShop:${providerId}] Failed to read durable search evidence:`,
      error,
    );
    return null;
  }
}

/** Persist typed search products so worker can skip repeating the same search GET. */
export async function promotePrestashopSearchEvidence(
  providerId: string,
  searchUrl: string,
  products: PrestashopSearchProduct[],
): Promise<void> {
  if (!providerId.trim() || !isPrestashopSearchUrl(searchUrl)) return;
  try {
    await putProviderEvidence({
      providerId,
      url: searchUrl,
      kind: PROVIDER_EVIDENCE_SEARCH_KIND,
      yieldJson: products,
      ttlMs: PROVIDER_EVIDENCE_SEARCH_TTL_MS,
    });
  } catch (error) {
    console.warn(
      `[PrestaShop:${providerId}] Failed to promote durable search evidence:`,
      error,
    );
  }
}
