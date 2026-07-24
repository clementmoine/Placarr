/**
 * PriceCharting promote/reuse of durable DetailYield (prices) via ProviderEvidence.
 */
import {
  getFreshProviderEvidence,
  putProviderEvidence,
  PROVIDER_EVIDENCE_DETAIL_KIND,
} from "@/core/enrich/providerEvidenceStore";
import type { PriceChartingPrices } from "@/core/identify/lookup/providerTypes";

const PROVIDER_ID = "pricecharting";

function isPriceChartingPrices(value: unknown): value is PriceChartingPrices {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.priceUsed === "number" ||
    typeof record.priceUsedCIB === "number" ||
    typeof record.priceNew === "number"
  );
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
