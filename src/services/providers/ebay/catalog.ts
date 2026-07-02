import axios from "axios";

import { isNameOnlyRetailerTitleMatch } from "@/lib/retailer/titleMatch";

import {
  EBAY_CATALOG_SEARCH_URL,
  EBAY_REQUEST_TIMEOUT_MS,
  getEbayEnv,
  getEbayMarketplaceId,
  type EbayCredentials,
} from "./env";
import { getEbayCatalogAccessToken } from "./oauth";
import type { EbayProduct } from "./types";

type CatalogProductSummary = {
  title?: string | null;
  epid?: string | null;
  brand?: string | null;
  image?: { imageUrl?: string | null } | null;
  additionalImages?: Array<{ imageUrl?: string | null }> | null;
};

function isBarcodeLike(value: string) {
  return /^\d{8,14}$/.test(value.replace(/[^\d]/g, ""));
}

function matchesExpectedTitle(title: string, expectedNames: string[]) {
  const names = expectedNames.filter(Boolean);
  if (names.length === 0) return true;
  const textNames = names.filter((name) => !isBarcodeLike(name));
  if (textNames.length === 0) return true;
  return textNames.some((expected) =>
    isNameOnlyRetailerTitleMatch(expected, title),
  );
}

function catalogCoverUrl(summary: CatalogProductSummary): string | null {
  return (
    summary.image?.imageUrl?.trim() ||
    summary.additionalImages?.find((img) => img.imageUrl?.trim())?.imageUrl?.trim() ||
    null
  );
}

function summaryToProduct(
  summary: CatalogProductSummary,
): EbayProduct | null {
  const name = summary.title?.trim();
  const epid = summary.epid?.trim();
  if (!name || !epid) return null;
  return {
    name,
    coverUrl: catalogCoverUrl(summary),
    epid,
    brand: summary.brand?.trim() || null,
    catalog: true,
  };
}

async function searchEbayCatalog(
  params: Record<string, string>,
  credentials: EbayCredentials,
): Promise<CatalogProductSummary[]> {
  const token = await getEbayCatalogAccessToken(credentials);
  if (!token) return [];
  const res = await axios.get(EBAY_CATALOG_SEARCH_URL, {
    params: { limit: "10", ...params },
    headers: {
      Authorization: `Bearer ${token}`,
      "X-EBAY-C-MARKETPLACE-ID": getEbayMarketplaceId(),
      Accept: "application/json",
    },
    timeout: EBAY_REQUEST_TIMEOUT_MS,
    validateStatus: () => true,
  });
  if (res.status !== 200) return [];
  const summaries = res.data?.productSummaries;
  return Array.isArray(summaries) ? (summaries as CatalogProductSummary[]) : [];
}

/**
 * Official eBay catalog product lookup by GTIN (EAN / ISBN / UPC). Returns
 * canonical titles and product images even when no active listing exists.
 */
export async function fetchFromEbayCatalog(
  gtin: string,
  expectedNames: string[] = [],
): Promise<EbayProduct[]> {
  const cleaned = gtin.replace(/[^\d]/g, "").trim();
  if (!cleaned) return [];
  const credentials = getEbayEnv();
  if (!credentials) return [];

  console.log(`[eBay Catalog] Querying GTIN: ${cleaned}`);
  try {
    const summaries = await searchEbayCatalog({ gtin: cleaned }, credentials);
    const out: EbayProduct[] = [];
    for (const summary of summaries) {
      const product = summaryToProduct(summary);
      if (!product) continue;
      if (!matchesExpectedTitle(product.name, expectedNames)) continue;
      if (!out.some((entry) => entry.epid === product.epid)) {
        out.push(product);
      }
    }
    return out.slice(0, 5);
  } catch (error: unknown) {
    console.error(
      `[eBay Catalog] Error querying GTIN ${cleaned}:`,
      error instanceof Error ? error.message : error,
    );
    return [];
  }
}
