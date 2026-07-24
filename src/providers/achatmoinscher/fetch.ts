import axios from "axios";

import { fetchGetWithFlareFallback } from "@/lib/http/scrapeFetch";
import { decode as decodeHTMLEntities } from "html-entities";

import { isRetailerCoverUrlAlignedWithTitle } from "@/core/commerce/retailer/coverUrlMatch";
import {
  isNameOnlyRetailerTitleMatch,
  NAME_ONLY_RETAILER_TITLE_MIN_SIMILARITY,
  priceListingSharesItemIdentity,
} from "@/core/commerce/retailer/titleMatch";
import { metadataTitleSimilarity } from "@/core/enrich/titleMatching";

import {
  cacheAchatMoinsCherProductHtml,
  cacheAchatMoinsCherSearchHits,
  getCachedAchatMoinsCherProductHtml,
  getCachedAchatMoinsCherSearchHits,
  type AchatMoinsCherSearchHit,
} from "./cache";

export { resetAchatMoinsCherResponseCacheForTests } from "./cache";
export type { AchatMoinsCherSearchHit } from "./cache";

export interface AchatMoinsCherProduct {
  name: string;
  productId?: string | null;
  productUrl?: string | null;
  coverUrl?: string | null;
  /** Physical media / catalog category from the product sheet ("DVD", "Bluray"…). */
  category?: string | null;
  /** Brand / label from schema.org or fiche technique ("DISNEY JUNIOR"…). */
  brand?: string | null;
  priceNew?: number; // cents — parsed from the same product page
  priceUsed?: number; // cents — parsed from the same product page
}

export interface AchatMoinsCherPrices {
  priceNew?: number; // in cents
  priceUsed?: number; // in cents
}

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
  "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
};

export async function fetchFromAchatMoinsCher(
  barcode: string,
  expectedNames: string[] = [],
  options: { shelfType?: string | null } = {},
): Promise<AchatMoinsCherProduct[]> {
  const cleanedBarcode = barcode.replace(/[^\d]/g, "").trim();
  if (!cleanedBarcode) return [];

  try {
    console.log(`[AchatMoinsCher] Querying barcode scanner: ${cleanedBarcode}`);
    const postRes = await axios.post(
      "https://www.achatmoinscher.com/scanner.php",
      `code=${cleanedBarcode}`,
      {
        headers: {
          ...HEADERS,
          "Content-Type": "application/x-www-form-urlencoded",
          Referer: "https://www.achatmoinscher.com/scanner.php",
        },
        timeout: 5000,
      },
    );

    const productId = String(postRes.data).trim();
    if (!productId || !/^\d+$/.test(productId)) {
      console.log(
        `[AchatMoinsCher] No product ID found for barcode: ${cleanedBarcode}`,
      );
      return fetchFromAchatMoinsCherByQuery(
        cleanedBarcode,
        expectedNames,
        options,
      );
    }

    const product = await fetchAchatMoinsCherProductById(productId);
    if (
      product &&
      achatMoinsCherTitleMatchesExpectedNames(
        product.name,
        expectedNames,
        options,
      )
    ) {
      return [product];
    }

    if (product) {
      console.log(
        `[AchatMoinsCher] Barcode ${cleanedBarcode} resolved to unrelated product "${product.name}", searching by name fallback`,
      );
    }

    for (const query of expectedNames) {
      const byName = await fetchFromAchatMoinsCherByQuery(
        query,
        expectedNames,
        options,
      );
      if (byName.length > 0) return byName;
    }

    return [];
  } catch (error) {
    console.error(
      `[AchatMoinsCher] Error fetching barcode ${cleanedBarcode}:`,
      error instanceof Error ? error.message : error,
    );
    return [];
  }
}

