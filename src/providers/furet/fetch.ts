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
  promoteFuretSearchEvidence,
  readFuretSearchEvidence,
} from "./durableEvidence";

const FURET_BASE_URL = "https://www.furet.com";
const FURET_HEADERS = { ...BROWSER_HTML_HEADERS };

export type FuretSearchHit = {
  title: string;
  productUrl: string;
  barcode?: string;
  coverUrl?: string;
  priceCents?: number;
};

export type FuretProduct = {
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
};

export function furetSearchUrl(query: string): string {
  const params = new URLSearchParams({ q: query.trim() });
  return `${FURET_BASE_URL}/rechercher/result?${params.toString()}`;
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
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.round(value * 100);
  }
  const match = String(value || "").match(/([0-9]+(?:[.,][0-9]{1,2})?)/);
  if (!match) return undefined;
  const amount = Number.parseFloat(match[1].replace(",", "."));
  if (!Number.isFinite(amount) || amount <= 0) return undefined;
  return Math.round(amount * 100);
}

export function furetAttributeValue(
  html: string,
  label: string,
): string | undefined {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = html.match(
    new RegExp(
      `caption\\s+title[^>]*>\\s*${escaped}\\s*<\\/span>\\s*<span[^>]*>\\s*([^<]+)`,
      "i",
    ),
  );
  return cleanHtmlText(match?.[1]);
}

