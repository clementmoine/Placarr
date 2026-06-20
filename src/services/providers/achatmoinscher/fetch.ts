import axios from "axios";
import { decode as decodeHTMLEntities } from "html-entities";

export interface AchatMoinsCherProduct {
  name: string;
  coverUrl?: string | null;
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
      return [];
    }

    const productUrl = `https://www.achatmoinscher.com/${productId}.html`;
    console.log(`[AchatMoinsCher] Fetching product page: ${productUrl}`);
    const getRes = await axios.get(productUrl, {
      headers: HEADERS,
      timeout: 5000,
    });
    const html = getRes.data;

    const titleMatch =
      html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) ||
      html.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i);
    let title = titleMatch
      ? titleMatch[1]
          .replace(/<[^>]+>/g, "")
          .replace(/\s+/g, " ")
          .trim()
      : null;

    if (!title) {
      console.log(`[AchatMoinsCher] Product ID ${productId} page has no title`);
      return [];
    }

    // Decode HTML entities and strip common prepended brand manufacturer words
    title = decodeHTMLEntities(title);
    title = title.replace(/^(Sony|Microsoft)\s+/i, "");

    // Try to extract Platform to append to title (for better automatic shelf selection)
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

    // Prices live on the same product page we just fetched — capture them too.
    const prices = parseAchatMoinsCherPrices(html, productId);

    return [{ name: title, coverUrl, ...(prices ?? {}) }];
  } catch (error: any) {
    console.error(
      `[AchatMoinsCher] Error fetching barcode ${cleanedBarcode}:`,
      error.message,
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
      lowerUrl.includes("avatar")
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

  // Test top 5 candidates with a validation request (HEAD/GET)
  for (const url of uniqueUrls.slice(0, 5)) {
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
    } catch (err: any) {
      try {
        const res = await axios.get(url, {
          headers: {
            "User-Agent": HEADERS["User-Agent"],
            Referer: "https://www.achatmoinscher.com/",
          },
          timeout: 2000,
        });
        if (res.status === 200) {
          return url;
        }
      } catch (getErr) {
        console.warn(
          `[AchatMoinsCher] Validation failed for cover URL: ${url}`,
        );
      }
    }
  }

  return null;
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

export async function fetchPricesFromAchatMoinsCher(
  barcode: string,
): Promise<AchatMoinsCherPrices | null> {
  const cleanedBarcode = barcode.replace(/[^\d]/g, "").trim();
  if (!cleanedBarcode) return null;

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
    if (!productId || !/^\d+$/.test(productId)) {
      return null;
    }

    const productUrl = `https://www.achatmoinscher.com/${productId}.html`;
    console.log(`[AchatMoinsCher Prices] Fetching product page: ${productUrl}`);
    const getRes = await axios.get(productUrl, {
      headers: HEADERS,
      timeout: 5000,
    });

    return parseAchatMoinsCherPrices(getRes.data, productId);
  } catch (error: any) {
    console.error(
      `[AchatMoinsCher Prices] Error fetching for barcode ${cleanedBarcode}:`,
      error.message,
    );
    return null;
  }
}