async function extractBestCover(
  html: string,
  title?: string | null,
): Promise<string | null> {
  const candidates: { url: string; score: number }[] = [];

  // 1. Gather main product image from container <div class="col-md-12 imgIco">
  const mainImgMatch = html.match(
    /<div[^>]*class="[^"]*imgIco[^"]*"[^>]*>\s*<img[^>]+src="([^"]+)"/i,
  );
  if (mainImgMatch) {
    let url = mainImgMatch[1].trim();
    if (url.startsWith("//")) url = "https:" + url;
    else if (url.startsWith("/")) url = "https://www.achatmoinscher.com" + url;
    candidates.push({ url, score: 1000 });
  }

  // 2. Gather from og:image
  const ogMatch =
    html.match(/<meta[^>]*property=\"og:image\"[^>]*content=\"([^\"]+)\"/i) ||
    html.match(/<meta[^>]*content=\"([^\"]+)\"[^>]*property=\"og:image\"/i);
  if (ogMatch) {
    let url = ogMatch[1].trim();
    if (url.startsWith("//")) url = "https:" + url;
    else if (url.startsWith("/")) url = "https://www.achatmoinscher.com" + url;
    candidates.push({ url, score: 80 });
  }

  // 3. Gather all img tags
  const imgRegex = /<img[^>]+src=\"([^\"]+)\"/gi;
  let match;
  while ((match = imgRegex.exec(html)) !== null) {
    let url = match[1].trim();
    if (url.startsWith("//")) url = "https:" + url;
    else if (url.startsWith("/")) url = "https://www.achatmoinscher.com" + url;

    // Filter out common UI assets
    const lowerUrl = url.toLowerCase();
    if (
      lowerUrl.includes("logo") ||
      lowerUrl.includes("icon") ||
      lowerUrl.includes("banner") ||
      lowerUrl.includes("spinner") ||
      lowerUrl.includes("spacer") ||
      lowerUrl.includes("social") ||
      lowerUrl.includes("check") ||
      lowerUrl.includes("star") ||
      lowerUrl.includes("pixel") ||
      lowerUrl.includes("avatar") ||
      lowerUrl.includes("achatmoinscher.com/img/")
    ) {
      continue;
    }

    let score = 10;
    if (url.includes("photoProd/zoom") || url.includes("/zoom/")) {
      score += 150;
    } else if (url.includes("photoProd")) {
      score += 100;
    }
    if (
      url.includes("amazon") ||
      url.includes("fnac") ||
      url.includes("micromania")
    ) {
      score += 50;
    }

    // Match alt tag against title if available
    const altMatch = match[0].match(/alt="([^"]*)"/i);
    if (altMatch && title) {
      const altText = decodeHTMLEntities(altMatch[1].trim()).toLowerCase();
      const cleanTitle = title.toLowerCase();
      if (
        altText &&
        (altText === cleanTitle ||
          cleanTitle.includes(altText) ||
          altText.includes(cleanTitle))
      ) {
        score += 500;
      }
    }

    candidates.push({ url, score });
  }

  // Sort candidates by score descending
  candidates.sort((a, b) => b.score - a.score);

  // Deduplicate
  const uniqueUrls = Array.from(new Set(candidates.map((c) => c.url)));

  // Test top candidates with HTTP validation and title alignment.
  for (const url of uniqueUrls.slice(0, 8)) {
    if (title && !isRetailerCoverUrlAlignedWithTitle(url, title)) {
      continue;
    }
    try {
      const res = await axios.head(url, {
        headers: {
          "User-Agent": HEADERS["User-Agent"],
          Referer: "https://www.achatmoinscher.com/",
        },
        timeout: 2000,
      });
      if (res.status === 200) {
        return url;
      }
    } catch {
      try {
        const res = await fetchGetWithFlareFallback(url, {
          headers: {
            "User-Agent": HEADERS["User-Agent"],
            Referer: "https://www.achatmoinscher.com/",
          },
          timeout: 2000,
        });
        if (res.status === 200) {
          return url;
        }
      } catch {
        console.warn(
          `[AchatMoinsCher] Validation failed for cover URL: ${url}`,
        );
      }
    }
  }

  return null;
}

