import axios from "axios";

import { isNameOnlyRetailerTitleMatch } from "@/lib/retailer/titleMatch";

import {
  EBAY_BROWSE_SEARCH_URL,
  EBAY_OAUTH_SCOPE,
  EBAY_OAUTH_URL,
  EBAY_REQUEST_TIMEOUT_MS,
  getEbayEnv,
  getEbayMarketplaceId,
  type EbayCredentials,
} from "./env";

export interface EbayProduct {
  name: string;
  coverUrl?: string | null;
}

export interface EbayPrices {
  priceNew?: number;
  priceUsed?: number;
  sourceUrl?: string;
  productName?: string;
  offerCount?: number;
}

type EbayItemSummary = {
  title?: string | null;
  image?: { imageUrl?: string | null } | null;
  thumbnailImages?: Array<{ imageUrl?: string | null }> | null;
  price?: { value?: string | null; currency?: string | null } | null;
  condition?: string | null;
  itemWebUrl?: string | null;
};

let cachedToken: { token: string; expiresAt: number } | null = null;

/** Test helper: forget the cached OAuth token so each case re-authenticates. */
export function resetEbayTokenCache() {
  cachedToken = null;
}

async function getEbayAccessToken(
  credentials: EbayCredentials,
): Promise<string | null> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.token;
  }
  const basic = Buffer.from(
    `${credentials.clientId}:${credentials.clientSecret}`,
  ).toString("base64");
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    scope: EBAY_OAUTH_SCOPE,
  });
  const res = await axios.post(EBAY_OAUTH_URL, body.toString(), {
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    timeout: EBAY_REQUEST_TIMEOUT_MS,
    validateStatus: () => true,
  });
  const token =
    res.status === 200 ? (res.data?.access_token as string | undefined) : undefined;
  if (!token) {
    cachedToken = null;
    return null;
  }
  const expiresInSec = Number(res.data?.expires_in) || 7200;
  cachedToken = { token, expiresAt: Date.now() + expiresInSec * 1000 };
  return token;
}

function priceToCents(value?: string | null): number | null {
  if (value === undefined || value === null) return null;
  const amount = Number(String(value).replace(/\s/g, "").replace(",", "."));
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return Math.round(amount * 100);
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle];
  return Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

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

function isNewCondition(condition?: string | null): boolean {
  return /^new/i.test(String(condition ?? "").trim());
}

async function searchEbay(
  params: Record<string, string>,
  credentials: EbayCredentials,
): Promise<EbayItemSummary[]> {
  const token = await getEbayAccessToken(credentials);
  if (!token) return [];
  const res = await axios.get(EBAY_BROWSE_SEARCH_URL, {
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
  const items = res.data?.itemSummaries;
  return Array.isArray(items) ? (items as EbayItemSummary[]) : [];
}

function itemsToProducts(
  items: EbayItemSummary[],
  expectedNames: string[],
): EbayProduct[] {
  const out: EbayProduct[] = [];
  for (const item of items) {
    const title = item.title?.trim();
    if (!title) continue;
    if (expectedNames.length > 0 && !matchesExpectedTitle(title, expectedNames)) {
      continue;
    }
    const coverUrl =
      item.image?.imageUrl || item.thumbnailImages?.[0]?.imageUrl || null;
    if (!out.some((p) => p.name.toLowerCase() === title.toLowerCase())) {
      out.push({ name: title, coverUrl });
    }
  }
  return out.slice(0, 10);
}

/** Resolve a barcode to eBay listings (name + cover) via the Browse GTIN search. */
export async function fetchFromEbay(
  barcode: string,
  expectedNames: string[] = [],
): Promise<EbayProduct[]> {
  const cleaned = barcode.replace(/[^\d]/g, "").trim();
  if (!cleaned) return [];
  const credentials = getEbayEnv();
  if (!credentials) return [];

  console.log(`[eBay] Querying GTIN: ${cleaned}`);
  try {
    const items = await searchEbay({ gtin: cleaned }, credentials);
    return itemsToProducts(items, expectedNames);
  } catch (error: unknown) {
    console.error(
      `[eBay] Error querying GTIN ${cleaned}:`,
      error instanceof Error ? error.message : error,
    );
    return [];
  }
}

/** Keyword search (used by the metadata adapter when a barcode finds nothing). */
export async function fetchEbayProductsByQuery(
  query: string,
  expectedNames: string[] = [],
): Promise<EbayProduct[]> {
  const cleaned = query.trim();
  if (!cleaned) return [];
  const credentials = getEbayEnv();
  if (!credentials) return [];

  console.log(`[eBay] Querying search: ${cleaned}`);
  try {
    const items = await searchEbay({ q: cleaned }, credentials);
    return itemsToProducts(items, expectedNames);
  } catch (error: unknown) {
    console.error(
      `[eBay] Error querying ${cleaned}:`,
      error instanceof Error ? error.message : error,
    );
    return [];
  }
}

/** Median new/used prices (cents) from the listings matching the query. */
export async function fetchPricesFromEbay(
  query: string,
  expectedNames: string[] = [],
): Promise<EbayPrices | null> {
  const cleaned = query.trim();
  if (!cleaned) return null;
  const credentials = getEbayEnv();
  if (!credentials) return null;

  try {
    const isBarcode = isBarcodeLike(cleaned);
    const items = await searchEbay(
      isBarcode ? { gtin: cleaned.replace(/[^\d]/g, "") } : { q: cleaned },
      credentials,
    );

    const newPrices: number[] = [];
    const usedPrices: number[] = [];
    let firstTitle: string | null = null;
    let firstHref: string | null = null;
    let offerCount = 0;

    for (const item of items) {
      const title = item.title?.trim();
      if (!title || !matchesExpectedTitle(title, expectedNames)) continue;
      const price = priceToCents(item.price?.value);
      if (price === null) continue;
      offerCount++;
      if (isNewCondition(item.condition)) newPrices.push(price);
      else usedPrices.push(price);
      firstTitle = firstTitle || title;
      firstHref = firstHref || item.itemWebUrl || null;
    }

    const priceNew = median(newPrices);
    const priceUsed = median(usedPrices);
    if (priceNew === null && priceUsed === null) return null;

    return {
      priceNew: priceNew ?? undefined,
      priceUsed: priceUsed ?? undefined,
      productName: firstTitle || undefined,
      sourceUrl: firstHref || undefined,
      offerCount,
    };
  } catch (error: unknown) {
    console.error(
      `[eBay Prices] Error querying ${cleaned}:`,
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}

export async function pingEbay(): Promise<{
  ok: boolean;
  latency: number;
  error?: string;
}> {
  const start = Date.now();
  const credentials = getEbayEnv();
  if (!credentials) {
    return { ok: false, latency: 0, error: "eBay credentials missing" };
  }
  try {
    const token = await getEbayAccessToken(credentials);
    return {
      ok: !!token,
      latency: Date.now() - start,
      error: token ? undefined : "OAuth token request failed",
    };
  } catch (error: unknown) {
    return {
      ok: false,
      latency: Date.now() - start,
      error: error instanceof Error ? error.message : "eBay unreachable",
    };
  }
}
