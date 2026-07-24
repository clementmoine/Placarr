/**
 * Durable single-price DetailYield for scrape retailers (Philibert, Presta, …).
 * PriceCharting keeps its multi-condition yield in durableEvidence.ts.
 */
import {
  getFreshProviderEvidence,
  putProviderEvidence,
  PROVIDER_EVIDENCE_DETAIL_KIND,
} from "@/core/enrich/providerEvidenceStore";

export type RetailPriceDetailYield = {
  priceCents: number;
  condition: string;
  productName?: string;
  sourceUrl?: string;
};

export function isRetailPriceDetailYield(
  value: unknown,
): value is RetailPriceDetailYield {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.priceCents === "number" &&
    record.priceCents > 0 &&
    typeof record.condition === "string" &&
    record.condition.trim().length > 0
  );
}

/** Fresh retail price for a pinned product URL, or null. */
export async function readRetailPriceEvidence(
  providerId: string,
  url: string,
): Promise<RetailPriceDetailYield | null> {
  try {
    const row = await getFreshProviderEvidence(providerId, url);
    if (!row || row.kind !== PROVIDER_EVIDENCE_DETAIL_KIND) return null;
    if (!isRetailPriceDetailYield(row.yieldJson)) return null;
    return {
      ...row.yieldJson,
      sourceUrl: row.yieldJson.sourceUrl || url,
    };
  } catch (error) {
    console.warn(
      `[ProviderEvidence] Failed to read retail price for ${providerId}:`,
      error,
    );
    return null;
  }
}

/** Persist a single-condition price so refresh can skip HTTP within TTL. */
export async function promoteRetailPriceEvidence(
  providerId: string,
  yieldValue: RetailPriceDetailYield,
): Promise<void> {
  const url = yieldValue.sourceUrl?.trim();
  if (!url || !/^https?:\/\//i.test(url)) return;
  if (!isRetailPriceDetailYield(yieldValue)) return;
  try {
    await putProviderEvidence({
      providerId,
      url,
      kind: PROVIDER_EVIDENCE_DETAIL_KIND,
      yieldJson: yieldValue,
    });
  } catch (error) {
    console.warn(
      `[ProviderEvidence] Failed to promote retail price for ${providerId}:`,
      error,
    );
  }
}
