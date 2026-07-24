import {
  normalizeProductBarcode,
} from "@/core/identify/normalize";
import {
  retailerProductBarcodeConfirmed,
} from "@/core/commerce/retailer/productUrl";
import { acceptRetailerCatalogCandidate } from "@/core/commerce/retailer/metadataLookup";
import { isAbortError, throwIfAborted } from "@/lib/http/abort";
import { fetchGetWithFlareFallback } from "@/lib/http/scrapeFetch";
import { collectObjectMappingSignals } from "@/lib/dev/scrapeMappingSignals";
import {
  BROWSER_HTML_HEADERS,
  absoluteUrlFromBase,
  cleanHtmlText,
  firstSchemaStringValue,
  type JsonLdSchema,
  parseJsonLdBlocks,
  schemaTypes,
} from "@/providers/shared/jsonLdHtml";

import {
  promoteGibertSearchEvidence,
  readGibertSearchEvidence,
} from "./durableEvidence";

const GIBERT_BASE_URL = "https://www.gibert.com";
const GIBERT_HEADERS = { ...BROWSER_HTML_HEADERS };

export type GibertSearchHit = {
  title: string;
  productUrl: string;
  barcode?: string;
  coverUrl?: string;
  priceCents?: number;
};

export type GibertProduct = {
  title: string;
  productUrl: string;
  barcode?: string;
  description?: string;
  coverUrl?: string;
  authors: string[];
  publisher?: string;
  pageCount?: number;
  releaseDate?: string;
  priceCents?: number;
  condition?: "new" | "used";
};

export function gibertSearchUrl(query: string): string {
  const params = new URLSearchParams({ q: String(query || "").trim() });
  return `${GIBERT_BASE_URL}/catalogsearch/result/?${params.toString()}`;
}

function schemaNames(value: unknown): string[] {
  const raw = Array.isArray(value) ? value : value ? [value] : [];
  return Array.from(
    new Set(
      raw
        .map(firstSchemaStringValue)
        .filter((name): name is string => Boolean(name)),
    ),
  );
}

function parseEuroCents(value?: string | number | null): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.round(value * 100);
  }
  const text = cleanHtmlText(String(value || ""));
  if (!text) return undefined;
  const match = text.replace(/\s/g, "").match(/(\d+)(?:[.,](\d{1,2}))?/);
  if (!match) return undefined;
  const euros = Number(match[1]);
  const cents = match[2] ? Number(match[2].padEnd(2, "0")) : 0;
  if (!Number.isFinite(euros)) return undefined;
  return euros * 100 + cents;
}

function attributeValue(html: string, label: string): string | undefined {
  const re = new RegExp(
    `${label}\\s*</[^>]+>\\s*<[^>]+>([^<]+)`,
    "i",
  );
  return cleanHtmlText(html.match(re)?.[1]);
}

export function parseGibertSearchHits(html: string): GibertSearchHit[] {
  const hits: GibertSearchHit[] = [];
  const seen = new Set<string>();

  for (const match of html.matchAll(
    /<a[^>]+class=["'][^"']*product-item-link[^"']*["'][^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,
  )) {
    const url = absoluteUrlFromBase(GIBERT_BASE_URL, match[1]);
    const title = cleanHtmlText(match[2]);
    if (!url || !title || seen.has(url)) continue;
    seen.add(url);
    const barcode =
      normalizeProductBarcode(url.match(/(\d{13})/)?.[1] || "") || undefined;
    hits.push({ title, productUrl: url, barcode });
  }

  if (hits.length === 0) {
    for (const match of html.matchAll(
      /href=["'](https?:\/\/(?:www\.)?gibert\.com\/[^"']+\.html)["'][^>]*>([^<]{5,160})/gi,
    )) {
      const url = absoluteUrlFromBase(GIBERT_BASE_URL, match[1]);
      const title = cleanHtmlText(match[2]);
      if (!url || !title || /catalogsearch|customer|checkout/i.test(url)) {
        continue;
      }
      if (seen.has(url)) continue;
      seen.add(url);
      hits.push({ title, productUrl: url });
    }
  }

  return hits;
}

export function parseGibertProductPage(
  html: string,
  productUrl: string,
): GibertProduct | null {
  const blocks = parseJsonLdBlocks(html);
  const product =
    blocks.find((block) =>
      schemaTypes(block["@type"]).some((type) =>
        /product|book/i.test(type),
      ),
    ) || null;

  const title =
    firstSchemaStringValue(product?.name) ||
    cleanHtmlText(
      html
        .match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]
        ?.replace(/\s*[|\-–—]\s*Gibert.*$/i, ""),
    );
  if (!title) return null;

  const barcode =
    normalizeProductBarcode(firstSchemaStringValue(product?.gtin13 || product?.isbn)) ||
    normalizeProductBarcode(attributeValue(html, "EAN") || "") ||
    normalizeProductBarcode(attributeValue(html, "ISBN") || "") ||
    normalizeProductBarcode(productUrl.match(/(\d{13})/)?.[1] || "") ||
    undefined;

  const authors = schemaNames(product?.author);
  const publisher =
    firstSchemaStringValue(
      product?.publisher && typeof product.publisher === "object"
        ? (product.publisher as { name?: unknown }).name
        : product?.publisher,
    ) || attributeValue(html, "Éditeur");

  const offer =
    product?.offers && typeof product.offers === "object"
      ? (product.offers as JsonLdSchema)
      : null;
  const priceCents =
    parseEuroCents(offer?.price as string | number | null | undefined) ||
    parseEuroCents(html.match(/(\d+[.,]\d{2})\s*€/)?.[1]);

  const conditionText = cleanHtmlText(
    String(offer?.itemCondition || attributeValue(html, "État") || ""),
  );
  const condition = /occasion|used/i.test(conditionText || "")
    ? "used"
    : priceCents
      ? "new"
      : undefined;

  const pageCountRaw =
    attributeValue(html, "Nombre de pages") ||
    firstSchemaStringValue(product?.numberOfPages);
  const pageCount = pageCountRaw
    ? Number.parseInt(pageCountRaw.replace(/\D+/g, ""), 10)
    : undefined;

  return {
    title,
    productUrl: absoluteUrlFromBase(GIBERT_BASE_URL, productUrl) || productUrl,
    barcode,
    description: firstSchemaStringValue(product?.description),
    coverUrl: absoluteUrlFromBase(
      GIBERT_BASE_URL,
      firstSchemaStringValue(product?.image),
    ),
    authors,
    publisher,
    pageCount:
      Number.isFinite(pageCount) && pageCount && pageCount > 0
        ? pageCount
        : undefined,
    releaseDate: firstSchemaStringValue(product?.datePublished),
    priceCents,
    condition,
  };
}

