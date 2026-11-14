import { fetchGetWithFlareFallback } from "@/lib/http/scrapeFetch";

import {
  isNameOnlyRetailerTitleMatch,
  NAME_ONLY_RETAILER_TITLE_MIN_SIMILARITY,
} from "@/core/commerce/retailer/titleMatch";
import { metadataTitleSimilarity } from "@/core/enrich/titleMatching";
import {
  promoteSmartoysSearchEvidence,
  readSmartoysSearchEvidence,
} from "./durableEvidence";

/**
 * Smartoys (https://www.smartoys.be) is a Belgian retro-gaming retailer whose
 * product pages are keyed by barcode: `product_info.php?products_id=<barcode>`
 * 301-redirects to the canonical `…-p-<barcode>.html`. We read prices straight
 * from the product page (robots-allowed) instead of their search endpoint
 * (`advanced_search.php`, which robots.txt disallows).
 *
 * Safety: an unknown id can redirect to an *unrelated* product, so we only
 * trust a page whose canonical URL actually carries our barcode, or whose title
 * aligns with the requested name on a name-based lookup.
 *
 * Name path: mine SearchYield (url + title) → local rank → **one** detail GET.
 */

const SMARTOYS_BASE = "https://www.smartoys.be";
const SMARTOYS_TIMEOUT_MS = 8000;
const SMARTOYS_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

export interface SmartoysPrices {
  priceNew?: number; // cents
  priceUsed?: number; // cents
  productName?: string | null;
  coverUrl?: string | null;
  sourceUrl?: string | null;
}

/** Mined from advanced_search_result HTML — no detail GET yet. */
export type SmartoysSearchHit = {
  url: string;
  title: string;
};

interface SmartoysJsonLdOffer {
  price?: number | string;
  itemCondition?: string;
}

interface SmartoysJsonLdProduct {
  "@type"?: string;
  name?: string;
  image?: string | string[];
  offers?: SmartoysJsonLdOffer | SmartoysJsonLdOffer[];
}

function normalizeBarcode(value: string): string {
  return value.replace(/[^\d]/g, "").replace(/^0+/, "");
}

function isBarcodeOnlyQuery(query: string) {
  const cleaned = query.replace(/[^\d]/g, "").trim();
  return cleaned.length >= 8 && query.replace(/\s/g, "") === cleaned;
}

function extractProductJsonLd(html: string): SmartoysJsonLdProduct | null {
  const blocks = html.matchAll(
    /<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi,
  );
  for (const block of blocks) {
    try {
      const data = JSON.parse(block[1].trim());
      if (data && data["@type"] === "Product") {
        return data as SmartoysJsonLdProduct;
      }
    } catch {
      // Ignore malformed JSON-LD blocks.
    }
  }
  return null;
}

function newPriceCentsFromJsonLd(
  product: SmartoysJsonLdProduct,
): number | undefined {
  const offers = product.offers
    ? Array.isArray(product.offers)
      ? product.offers
      : [product.offers]
    : [];
  const newPrices = offers
    .filter((offer) => /New/i.test(String(offer.itemCondition || "")))
    .map((offer) => Number(offer.price))
    .filter((value) => Number.isFinite(value) && value > 0);
  if (newPrices.length === 0) return undefined;
  return Math.round(Math.min(...newPrices) * 100);
}

function usedPriceCentsFromHtml(html: string): number | undefined {
  const amounts = [
    ...html.matchAll(
      /<td[^>]*width="20%"[^>]*>\s*(\d{1,4}(?:[.,]\d{2}))\s*(?:&nbsp;|\s)*&euro;/gi,
    ),
  ]
    .map((match) => Number(match[1].replace(",", ".")))
    .filter((value) => Number.isFinite(value) && value > 0);
  if (amounts.length === 0) return undefined;
  return Math.round(Math.min(...amounts) * 100);
}

function firstImage(image?: string | string[]): string | null {
  if (!image) return null;
  return Array.isArray(image) ? image[0] || null : image;
}

function parseSmartoysPricesFromHtml(
  html: string,
  finalUrl: string,
): SmartoysPrices | null {
  const product = extractProductJsonLd(html);
  if (!product) return null;

  const priceNew = newPriceCentsFromJsonLd(product);
  const priceUsed = usedPriceCentsFromHtml(html);
  if (priceNew === undefined && priceUsed === undefined) return null;

  return {
    priceNew,
    priceUsed,
    productName: typeof product.name === "string" ? product.name : null,
    coverUrl: firstImage(product.image),
    sourceUrl: finalUrl,
  };
}

function titleMatchesExpected(
  productName: string | null | undefined,
  expectedNames: string[],
  options: { shelfType?: string | null } = {},
) {
  const title = productName?.trim();
  if (!title || expectedNames.length === 0) return true;
  const identityOptions = options.shelfType
    ? { shelfType: options.shelfType }
    : undefined;
  return expectedNames.some((name) =>
    isNameOnlyRetailerTitleMatch(name, title, identityOptions),
  );
}

async function fetchSmartoysProductPage(
  productUrl: string,
  expectedNames: string[],
  options: { requireBarcode?: string; shelfType?: string | null } = {},
): Promise<SmartoysPrices | null> {
  const res = await fetchGetWithFlareFallback(productUrl, {
    headers: {
      "User-Agent": SMARTOYS_USER_AGENT,
      "Accept-Language": "fr-BE,fr;q=0.9",
    },
    timeout: SMARTOYS_TIMEOUT_MS,
    responseType: "text",
    maxRedirects: 5,
  });

  const html = typeof res.data === "string" ? res.data : "";
  if (!html) return null;

  const finalUrl = productUrl;

  if (options.requireBarcode) {
    const urlBarcode = finalUrl.match(/-p-(\d+)\.html/i)?.[1];
    if (
      !urlBarcode ||
      normalizeBarcode(urlBarcode) !== normalizeBarcode(options.requireBarcode)
    ) {
      return null;
    }
  }

  const parsed = parseSmartoysPricesFromHtml(html, finalUrl);
  if (!parsed) return null;
  if (
    !titleMatchesExpected(parsed.productName, expectedNames, {
      shelfType: options.shelfType,
    })
  ) {
    return null;
  }
  return parsed;
}

