/**
 * eBay promote/reuse of durable Browse SearchYield (typed itemSummaries)
 * via ProviderEvidence — bridges Next scan and worker refresh.
 * Process-local browseSummaryCache remains L1; durable evidence is L2.
 */
import {
  getFreshProviderEvidence,
  putProviderEvidence,
  PROVIDER_EVIDENCE_SEARCH_KIND,
  PROVIDER_EVIDENCE_SEARCH_TTL_MS,
} from "@/core/enrich/providerEvidenceStore";

import { EBAY_BROWSE_SEARCH_URL } from "./env";
import type { EbayBrowseSummary } from "./cache";

const PROVIDER_ID = "ebay";

/** Typed SearchYield hit — Browse `itemSummaries` row. */
export type EbayBrowseSearchEvidenceHit = EbayBrowseSummary;

function isOptionalString(value: unknown): boolean {
  return value === undefined || value === null || typeof value === "string";
}

function isImageBlock(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (!value || typeof value !== "object") return false;
  return isOptionalString((value as { imageUrl?: unknown }).imageUrl);
}

function isPriceBlock(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (!value || typeof value !== "object") return false;
  const record = value as { value?: unknown; currency?: unknown };
  return isOptionalString(record.value) && isOptionalString(record.currency);
}

function isEbayBrowseSearchHits(
  value: unknown,
): value is EbayBrowseSearchEvidenceHit[] {
  if (!Array.isArray(value)) return false;
  return value.every((row) => {
    if (!row || typeof row !== "object") return false;
    const record = row as Record<string, unknown>;
    if (!isOptionalString(record.title)) return false;
    if (!isOptionalString(record.condition)) return false;
    if (!isOptionalString(record.itemWebUrl)) return false;
    if (!isImageBlock(record.image)) return false;
    if (!isPriceBlock(record.price)) return false;
    if (record.thumbnailImages !== undefined && record.thumbnailImages !== null) {
      if (!Array.isArray(record.thumbnailImages)) return false;
      if (!record.thumbnailImages.every(isImageBlock)) return false;
    }
    return true;
  });
}

function isEbayBrowseSearchUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (!parsed.pathname.includes("/item_summary/search")) return false;
    return Boolean(
      parsed.searchParams.get("gtin")?.trim() ||
        parsed.searchParams.get("q")?.trim() ||
        parsed.searchParams.get("epid")?.trim(),
    );
  } catch {
    return (
      url.includes("item_summary/search") &&
      (url.includes("gtin=") || url.includes("q=") || url.includes("epid="))
    );
  }
}

/** Evidence key for a Browse item_summary search (gtin / q / epid). */
export function ebayBrowseSearchEvidenceUrl(
  params: Record<string, string>,
): string {
  const url = new URL(EBAY_BROWSE_SEARCH_URL);
  const gtin = params.gtin?.replace(/[^\d]/g, "").trim();
  const epid = params.epid?.trim();
  const q = params.q?.trim();
  if (gtin) url.searchParams.set("gtin", gtin);
  else if (epid) url.searchParams.set("epid", epid);
  else if (q) url.searchParams.set("q", q);
  return url.toString();
}

/** Fresh Browse SearchYield for a search URL, or null. */
export async function readEbayBrowseSearchEvidence(
  searchUrl: string,
): Promise<EbayBrowseSearchEvidenceHit[] | null> {
  try {
    if (!isEbayBrowseSearchUrl(searchUrl)) return null;
    const row = await getFreshProviderEvidence(PROVIDER_ID, searchUrl);
    if (!row || row.kind !== PROVIDER_EVIDENCE_SEARCH_KIND) return null;
    if (!isEbayBrowseSearchHits(row.yieldJson)) return null;
    return row.yieldJson;
  } catch (error) {
    console.warn("[eBay] Failed to read durable browse evidence:", error);
    return null;
  }
}

/** Persist typed Browse summaries so worker can skip repeating the same search. */
export async function promoteEbayBrowseSearchEvidence(
  searchUrl: string,
  hits: EbayBrowseSearchEvidenceHit[],
): Promise<void> {
  if (!isEbayBrowseSearchUrl(searchUrl)) return;
  try {
    await putProviderEvidence({
      providerId: PROVIDER_ID,
      url: searchUrl,
      kind: PROVIDER_EVIDENCE_SEARCH_KIND,
      yieldJson: hits,
      ttlMs: PROVIDER_EVIDENCE_SEARCH_TTL_MS,
    });
  } catch (error) {
    console.warn("[eBay] Failed to promote durable browse evidence:", error);
  }
}