function cleanAmcSheetValue(raw: string): string {
  return decodeHTMLEntities(
    raw
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

/**
 * Category + brand from JSON-LD / fiche technique — used as shelf-estimation
 * hints (DVD + Disney → "DVD Disney") without polluting the display title.
 */
export function parseAchatMoinsCherCatalogHints(html: string): {
  category: string | null;
  brand: string | null;
} {
  let category: string | null = null;
  let brand: string | null = null;

  const jsonLdBlocks = html.match(
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  );
  for (const block of jsonLdBlocks || []) {
    const raw = block.replace(/^[\s\S]*?>/, "").replace(/<\/script>$/i, "");
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      if (parsed?.["@type"] !== "Product") continue;
      if (typeof parsed.category === "string" && parsed.category.trim()) {
        category ??= cleanAmcSheetValue(parsed.category);
      }
      const brandNode = parsed.brand;
      if (typeof brandNode === "string" && brandNode.trim()) {
        brand ??= cleanAmcSheetValue(brandNode);
      } else if (
        brandNode &&
        typeof brandNode === "object" &&
        typeof (brandNode as { name?: unknown }).name === "string"
      ) {
        brand ??= cleanAmcSheetValue(
          String((brandNode as { name: string }).name),
        );
      }
    } catch {
      // ignore malformed JSON-LD
    }
  }

  const categoryRow = html.match(
    /<td>\s*Cat[ée]gorie\s*<\/td>\s*<td>\s*([\s\S]*?)\s*<\/td>/i,
  );
  if (categoryRow?.[1]) {
    category ??= cleanAmcSheetValue(categoryRow[1]);
  }

  const brandRow = html.match(
    /<td>\s*Marque\s*<\/td>\s*<td>\s*([\s\S]*?)\s*<\/td>/i,
  );
  if (brandRow?.[1]) {
    brand ??= cleanAmcSheetValue(brandRow[1]);
  }

  return {
    category: category || null,
    brand: brand || null,
  };
}

/**
 * Parse new/used prices (cents) from an already-fetched AchatMoinsCher product
 * page. Shared by the dedicated price fetch and the scan-time identify call so a
 * single product page serves both.
 */
export function parseAchatMoinsCherPrices(
  html: string,
  productId: string,
): AchatMoinsCherPrices | null {
  const startIdx = html.indexOf('id="tabBestPrix"');
  if (startIdx === -1) {
    return null;
  }

  let blockHtml = html.substring(startIdx);
  const endIdx = blockHtml.indexOf('<div class="container"');
  if (endIdx !== -1) {
    blockHtml = blockHtml.substring(0, endIdx);
  }

  const neufIndex = blockHtml.indexOf('id="neuf' + productId + '"');
  const occasionIndex = blockHtml.indexOf('id="occasion' + productId + '"');

  let neufHtml = "";
  let occasionHtml = "";

  if (neufIndex !== -1) {
    neufHtml =
      occasionIndex !== -1
        ? blockHtml.substring(neufIndex, occasionIndex)
        : blockHtml.substring(neufIndex);
  }

  if (occasionIndex !== -1) {
    occasionHtml = blockHtml.substring(occasionIndex);
  }

  const priceRegex = /<p[^>]*class="prix"[^>]*>([\s\S]*?)<\/p>/gi;

  const parsePricesFromBlock = (block: string) => {
    const prices: number[] = [];
    let match;
    priceRegex.lastIndex = 0;
    while ((match = priceRegex.exec(block)) !== null) {
      const priceStr = match[1]
        .replace(/&nbsp;/g, "")
        .replace(/\s/g, "")
        .replace(",", ".")
        .replace("€", "")
        .trim();
      const val = parseFloat(priceStr);
      if (!isNaN(val)) {
        prices.push(Math.round(val * 100));
      }
    }
    return prices;
  };

  const neufPrices = parsePricesFromBlock(neufHtml);
  const occasionPrices = parsePricesFromBlock(occasionHtml);

  const result: AchatMoinsCherPrices = {};
  if (neufPrices.length > 0) result.priceNew = Math.min(...neufPrices);
  if (occasionPrices.length > 0) result.priceUsed = Math.min(...occasionPrices);

  return Object.keys(result).length > 0 ? result : null;
}

async function fetchAchatMoinsCherProductPrices(
  productId: string,
): Promise<AchatMoinsCherPrices | null> {
  const html = await fetchAchatMoinsCherProductHtml(productId);
  return parseAchatMoinsCherPrices(html, productId);
}

function isBarcodeOnlyQuery(query: string) {
  const cleaned = query.replace(/[^\d]/g, "").trim();
  return cleaned.length >= 8 && query.replace(/\s/g, "") === cleaned;
}

function achatMoinsCherTitleMatchesExpectedNames(
  title: string,
  expectedNames: string[],
  options: { shelfType?: string | null } = {},
): boolean {
  const names = expectedNames.filter(Boolean);
  if (names.length === 0) return true;
  const identityOptions = options.shelfType
    ? { shelfType: options.shelfType }
    : undefined;
  return names.some(
    (name) =>
      isNameOnlyRetailerTitleMatch(name, title, identityOptions) &&
      priceListingSharesItemIdentity(name, title, identityOptions),
  );
}

async function parseAchatMoinsCherProductPage(
  html: string,
  productId: string,
): Promise<AchatMoinsCherProduct | null> {
  const titleMatch =
    html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) ||
    html.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i);
  let title = titleMatch
    ? titleMatch[1]
        .replace(/<[^>]+>/g, "")
        .replace(/\s+/g, " ")
        .trim()
    : null;

  if (!title) return null;

  title = decodeHTMLEntities(title);
  title = title.replace(/^(Sony|Microsoft)\s+/i, "");

  const platformMatch = html.match(
    /<td>Plateforme<\/td>\s*<td>\s*([\s\S]*?)\s*<\/td>/i,
  );
  const platformName = platformMatch
    ? platformMatch[1]
        .replace(/<[^>]+>/g, "")
        .replace(/\s+/g, " ")
        .trim()
    : null;

  if (platformName) {
    const decodedPlatform = decodeHTMLEntities(platformName);
    if (!title.toLowerCase().includes(decodedPlatform.toLowerCase())) {
      title = `${title} (${decodedPlatform})`;
    }
  }

  const coverUrl = await extractBestCover(html, title);

  if (
    coverUrl &&
    title &&
    !isRetailerCoverUrlAlignedWithTitle(coverUrl, title)
  ) {
    console.warn(
      `[AchatMoinsCher] Rejected mismatched cover for "${title}": ${coverUrl}`,
    );
  }

  const prices = parseAchatMoinsCherPrices(html, productId);
  const catalogHints = parseAchatMoinsCherCatalogHints(html);

  return {
    name: title,
    productId,
    productUrl: `https://www.achatmoinscher.com/${productId}.html`,
    coverUrl:
      coverUrl &&
      (!title || isRetailerCoverUrlAlignedWithTitle(coverUrl, title))
        ? coverUrl
        : null,
    ...(catalogHints.category ? { category: catalogHints.category } : {}),
    ...(catalogHints.brand ? { brand: catalogHints.brand } : {}),
    ...(prices ?? {}),
  };
}