function barcodeFromProductUrl(url: string): string | undefined {
  const match = url.match(/-(\d{10,13})(?:_[A-Z0-9]+)*\.html(?:[?#]|$)/i);
  return normalizeProductBarcode(match?.[1]) || undefined;
}

function bookSchema(html: string): JsonLdSchema | undefined {
  return parseJsonLdBlocks(html).find((schema) => {
    const types = schemaTypes(schema?.["@type"]).map((type) =>
      type.toLowerCase(),
    );
    return types.includes("book") || types.includes("product");
  });
}

export function parseFuretSearchHits(html: string): FuretSearchHit[] {
  const hits: FuretSearchHit[] = [];
  const seen = new Set<string>();

  for (const match of html.matchAll(
    /<a[^>]+href=["']([^"']*\/livres\/[^"']*-(\d{10,13})(?:_[A-Z0-9]+)*\.html)["'][^>]*>([\s\S]*?)<\/a>/gi,
  )) {
    const productUrl = absoluteUrlFromBase(FURET_BASE_URL, match[1]);
    const barcode = normalizeProductBarcode(match[2]) || undefined;
    if (!productUrl || seen.has(productUrl)) continue;

    const title =
      cleanHtmlText(match[3].replace(/<[^>]+>/g, " ")) ||
      cleanHtmlText(
        match[1].match(/\/livres\/(.+)-\d{10,13}/i)?.[1]?.replace(/-/g, " "),
      );
    if (!title || title.length < 2) continue;
    if (/^(tout voir|types de|accueil)$/i.test(title)) continue;

    seen.add(productUrl);
    hits.push({ title, productUrl, barcode });
  }

  return hits;
}

export function parseFuretProductPage(
  html: string,
  sourceUrl: string,
): FuretProduct | null {
  const schema = bookSchema(html);
  const productUrl =
    absoluteUrlFromBase(FURET_BASE_URL, sourceUrl) || sourceUrl;

  const title =
    firstSchemaStringValue(schema?.name) ||
    cleanHtmlText(
      html
        .match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]
        ?.replace(/\s*[|\-–—]\s*Furet du Nord\s*$/i, ""),
    ) ||
    cleanHtmlText(
      html.match(/class=["'][^"']*product-title[^"']*["'][^>]*>([^<]+)/i)?.[1],
    );
  if (!title) return null;

  const description = firstSchemaStringValue(schema?.description);
  const coverUrl = absoluteUrlFromBase(
    FURET_BASE_URL,
    firstSchemaStringValue(schema?.image) ||
      html.match(
        /https:\/\/products-images\.di-static\.com\/image\/[^"'>\s]+/i,
      )?.[0],
  );

  const isbnRaw =
    firstSchemaStringValue(schema?.isbn) || furetAttributeValue(html, "ISBN");
  const barcode =
    normalizeProductBarcode(furetAttributeValue(html, "EAN")) ||
    normalizeProductBarcode(isbnRaw) ||
    barcodeFromProductUrl(productUrl);

  const authors = schemaNames(schema?.author);
  const publisher =
    firstSchemaStringValue(
      schema?.publisher && typeof schema.publisher === "object"
        ? (schema.publisher as { name?: unknown }).name
        : schema?.publisher,
    ) || furetAttributeValue(html, "Éditeur");

  const pageCountRaw =
    furetAttributeValue(html, "Nombre de pages") ||
    firstSchemaStringValue(schema?.numberOfPages);
  const pageCount = pageCountRaw
    ? Number.parseInt(pageCountRaw.replace(/\D+/g, ""), 10)
    : undefined;

  const releaseDate =
    firstSchemaStringValue(schema?.datePublished) ||
    (() => {
      const raw = furetAttributeValue(html, "Date de parution");
      if (!raw) return undefined;
      const m = raw.match(/(\d{2})\/(\d{2})\/(\d{4})/);
      return m ? `${m[3]}-${m[2]}-${m[1]}` : raw;
    })();

  const offer =
    schema?.offers && typeof schema.offers === "object"
      ? (schema.offers as { price?: unknown })
      : undefined;
  const priceCents =
    parseEuroCents(offer?.price as string | number | null | undefined) ||
    parseEuroCents(html.match(/(\d+[.,]\d{2})\s*€/)?.[1]);

  return {
    title,
    productUrl,
    barcode: barcode || undefined,
    description,
    coverUrl,
    authors,
    publisher,
    pageCount:
      Number.isFinite(pageCount) && pageCount && pageCount > 0
        ? pageCount
        : undefined,
    releaseDate,
    priceCents,
  };
}

async function fetchFuretHtml(
  url: string,
  signal?: AbortSignal,
): Promise<{ html: string; finalUrl: string } | null> {
  try {
    const response = await fetchGetWithFlareFallback(url, {
      headers: FURET_HEADERS,
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

export async function fetchFuretProduct(
  productUrl: string,
  options: { signal?: AbortSignal } = {},
): Promise<FuretProduct | null> {
  const absolute = absoluteUrlFromBase(FURET_BASE_URL, productUrl);
  if (!absolute) return null;
  const page = await fetchFuretHtml(absolute, options.signal);
  if (!page) return null;
  return parseFuretProductPage(page.html, page.finalUrl);
}

export async function searchFuretHits(
  query: string,
  options: { signal?: AbortSignal } = {},
): Promise<FuretSearchHit[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const searchUrl = furetSearchUrl(trimmed);

  const fromEvidence = await readFuretSearchEvidence(searchUrl);
  if (fromEvidence) {
    console.info(`[Furet] Search evidence hit for ${searchUrl}`);
    return fromEvidence;
  }

  const page = await fetchFuretHtml(searchUrl, options.signal);
  if (!page) return [];
  const hits = parseFuretSearchHits(page.html);
  await promoteFuretSearchEvidence(searchUrl, hits);
  return hits;
}

function productMatchesBarcode(
  product: FuretProduct,
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

export async function fetchFuretByBarcode(
  barcode: string,
  options: { signal?: AbortSignal } = {},
): Promise<FuretProduct | null> {
  const normalized = normalizeProductBarcode(barcode);
  if (!normalized) return null;

  const hits = await searchFuretHits(normalized, options);
  const preferred =
    hits.find(
      (hit) => hit.barcode && barcodesEquivalent(hit.barcode, normalized),
    ) ||
    hits.find((hit) =>
      retailerProductBarcodeConfirmed(hit.productUrl, hit.barcode, normalized),
    );

  if (!preferred) return null;

  const product = await fetchFuretProduct(preferred.productUrl, options);
  if (!product) return null;
  if (!productMatchesBarcode(product, normalized)) return null;
  return product;
}

export async function resolveFuretMetadata(input: {
  name?: string | null;
  barcode?: string | null;
  lookupQueries?: string[];
  signal?: AbortSignal;
}): Promise<FuretProduct | null> {
  const barcode = normalizeProductBarcode(input.barcode);

  if (barcode) {
    const byBarcode = await fetchFuretByBarcode(barcode, {
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
    const hits = await searchFuretHits(query, { signal: input.signal });
    for (const hit of hits.slice(0, 8)) {
      if (
        !acceptRetailerCatalogCandidate({
          requestedName: String(input.name || query),
          searchQuery: query,
          catalogTitle: hit.title,
          barcodeConfirmed: Boolean(
            barcode && hit.barcode && barcodesEquivalent(hit.barcode, barcode),
          ),
          itemBarcode: barcode,
        })
      ) {
        continue;
      }
      const product = await fetchFuretProduct(hit.productUrl, {
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

export async function collectFuretMappingRawKeys(
  barcode: string,
): Promise<string[]> {
  const hits = await searchFuretHits(barcode);
  const product = hits[0] ? await fetchFuretProduct(hits[0].productUrl) : null;
  return collectObjectMappingSignals({ hits: hits.slice(0, 3), product });
}
