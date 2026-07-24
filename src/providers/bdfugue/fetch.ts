import {
  barcodesEquivalent,
  normalizeProductBarcode,
} from "@/core/identify/normalize";
import {
  retailerCatalogBarcodeGate,
  retailerProductBarcodeConfirmed,
} from "@/core/commerce/retailer/productUrl";
import { acceptRetailerCatalogCandidate } from "@/core/commerce/retailer/metadataLookup";
import { fetchGetWithFlareFallback } from "@/lib/http/scrapeFetch";
import { isAbortError } from "@/lib/http/abort";
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
  promoteBdFugueSearchEvidence,
  readBdFugueSearchEvidence,
} from "./durableEvidence";

const BDFUGUE_BASE_URL = "https://www.bdfugue.com";
const BDFUGUE_HEADERS = { ...BROWSER_HTML_HEADERS };

const FR_MONTHS: Record<string, string> = {
  janv: "01",
  janvier: "01",
  févr: "02",
  fevr: "02",
  février: "02",
  fevrier: "02",
  mars: "03",
  avr: "04",
  avril: "04",
  mai: "05",
  juin: "06",
  juil: "07",
  juillet: "07",
  août: "08",
  aout: "08",
  sept: "09",
  septembre: "09",
  oct: "10",
  octobre: "10",
  nov: "11",
  novembre: "11",
  déc: "12",
  dec: "12",
  décembre: "12",
  decembre: "12",
};

export type BdFugueSearchHit = {
  title: string;
  productUrl: string;
  barcode?: string;
  coverUrl?: string;
};

export type BdFugueCredit = {
  name: string;
  role?: string;
};

export type BdFugueProduct = {
  title: string;
  productUrl: string;
  barcode?: string;
  description?: string;
  coverUrl?: string;
  authors: BdFugueCredit[];
  publisher?: string;
  seriesName?: string;
  issueNumber?: string;
  pageCount?: number;
  genre?: string;
  binding?: string;
  releaseDate?: string;
  priceCents?: number;
  ratingValue?: number;
  ratingCount?: number;
};

export function bdfugueSearchUrl(query: string): string {
  const params = new URLSearchParams({ q: query.trim() });
  return `${BDFUGUE_BASE_URL}/catalogsearch/result/?${params.toString()}`;
}

function parseEuroPriceCents(value?: string | number | null): number | undefined {
  if (value == null) return undefined;
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value <= 0) return undefined;
    return Math.round(value * 100);
  }
  const match = String(value).match(/([0-9]+(?:[.,][0-9]{1,2})?)/);
  if (!match) return undefined;
  const amount = Number.parseFloat(match[1].replace(",", "."));
  if (!Number.isFinite(amount) || amount <= 0) return undefined;
  return Math.round(amount * 100);
}

/** Magento detail row: `Référence :</div><div class="… product-attribute-value …">978…`. */
export function bdfugueAttributeValue(
  html: string,
  label: string,
): string | undefined {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = html.match(
    new RegExp(
      `${escaped}\\s*:?\\s*</div>\\s*<div[^>]*product-attribute-value[^>]*>\\s*([^<]+)`,
      "i",
    ),
  );
  return cleanHtmlText(match?.[1]);
}

export function parseBdFugueCredits(raw?: string | null): BdFugueCredit[] {
  if (!raw) return [];
  const credits: BdFugueCredit[] = [];
  for (const part of raw.split(/\s*\/\s*/)) {
    const trimmed = cleanHtmlText(part);
    if (!trimmed) continue;
    const roleMatch = trimmed.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
    if (roleMatch) {
      credits.push({
        name: roleMatch[1].trim(),
        role: roleMatch[2].trim(),
      });
    } else {
      credits.push({ name: trimmed });
    }
  }
  return credits;
}

