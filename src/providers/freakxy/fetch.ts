import { fetchGetWithFlareFallback } from "@/lib/http/scrapeFetch";
import { decode as decodeHTMLEntities } from "html-entities";

import {
  promoteFreakxySearchEvidence,
  readFreakxySearchEvidence,
} from "./durableEvidence";

export interface FreakxyProduct {
  name: string;
  coverUrl?: string | null;
  /**
   * Magento final price in EUR cents when the listing exposes it.
   * Aliased as {@link priceNew} for `NamedListing` / barcode slots.
   */
  priceCents?: number | null;
  priceNew?: number;
  /** Product fiche URL when the search hit links to one. */
  sourceUrl?: string | null;
  productUrl?: string;
}

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
};

const REQUEST_TIMEOUT_MS = 15000;

export function freakxySearchUrl(barcode: string): string {
  const cleaned = barcode.replace(/[^\d]/g, "").trim();
  return `https://www.freakxy.fr/catalogsearch/result/?q=${encodeURIComponent(cleaned)}`;
}

/** Magento `data-price-amount` (EUR) or visible `.price` text → cents. */
export function parseFreakxyPriceCents(blockHtml: string): number | null {
  const dataAmount = blockHtml.match(
    /data-price-amount=["']([0-9]+(?:\.[0-9]+)?)["']/i,
  )?.[1];
  if (dataAmount) {
    const euros = Number.parseFloat(dataAmount);
    if (Number.isFinite(euros) && euros > 0) return Math.round(euros * 100);
  }

  const priceText = blockHtml.match(
    /class=["'][^"']*\bprice\b[^"']*["'][^>]*>\s*([^<]+)/i,
  )?.[1];
  if (!priceText) return null;
  const normalized = decodeHTMLEntities(priceText)
    .replace(/\u00a0/g, " ")
    .replace(/[^\d,.]/g, "")
    .trim();
  if (!normalized) return null;
  // FR "59,99" or "1.234,56" vs EN "59.99"
  let euros: number;
  if (/,/.test(normalized) && /\./.test(normalized)) {
    euros = Number.parseFloat(normalized.replace(/\./g, "").replace(",", "."));
  } else if (/,/.test(normalized)) {
    euros = Number.parseFloat(normalized.replace(",", "."));
  } else {
    euros = Number.parseFloat(normalized);
  }
  if (!Number.isFinite(euros) || euros <= 0) return null;
  return Math.round(euros * 100);
}

function freakxyAbsoluteUrl(href: string | null | undefined): string | null {
  const raw = href?.trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw.split(/[?#]/)[0] || raw;
  if (raw.startsWith("/")) {
    return `https://www.freakxy.fr${raw.split(/[?#]/)[0]}`;
  }
  return null;
}

/** Parse Magento product-item blocks into typed SearchYield hits. */
export function parseFreakxySearchHits(html: string): FreakxyProduct[] {
  if (
    html.includes("Votre recherche n'a retourné aucun résultat") ||
    html.includes("Your search returned no results") ||
    html.includes("notice message info")
  ) {
    return [];
  }

  const productItems = html.match(
    /<li class=\"[^\"]*product-item[^\"]*\">([\s\S]*?)<\/li>/gi,
  );
  if (!productItems) return [];

  const results: FreakxyProduct[] = [];
  for (const item of productItems) {
    const titleMatch = item.match(
      /class=\"product-item-link\"[^>]*>\s*([\s\S]*?)\s*<\/a>/i,
    );
    const linkMatch = item.match(
      /class=\"product-item-link\"[^>]*href=\"([^\"]+)\"/i,
    );
    const imgMatch =
      item.match(
        /<img[^>]*class=\"product-image-photo\"[^>]*src=\"([^\"]+)\"/i,
      ) ||
      item.match(
        /<img[^>]*src=\"([^\"]+)\"[^>]*class=\"product-image-photo\"/i,
      ) ||
      item.match(/<img[^>]*src=\"([^\"]+)\"/i);

    if (titleMatch) {
      const title = decodeHTMLEntities(titleMatch[1].trim());
      const coverUrl = imgMatch ? imgMatch[1].trim() : null;
      const priceCents = parseFreakxyPriceCents(item);
      const sourceUrl = freakxyAbsoluteUrl(linkMatch?.[1]);
      results.push({
        name: title,
        coverUrl,
        ...(priceCents != null
          ? { priceCents, priceNew: priceCents }
          : {}),
        ...(sourceUrl ? { sourceUrl, productUrl: sourceUrl } : {}),
      });
    }
  }
  return results;
}

export async function fetchFromFreakxy(
  barcode: string,
): Promise<FreakxyProduct[]> {
  const cleanedBarcode = barcode.replace(/[^\d]/g, "").trim();
  if (!cleanedBarcode) return [];

  const url = freakxySearchUrl(cleanedBarcode);
  console.log(`[Freakxy] Querying search: ${url}`);

  const fromEvidence = await readFreakxySearchEvidence(url);
  if (fromEvidence) {
    console.info(`[Freakxy] Search evidence hit for ${url}`);
    return fromEvidence;
  }

  try {
    const res = await fetchGetWithFlareFallback(url, {
      headers: HEADERS,
      timeout: REQUEST_TIMEOUT_MS,
    });
    const html = String(res.data ?? "");
    const results = parseFreakxySearchHits(html);
    if (results.length === 0) {
      console.log(
        `[Freakxy] Search returned no results for barcode: ${cleanedBarcode}`,
      );
    }
    await promoteFreakxySearchEvidence(url, results);
    return results;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.toLowerCase().includes("timeout")) {
      throw error instanceof Error ? error : new Error(message);
    }
    console.error(
      `[Freakxy] Error querying barcode ${cleanedBarcode}:`,
      message,
    );
    return [];
  }
}
