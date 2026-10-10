/**
 * PriceCharting promote/reuse of durable DetailYield (prices) and SearchYield
 * (typed search rows) via ProviderEvidence.
 */
import {
  getFreshProviderEvidence,
  putProviderEvidence,
  PROVIDER_EVIDENCE_DETAIL_KIND,
  PROVIDER_EVIDENCE_SEARCH_KIND,
  PROVIDER_EVIDENCE_SEARCH_TTL_MS,
} from "@/core/enrich/providerEvidenceStore";
import type { PriceChartingPrices } from "@/core/identify/lookup/providerTypes";

const PROVIDER_ID = "pricecharting";

export type PriceChartingSearchRow = {
  id: string;
  gamePath: string;
  title: string;
  platform: string;
};

function isPriceChartingPrices(value: unknown): value is PriceChartingPrices {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.priceUsed === "number" ||
    typeof record.priceUsedCIB === "number" ||
    typeof record.priceNew === "number"
  );
}

function isPriceChartingSearchRows(
  value: unknown,
): value is PriceChartingSearchRow[] {
  if (!Array.isArray(value)) return false;
  return value.every((row) => {
    if (!row || typeof row !== "object") return false;
    const record = row as Record<string, unknown>;
    return (
      typeof record.id === "string" &&
      typeof record.gamePath === "string" &&
      typeof record.title === "string" &&
      typeof record.platform === "string"
    );
  });
}

/** Fresh DetailYield prices for a pinned `/game/` URL, or null. */
export async function readPriceChartingPriceEvidence(
  url: string,
): Promise<PriceChartingPrices | null> {
  try {
    const row = await getFreshProviderEvidence(PROVIDER_ID, url);
    if (!row || row.kind !== PROVIDER_EVIDENCE_DETAIL_KIND) return null;
    if (!isPriceChartingPrices(row.yieldJson)) return null;
    return {
      ...row.yieldJson,
      sourceUrl: row.yieldJson.sourceUrl || url,
    };
  } catch (error) {
    console.warn(
      "[PriceCharting] Failed to read durable price evidence:",
      error,
    );
    return null;
  }
}

/** Persist typed prices so worker refresh can skip a Flare/HTTP GET. */
export async function promotePriceChartingPriceEvidence(
  prices: PriceChartingPrices,
): Promise<void> {
  const url = prices.sourceUrl?.trim();
  if (!url?.includes("/game/") || url.includes("search-products")) return;
  try {
    await putProviderEvidence({
      providerId: PROVIDER_ID,
      url,
      kind: PROVIDER_EVIDENCE_DETAIL_KIND,
      yieldJson: prices,
    });
  } catch (error) {
    console.warn(
      "[PriceCharting] Failed to promote durable price evidence:",
      error,
    );
  }
}

/** Fresh SearchYield rows for a `search-products` URL, or null. */
export async function readPriceChartingSearchEvidence(
  searchUrl: string,
): Promise<PriceChartingSearchRow[] | null> {
  try {
    if (!searchUrl.includes("search-products")) return null;
    const row = await getFreshProviderEvidence(PROVIDER_ID, searchUrl);
    if (!row || row.kind !== PROVIDER_EVIDENCE_SEARCH_KIND) return null;
    if (!isPriceChartingSearchRows(row.yieldJson)) return null;
    return row.yieldJson;
  } catch (error) {
    console.warn(
      "[PriceCharting] Failed to read durable search evidence:",
      error,
    );
    return null;
  }
}

/** Persist typed search rows so worker can skip repeating the same search GET. */
export async function promotePriceChartingSearchEvidence(
  searchUrl: string,
  rows: PriceChartingSearchRow[],
): Promise<void> {
  if (!searchUrl.includes("search-products")) return;
  try {
    await putProviderEvidence({
      providerId: PROVIDER_ID,
      url: searchUrl,
      kind: PROVIDER_EVIDENCE_SEARCH_KIND,
      yieldJson: rows,
      ttlMs: PROVIDER_EVIDENCE_SEARCH_TTL_MS,
    });
  } catch (error) {
    console.warn(
      "[PriceCharting] Failed to promote durable search evidence:",
      error,
    );
  }
}