export function parseBdFugueFrenchDate(
  raw?: string | null,
): string | undefined {
  if (!raw) return undefined;
  const cleaned = cleanHtmlText(raw);
  if (!cleaned) return undefined;
  if (/^\d{4}-\d{2}-\d{2}/.test(cleaned)) return cleaned.slice(0, 10);

  const match = cleaned.match(
    /(\d{1,2})\s+([A-Za-zÀ-ÿ.]+)\s+(\d{4})/i,
  );
  if (!match) return cleaned;
  const day = match[1].padStart(2, "0");
  const monthKey = match[2]
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\./g, "")
    .toLowerCase();
  const month =
    FR_MONTHS[monthKey] ||
    FR_MONTHS[monthKey.slice(0, 4)] ||
    FR_MONTHS[monthKey.slice(0, 3)];
  if (!month) return cleaned;
  return `${match[3]}-${month}-${day}`;
}

function barcodeFromCoverUrl(url?: string | null): string | undefined {
  if (!url) return undefined;
  const match = url.match(/\/(\d{13})(?:_[^/]*)?\.(?:jpe?g|png|webp)/i);
  return normalizeProductBarcode(match?.[1]) || undefined;
}

function productSchema(html: string): JsonLdSchema | undefined {
  return parseJsonLdBlocks(html).find((schema) => {
    const types = schemaTypes(schema?.["@type"]).map((type) =>
      type.toLowerCase().replace(/^https?:\/\/schema\.org\/?/i, ""),
    );
    return types.includes("product");
  });
}

function isProductPage(html: string, finalUrl: string): boolean {
  if (productSchema(html)) return true;
  return !/catalogsearch\/result/i.test(finalUrl);
}