function titleFromSmartoysProductUrl(url: string): string {
  return (
    url
      .match(/jeux-video-([^/]+?)-p-\d+\.html/i)?.[1]
      ?.replace(/-/g, " ")
      .trim() ?? ""
  );
}

/** SearchYield: product URLs + listing titles (anchor text, else slug). */
export function parseSmartoysSearchHits(html: string): SmartoysSearchHit[] {
  const hits: SmartoysSearchHit[] = [];
  const seen = new Set<string>();
  for (const match of html.matchAll(
    /href="(https:\/\/www\.smartoys\.be\/catalog\/jeux-video[^"]*-p-\d+\.html)"[^>]*>([\s\S]*?)<\/a>/gi,
  )) {
    const url = match[1];
    if (seen.has(url)) continue;
    seen.add(url);
    const anchorTitle = match[2]
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    hits.push({
      url,
      title: anchorTitle || titleFromSmartoysProductUrl(url),
    });
  }
  return hits;
}

function smartoysHitRankScore(hit: SmartoysSearchHit, names: string[]): number {
  const titles = [hit.title, titleFromSmartoysProductUrl(hit.url)]
    .map((title) => title.trim())
    .filter(Boolean);
  if (titles.length === 0 || names.length === 0) return -1;
  return Math.max(
    ...names.flatMap((name) =>
      titles.map((title) => metadataTitleSimilarity(name, title)),
    ),
  );
}

/** Local rank on SearchYield — detail GET only for the winner. */
export function pickBestSmartoysSearchHit(
  hits: SmartoysSearchHit[],
  expectedNames: string[],
): SmartoysSearchHit | null {
  if (hits.length === 0) return null;
  const names = expectedNames.map((name) => name.trim()).filter(Boolean);
  if (names.length === 0) return hits[0] ?? null;

  let best: SmartoysSearchHit | null = null;
  let bestScore = -1;
  for (const hit of hits) {
    const score = smartoysHitRankScore(hit, names);
    if (score > bestScore) {
      bestScore = score;
      best = hit;
    }
  }
  if (best && bestScore >= NAME_ONLY_RETAILER_TITLE_MIN_SIMILARITY) {
    return best;
  }
  // Single cryptic listing (e.g. "TLOU") — one detail, fiche title-gate decides.
  if (hits.length === 1) return hits[0] ?? null;
  return null;
}

async function loadSmartoysSearchHits(
  searchUrl: string,
): Promise<SmartoysSearchHit[]> {
  const fromEvidence = await readSmartoysSearchEvidence(searchUrl);
  if (fromEvidence) {
    console.info(`[Smartoys] Search evidence hit for ${searchUrl}`);
    return fromEvidence;
  }

  const res = await fetchGetWithFlareFallback(searchUrl, {
    headers: {
      "User-Agent": SMARTOYS_USER_AGENT,
      "Accept-Language": "fr-BE,fr;q=0.9",
    },
    timeout: SMARTOYS_TIMEOUT_MS,
    responseType: "text",
  });

  const hits = parseSmartoysSearchHits(String(res.data ?? ""));
  await promoteSmartoysSearchEvidence(searchUrl, hits);
  return hits;
}

async function fetchSmartoysByName(
  query: string,
  expectedNames: string[],
  options: { shelfType?: string | null } = {},
): Promise<SmartoysPrices | null> {
  const cleanedQuery = query.trim();
  if (!cleanedQuery) return null;

  const searchUrl = `${SMARTOYS_BASE}/catalog/advanced_search_result.php?keywords=${encodeURIComponent(cleanedQuery)}`;
  console.info(`[Smartoys] Querying search: ${cleanedQuery}`);

  const names = expectedNames.length > 0 ? expectedNames : [cleanedQuery];
  const best = pickBestSmartoysSearchHit(
    await loadSmartoysSearchHits(searchUrl),
    names,
  );
  if (!best) return null;

  return fetchSmartoysProductPage(best.url, names, options);
}

async function fetchSmartoysByBarcode(
  barcode: string,
): Promise<SmartoysPrices | null> {
  const cleaned = barcode.replace(/[^\d]/g, "").trim();
  if (!cleaned) return null;

  const requestUrl = `${SMARTOYS_BASE}/catalog/product_info.php?products_id=${cleaned}`;
  console.info(`[Smartoys] Querying product page for barcode: ${cleaned}`);
  return fetchSmartoysProductPage(requestUrl, [], {
    requireBarcode: cleaned,
  });
}

export async function fetchPricesFromSmartoys(
  query: string,
  expectedNames: string[] = [],
  options: { shelfType?: string | null } = {},
): Promise<SmartoysPrices | null> {
  const cleanedQuery = query.trim();
  if (!cleanedQuery) return null;

  try {
    if (isBarcodeOnlyQuery(cleanedQuery)) {
      const byBarcode = await fetchSmartoysByBarcode(cleanedQuery);
      if (byBarcode) return byBarcode;
    }

    return await fetchSmartoysByName(cleanedQuery, expectedNames, options);
  } catch (error) {
    console.error(
      `[Smartoys] Price lookup failed for "${cleanedQuery}":`,
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}