async function fetchHtml(
  url: string,
  signal?: AbortSignal,
): Promise<string | null> {
  try {
    const response = await fetchGetWithFlareFallback(url, {
      headers: GIBERT_HEADERS,
      responseType: "text",
      transformResponse: [(data) => data],
      timeout: 25_000,
      flareMaxTimeoutMs: 35_000,
      validateStatus: () => true,
      signal,
    });
    if (response.status >= 400) return null;
    const html = String(response.data || "");
    if (!html.trim() || /just a moment|cf-browser-verification/i.test(html)) {
      return null;
    }
    return html;
  } catch (error) {
    if (isAbortError(error)) throw error;
    return null;
  }
}

export async function searchGibertHits(
  query: string,
  signal?: AbortSignal,
): Promise<GibertSearchHit[]> {
  const trimmed = String(query || "").trim();
  if (!trimmed) return [];
  const searchUrl = gibertSearchUrl(trimmed);

  const fromEvidence = await readGibertSearchEvidence(searchUrl);
  if (fromEvidence) {
    console.info(`[Gibert] Search evidence hit for ${searchUrl}`);
    return fromEvidence;
  }

  const html = await fetchHtml(searchUrl, signal);
  if (!html) return [];
  const hits = parseGibertSearchHits(html);
  await promoteGibertSearchEvidence(searchUrl, hits);
  return hits;
}

export async function fetchGibertProduct(
  url: string,
  signal?: AbortSignal,
): Promise<GibertProduct | null> {
  const absolute = absoluteUrlFromBase(GIBERT_BASE_URL, url);
  if (!absolute) return null;
  const html = await fetchHtml(absolute, signal);
  return html ? parseGibertProductPage(html, absolute) : null;
}

export async function resolveGibertMetadata(options: {
  name?: string;
  barcode?: string;
  lookupQueries?: string[];
  signal?: AbortSignal;
}): Promise<GibertProduct | null> {
  const { signal } = options;
  const barcode = normalizeProductBarcode(options.barcode || "");
  const queries = Array.from(
    new Set(
      [barcode, options.name, ...(options.lookupQueries || [])]
        .map((q) => String(q || "").trim())
        .filter(Boolean),
    ),
  );

  for (const query of queries) {
    throwIfAborted(signal);
    const hits = await searchGibertHits(query, signal);
    for (const hit of hits.slice(0, 8)) {
      throwIfAborted(signal);
      const product = await fetchGibertProduct(hit.productUrl, signal);
      if (!product?.title) continue;

      if (barcode) {
        if (
          !retailerProductBarcodeConfirmed(
            product.productUrl,
            product.barcode,
            barcode,
          )
        ) {
          continue;
        }
        return product;
      }

      if (
        acceptRetailerCatalogCandidate({
          requestedName: query,
          searchQuery: query,
          catalogTitle: product.title,
        })
      ) {
        return product;
      }
    }
  }

  return null;
}

export async function collectGibertMappingRawKeys(
  query?: string | null,
): Promise<string[]> {
  const trimmed = String(query || "").trim();
  if (!trimmed) return [];
  const hits = await searchGibertHits(trimmed);
  const product = hits[0]
    ? await fetchGibertProduct(hits[0].productUrl)
    : null;
  return collectObjectMappingSignals({ hits: hits.slice(0, 3), product });
}