function pageDescription(html: string): string | undefined {
  const match = html.match(
    /<(?:div|p)[^>]*(?:class|itemprop)=["'][^"']*(?:description|product\.attribute\.description)[^"']*["'][^>]*>([\s\S]*?)<\/(?:div|p)>/i,
  );
  const text = cleanHtmlText(match?.[1]);
  if (!text || text.length < 40) return undefined;
  // Magento SEO boilerplate often embeds stars / « 1ère Librairie ».
  if (/1ère Librairie|envois rapides/i.test(text) && text.length < 180) {
    return undefined;
  }
  return text;
}

export function parseBdFugueSearchHits(html: string): BdFugueSearchHit[] {
  const hits: BdFugueSearchHit[] = [];
  const seen = new Set<string>();

  for (const match of html.matchAll(
    /src=["'](https:\/\/www\.bdfugue\.com\/media\/catalog\/product\/[^"']+)["'][\s\S]{0,1200}?href=["'](https:\/\/www\.bdfugue\.com\/[^"'?#]+)["'][^>]*>\s*([^<]+)/gi,
  )) {
    const coverUrl = match[1];
    const productUrl = absoluteUrlFromBase(BDFUGUE_BASE_URL, match[2]);
    const title = cleanHtmlText(match[3]);
    if (!productUrl || !title || seen.has(productUrl)) continue;
    if (/catalogsearch|customer|checkout|wishlist|media\//i.test(productUrl)) {
      continue;
    }
    seen.add(productUrl);
    hits.push({
      title,
      productUrl,
      barcode: barcodeFromCoverUrl(coverUrl),
      coverUrl,
    });
  }

  return hits;
}

export function parseBdFugueProductPage(
  html: string,
  sourceUrl: string,
): BdFugueProduct | null {
  const schema = productSchema(html);
  const productUrl =
    absoluteUrlFromBase(BDFUGUE_BASE_URL, sourceUrl) || sourceUrl;

  const title =
    firstSchemaStringValue(schema?.name) ||
    cleanHtmlText(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]) ||
    cleanHtmlText(
      html
        .match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]
        ?.replace(/\s*[|\-–—]\s*BDfugue.*$/i, ""),
    );
  if (!title) return null;

  const coverUrl = absoluteUrlFromBase(
    BDFUGUE_BASE_URL,
    firstSchemaStringValue(schema?.image) ||
      html.match(
        /https:\/\/www\.bdfugue\.com\/media\/catalog\/product\/[^"'>\s]+/i,
      )?.[0],
  );

  const barcode =
    normalizeProductBarcode(firstSchemaStringValue(schema?.gtin13)) ||
    normalizeProductBarcode(firstSchemaStringValue(schema?.sku)) ||
    normalizeProductBarcode(firstSchemaStringValue(schema?.productID)) ||
    normalizeProductBarcode(bdfugueAttributeValue(html, "Référence")) ||
    barcodeFromCoverUrl(coverUrl);

  const authors = parseBdFugueCredits(
    bdfugueAttributeValue(html, "Auteur(s)") ||
      bdfugueAttributeValue(html, "Auteurs"),
  );

  const publisher =
    bdfugueAttributeValue(html, "Éditeur") ||
    bdfugueAttributeValue(html, "Editeur");

  const seriesName = bdfugueAttributeValue(html, "Série");
  const issueNumber = bdfugueAttributeValue(html, "Tome");
  const genre = bdfugueAttributeValue(html, "Genre(s)");
  const binding = bdfugueAttributeValue(html, "Reliure");
  const pageCountRaw = bdfugueAttributeValue(html, "Nombre de pages");
  const pageCount = pageCountRaw
    ? Number.parseInt(pageCountRaw.replace(/\D+/g, ""), 10)
    : undefined;

  const releaseDate = parseBdFugueFrenchDate(
    bdfugueAttributeValue(html, "date de parution") ||
      bdfugueAttributeValue(html, "Date de parution"),
  );

  const offer =
    schema?.offers && typeof schema.offers === "object"
      ? (schema.offers as { price?: unknown })
      : undefined;
  const priceCents = parseEuroPriceCents(
    offer?.price as string | number | null | undefined,
  );

  const aggregate = schema?.aggregateRating as
    | {
        ratingValue?: unknown;
        reviewCount?: unknown;
        bestRating?: unknown;
      }
    | undefined;
  let ratingValue: number | undefined;
  const rawRating = Number.parseFloat(String(aggregate?.ratingValue ?? ""));
  const bestRating = Number.parseFloat(String(aggregate?.bestRating ?? "5"));
  if (Number.isFinite(rawRating) && rawRating > 0) {
    ratingValue =
      Number.isFinite(bestRating) && bestRating > 5
        ? Math.round((rawRating / bestRating) * 5 * 100) / 100
        : rawRating;
  }
  const ratingCount = Number.parseInt(String(aggregate?.reviewCount ?? ""), 10);

  const description =
    pageDescription(html) ||
    (() => {
      const raw = firstSchemaStringValue(schema?.description);
      if (!raw || /1ère Librairie|envois rapides/i.test(raw)) return undefined;
      return raw;
    })();

  return {
    title,
    productUrl,
    barcode: barcode || undefined,
    description,
    coverUrl,
    authors,
    publisher,
    seriesName,
    issueNumber,
    pageCount:
      Number.isFinite(pageCount) && pageCount && pageCount > 0
        ? pageCount
        : undefined,
    genre,
    binding,
    releaseDate,
    priceCents,
    ratingValue,
    ratingCount:
      Number.isFinite(ratingCount) && ratingCount > 0 ? ratingCount : undefined,
  };
}

async function fetchBdFugueHtml(
  url: string,
  signal?: AbortSignal,
): Promise<{ html: string; finalUrl: string } | null> {
  try {
    const response = await fetchGetWithFlareFallback(url, {
      headers: BDFUGUE_HEADERS,
      responseType: "text",
      transformResponse: [(data) => data],
      timeout: 20_000,
      flareMaxTimeoutMs: 35_000,
      validateStatus: () => true,
      signal,
    });
    const html = String(response.data || "");
    if (response.status >= 400 || !html.trim()) return null;
    return {
      html,
      finalUrl: response.responseUrl || url,
    };
  } catch (error) {
    if (isAbortError(error)) throw error;
    return null;
  }
}

export async function fetchBdFugueProduct(
  productUrl: string,
  options: { signal?: AbortSignal } = {},
): Promise<BdFugueProduct | null> {
  const absolute = absoluteUrlFromBase(BDFUGUE_BASE_URL, productUrl);
  if (!absolute) return null;
  const page = await fetchBdFugueHtml(absolute, options.signal);
  if (!page) return null;
  return parseBdFugueProductPage(page.html, page.finalUrl);
}