async function fetchAchatMoinsCherProductHtml(
  productId: string,
): Promise<string> {
  const cached = getCachedAchatMoinsCherProductHtml(productId);
  if (cached !== undefined) {
    console.info(`[AchatMoinsCher] Product HTML cache hit for ${productId}`);
    return cached;
  }

  const productUrl = `https://www.achatmoinscher.com/${productId}.html`;
  console.log(`[AchatMoinsCher] Fetching product page: ${productUrl}`);
  const getRes = await fetchGetWithFlareFallback(productUrl, {
    headers: HEADERS,
    timeout: 5000,
  });
  const html = String(getRes.data ?? "");
  cacheAchatMoinsCherProductHtml(productId, html);
  return html;
}

async function fetchAchatMoinsCherProductById(
  productId: string,
): Promise<AchatMoinsCherProduct | null> {
  const html = await fetchAchatMoinsCherProductHtml(productId);
  return parseAchatMoinsCherProductPage(html, productId);
}

async function fetchAchatMoinsCherSearchHits(
  query: string,
): Promise<AchatMoinsCherSearchHit[]> {
  const cleanedQuery = query.trim();
  if (!cleanedQuery) return [];

  const cached = getCachedAchatMoinsCherSearchHits(cleanedQuery);
  if (cached) {
    console.info(`[AchatMoinsCher] Search cache hit for "${cleanedQuery}"`);
    return cached;
  }

  const searchUrl = `https://www.achatmoinscher.com/recherche.php?q=${encodeURIComponent(cleanedQuery)}`;
  console.log(`[AchatMoinsCher] Querying search: ${cleanedQuery}`);
  const searchRes = await fetchGetWithFlareFallback(searchUrl, {
    headers: HEADERS,
    timeout: 5000,
  });
  const hits = parseAchatMoinsCherSearchHits(String(searchRes.data ?? ""));
  cacheAchatMoinsCherSearchHits(cleanedQuery, hits);
  return hits;
}

