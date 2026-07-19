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

const DECITRE_BASE_URL = "https://www.decitre.fr";
const DECITRE_HEADERS = { ...BROWSER_HTML_HEADERS };

export type DecitreSearchHit = {
  title: string;
  productUrl: string;
  barcode?: string;
  coverUrl?: string;
  priceCents?: number;
  author?: string;
};

export type DecitreProduct = {
  title: string;
  productUrl: string;
  barcode?: string;
  isbn?: string;
  description?: string;
  coverUrl?: string;
  authors: string[];
  translators: string[];
  publisher?: string;
  pageCount?: number;
  bookFormat?: string;
  releaseDate?: string;
  priceCents?: number;
};


export function decitreSearchUrl(query: string): string {
  const params = new URLSearchParams({ search: query.trim() });
  return `${DECITRE_BASE_URL}/search?${params.toString()}`;
}

function schemaNames(value: unknown): string[] {
  const raw = Array.isArray(value) ? value : value ? [value] : [];
  return Array.from(
    new Set(
      raw
        .map(firstSchemaStringValue)
        .filter((item): item is string => Boolean(item)),
    ),
  );
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

/** Product-attribute row: `<span class="caption title">EAN</span><span …>978…</span>`. */
export function decitreAttributeValue(
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
  const match = url.match(/-(\d{10,13})(?:_\d+)*\.html(?:[?#]|$)/i);
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

export function parseDecitreSearchHits(html: string): DecitreSearchHit[] {
  const hits: DecitreSearchHit[] = [];
  const seen = new Set<string>();

  for (const match of html.matchAll(
    /<a[^>]+href=["']([^"']*\/(?:livres|ebooks)\/[^"']*-(\d{10,13})(?:_\d+)*\.html)["'][^>]*>([\s\S]*?)<\/a>/gi,
  )) {
    const productUrl = absoluteUrlFromBase(DECITRE_BASE_URL, match[1]);
    const barcode = normalizeProductBarcode(match[2]) || undefined;
    if (!productUrl || seen.has(productUrl)) continue;

    const title =
      cleanHtmlText(match[3].replace(/<[^>]+>/g, " ")) ||
      cleanHtmlText(
        match[1]
          .match(/\/(?:livres|ebooks)\/(.+)-\d{10,13}/i)?.[1]
          ?.replace(/-/g, " "),
      );
    if (!title || title.length < 2) continue;
    // Skip nav / “tout voir” noise.
    if (/^(tout voir|types de|accueil)$/i.test(title)) continue;

    seen.add(productUrl);
    hits.push({ title, productUrl, barcode });
  }

  return hits;
}

export function parseDecitreProductPage(
  html: string,
  sourceUrl: string,
): DecitreProduct | null {
  const schema = bookSchema(html);
  const productUrl = absoluteUrlFromBase(DECITRE_BASE_URL, sourceUrl) || sourceUrl;

  const title =
    firstSchemaStringValue(schema?.name) ||
    cleanHtmlText(
      html
        .match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]
        ?.replace(/\s*[|\-–—]\s*Decitre\s*$/i, ""),
    );
  if (!title) return null;

  const description = firstSchemaStringValue(schema?.description);
  const coverUrl = absoluteUrlFromBase(DECITRE_BASE_URL, 
    firstSchemaStringValue(schema?.image) ||
      html.match(
        /https:\/\/products-images\.di-static\.com\/image\/[^"'>\s]+/i,
      )?.[0],
  );

  const isbnRaw =
    firstSchemaStringValue(schema?.isbn) || decitreAttributeValue(html, "ISBN");
  const barcode =
    normalizeProductBarcode(decitreAttributeValue(html, "EAN")) ||
    normalizeProductBarcode(isbnRaw) ||
    barcodeFromProductUrl(productUrl);

  const authors = schemaNames(schema?.author);
  const translatorAttr = decitreAttributeValue(html, "Traducteur");
  const translators = translatorAttr ? [translatorAttr] : [];

  const publisher =
    firstSchemaStringValue(
      schema?.publisher && typeof schema.publisher === "object"
        ? (schema.publisher as { name?: unknown }).name
        : schema?.publisher,
    ) || decitreAttributeValue(html, "Éditeur");

  const pageCountRaw =
    decitreAttributeValue(html, "Nombre de pages") ||
    firstSchemaStringValue(schema?.numberOfPages);
  const pageCount = pageCountRaw
    ? Number.parseInt(pageCountRaw.replace(/\D+/g, ""), 10)
    : undefined;

  const bookFormat =
    firstSchemaStringValue(schema?.bookFormat) ||
    decitreAttributeValue(html, "Format");

  const releaseDate =
    firstSchemaStringValue(schema?.datePublished) ||
    (() => {
      const raw = decitreAttributeValue(html, "Date de parution");
      if (!raw) return undefined;
      const m = raw.match(/(\d{2})\/(\d{2})\/(\d{4})/);
      return m ? `${m[3]}-${m[2]}-${m[1]}` : raw;
    })();

  const offer =
    schema?.offers && typeof schema.offers === "object"
      ? (schema.offers as { price?: unknown })
      : undefined;
  const priceCents =
    parseEuroPriceCents(offer?.price as string | number | null | undefined) ||
    parseEuroPriceCents(
      html.match(/(\d+[.,]\d{2})\s*€/)?.[1],
    );

  return {
    title,
    productUrl,
    barcode: barcode || undefined,
    isbn: isbnRaw || undefined,
    description,
    coverUrl,
    authors,
    translators,
    publisher,
    pageCount:
      Number.isFinite(pageCount) && pageCount && pageCount > 0
        ? pageCount
        : undefined,
    bookFormat,
    releaseDate,
    priceCents,
  };
}

async function fetchDecitreHtml(
  url: string,
  signal?: AbortSignal,
): Promise<{ html: string; finalUrl: string } | null> {
  try {
    const response = await fetchGetWithFlareFallback(url, {
      headers: DECITRE_HEADERS,
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

export async function fetchDecitreProduct(
  productUrl: string,
  options: { signal?: AbortSignal } = {},
): Promise<DecitreProduct | null> {
  const absolute = absoluteUrlFromBase(DECITRE_BASE_URL, productUrl);
  if (!absolute) return null;
  const page = await fetchDecitreHtml(absolute, options.signal);
  if (!page) return null;
  return parseDecitreProductPage(page.html, page.finalUrl);
}

export async function searchDecitreHits(
  query: string,
  options: { signal?: AbortSignal } = {},
): Promise<DecitreSearchHit[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const page = await fetchDecitreHtml(decitreSearchUrl(trimmed), options.signal);
  if (!page) return [];
  return parseDecitreSearchHits(page.html);
}

function productMatchesBarcode(
  product: DecitreProduct,
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

export async function fetchDecitreByBarcode(
  barcode: string,
  options: { signal?: AbortSignal } = {},
): Promise<DecitreProduct | null> {
  const normalized = normalizeProductBarcode(barcode);
  if (!normalized) return null;

  const hits = await searchDecitreHits(normalized, options);
  const preferred =
    hits.find(
      (hit) =>
        hit.barcode && barcodesEquivalent(hit.barcode, normalized),
    ) ||
    hits.find((hit) =>
      retailerProductBarcodeConfirmed(hit.productUrl, hit.barcode, normalized),
    );

  if (!preferred) return null;

  const product = await fetchDecitreProduct(preferred.productUrl, options);
  if (!product) return null;
  if (!productMatchesBarcode(product, normalized)) return null;
  return product;
}

export async function resolveDecitreMetadata(input: {
  name?: string | null;
  barcode?: string | null;
  lookupQueries?: string[];
  signal?: AbortSignal;
}): Promise<DecitreProduct | null> {
  const barcode = normalizeProductBarcode(input.barcode);

  if (barcode) {
    const byBarcode = await fetchDecitreByBarcode(barcode, {
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
    const hits = await searchDecitreHits(query, { signal: input.signal });
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
      const product = await fetchDecitreProduct(hit.productUrl, {
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