export async function searchBdFugueHits(
  query: string,
  options: { signal?: AbortSignal } = {},
): Promise<BdFugueSearchHit[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const searchUrl = bdfugueSearchUrl(trimmed);

  const fromEvidence = await readBdFugueSearchEvidence(searchUrl);
  if (fromEvidence) {
    console.info(`[BD Fugue] Search evidence hit for ${searchUrl}`);
    return fromEvidence;
  }

  const page = await fetchBdFugueHtml(searchUrl, options.signal);
  if (!page) return [];

  let hits: BdFugueSearchHit[];
  // Exact ISBN often redirects straight to the product page.
  if (isProductPage(page.html, page.finalUrl)) {
    const product = parseBdFugueProductPage(page.html, page.finalUrl);
    if (product?.title) {
      hits = [
        {
          title: product.title,
          productUrl: product.productUrl,
          barcode: product.barcode,
          coverUrl: product.coverUrl,
        },
      ];
    } else {
      hits = [];
    }
  } else {
    hits = parseBdFugueSearchHits(page.html);
  }

  await promoteBdFugueSearchEvidence(searchUrl, hits);
  return hits;
}

function productMatchesBarcode(
  product: BdFugueProduct,
  itemBarcode: string,
): boolean {
  const gate = retailerCatalogBarcodeGate({
    productUrl: product.productUrl,
    productBarcode: product.barcode,
    itemBarcode,
  });
  if (gate.barcodeContradicted || gate.urlBarcodeConflicts) return false;
  return gate.catalogBarcodeConfirmed;
}

export async function fetchBdFugueByBarcode(
  barcode: string,
  options: { signal?: AbortSignal } = {},
): Promise<BdFugueProduct | null> {
  const normalized = normalizeProductBarcode(barcode);
  if (!normalized) return null;

  const page = await fetchBdFugueHtml(
    bdfugueSearchUrl(normalized),
    options.signal,
  );
  if (!page) return null;

  if (isProductPage(page.html, page.finalUrl)) {
    const product = parseBdFugueProductPage(page.html, page.finalUrl);
    if (product && productMatchesBarcode(product, normalized)) return product;
    return null;
  }

  const hits = parseBdFugueSearchHits(page.html);
  const preferred =
    hits.find(
      (hit) => hit.barcode && barcodesEquivalent(hit.barcode, normalized),
    ) || hits[0];
  if (!preferred) return null;

  const product = await fetchBdFugueProduct(preferred.productUrl, options);
  if (!product) return null;
  if (!productMatchesBarcode(product, normalized)) return null;
  return product;
}

export async function resolveBdFugueMetadata(input: {
  name?: string | null;
  barcode?: string | null;
  lookupQueries?: string[];
  signal?: AbortSignal;
}): Promise<BdFugueProduct | null> {
  const barcode = normalizeProductBarcode(input.barcode);

  if (barcode) {
    const byBarcode = await fetchBdFugueByBarcode(barcode, {
      signal: input.signal,
    });
    if (byBarcode) return byBarcode;
  }

  const queries =
    input.lookupQueries && input.lookupQueries.length > 0
      ? input.lookupQueries
      : [String(input.name || "").trim()].filter(Boolean);

  for (const query of queries) {
    if (!query.trim()) continue;
    const hits = await searchBdFugueHits(query, { signal: input.signal });
    for (const hit of hits.slice(0, 8)) {
      if (
        !acceptRetailerCatalogCandidate({
          requestedName: String(input.name || query),
          searchQuery: query,
          catalogTitle: hit.title,
          barcodeConfirmed: Boolean(
            barcode &&
              hit.barcode &&
              barcodesEquivalent(hit.barcode, barcode),
          ),
          itemBarcode: barcode,
        })
      ) {
        continue;
      }
      const product = await fetchBdFugueProduct(hit.productUrl, {
        signal: input.signal,
      });
      if (!product) continue;
      if (barcode && !productMatchesBarcode(product, barcode)) continue;
      if (
        !barcode &&
        !acceptRetailerCatalogCandidate({
          requestedName: String(input.name || query),
          searchQuery: query,
          catalogTitle: product.title,
          itemBarcode: barcode,
        })
      ) {
        continue;
      }
      return product;
    }
  }

  return null;
}