function pickBestAchatMoinsCherSearchHit(
  hits: AchatMoinsCherSearchHit[],
  expectedNames: string[],
  options: { shelfType?: string | null } = {},
): AchatMoinsCherSearchHit | null {
  const matching = hits.filter((hit) =>
    achatMoinsCherTitleMatchesExpectedNames(hit.title, expectedNames, options),
  );
  if (matching.length === 0) return null;
  if (matching.length === 1) return matching[0];

  let best: AchatMoinsCherSearchHit | null = null;
  let bestScore = -1;
  for (const hit of matching) {
    const score = Math.max(
      ...expectedNames
        .filter(Boolean)
        .map((name) => metadataTitleSimilarity(name, hit.title)),
    );
    if (score > bestScore) {
      bestScore = score;
      best = hit;
    }
  }
  if (best && bestScore >= NAME_ONLY_RETAILER_TITLE_MIN_SIMILARITY) {
    return best;
  }
  return matching[0] ?? null;
}

export async function fetchFromAchatMoinsCherByQuery(
  query: string,
  expectedNames: string[] = [],
  options: { shelfType?: string | null } = {},
): Promise<AchatMoinsCherProduct[]> {
  const cleanedQuery = query.trim();
  if (!cleanedQuery) return [];

  const names = expectedNames.length > 0 ? expectedNames : [cleanedQuery];
  const best = pickBestAchatMoinsCherSearchHit(
    await fetchAchatMoinsCherSearchHits(cleanedQuery),
    names,
    options,
  );
  if (!best) return [];

  const product = await fetchAchatMoinsCherProductById(best.productId);
  return product ? [product] : [];
}

export function parseAchatMoinsCherSearchHits(
  html: string,
): AchatMoinsCherSearchHit[] {
  const hits: AchatMoinsCherSearchHit[] = [];
  const seen = new Set<string>();

  for (const match of html.matchAll(
    /alt="([^"]+)"[^>]*onclick="[^"]*vProd\('(\d+)'\)/gi,
  )) {
    const productId = match[2];
    if (seen.has(productId)) continue;
    seen.add(productId);
    const title = decodeHTMLEntities(match[1].replace(/^\[EDITEUR\]\s*/i, ""))
      .replace(/\s+/g, " ")
      .trim();
    if (title) hits.push({ productId, title });
  }

  return hits;
}

async function fetchPricesFromAchatMoinsCherByName(
  query: string,
  expectedNames: string[],
  options: { shelfType?: string | null } = {},
): Promise<AchatMoinsCherPrices | null> {
  const cleanedQuery = query.trim();
  if (!cleanedQuery) return null;

  const names = expectedNames.length > 0 ? expectedNames : [cleanedQuery];
  const best = pickBestAchatMoinsCherSearchHit(
    await fetchAchatMoinsCherSearchHits(cleanedQuery),
    names,
    options,
  );
  if (!best) return null;

  return fetchAchatMoinsCherProductPrices(best.productId);
}

export async function fetchPricesFromAchatMoinsCher(
  query: string,
  expectedNames: string[] = [],
  options: { shelfType?: string | null } = {},
): Promise<AchatMoinsCherPrices | null> {
  const cleanedBarcode = query.replace(/[^\d]/g, "").trim();
  if (isBarcodeOnlyQuery(query) && cleanedBarcode) {
    try {
      console.log(
        `[AchatMoinsCher Prices] Querying barcode scanner: ${cleanedBarcode}`,
      );
      const postRes = await axios.post(
        "https://www.achatmoinscher.com/scanner.php",
        `code=${cleanedBarcode}`,
        {
          headers: {
            ...HEADERS,
            "Content-Type": "application/x-www-form-urlencoded",
            Referer: "https://www.achatmoinscher.com/scanner.php",
          },
          timeout: 5000,
        },
      );

      const productId = String(postRes.data).trim();
      if (productId && /^\d+$/.test(productId)) {
        const product = await fetchAchatMoinsCherProductById(productId);
        if (
          product &&
          achatMoinsCherTitleMatchesExpectedNames(
            product.name,
            expectedNames,
            options,
          ) &&
          (product.priceNew != null || product.priceUsed != null)
        ) {
          return {
            priceNew: product.priceNew,
            priceUsed: product.priceUsed,
          };
        }
      }
    } catch (error) {
      console.error(
        `[AchatMoinsCher Prices] Error fetching for barcode ${cleanedBarcode}:`,
        error instanceof Error ? error.message : error,
      );
    }
  }

  try {
    return await fetchPricesFromAchatMoinsCherByName(
      query,
      expectedNames,
      options,
    );
  } catch (error) {
    console.error(
      `[AchatMoinsCher Prices] Error fetching for query "${query}":`,
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}
