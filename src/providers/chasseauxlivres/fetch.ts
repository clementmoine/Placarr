import { randomUUID } from "node:crypto";

import axios from "axios";
import { decode as decodeHTMLEntities } from "html-entities";
import { normalizeProductBarcode } from "@/core/identify/normalize";
import { retailerCatalogBarcodeGate } from "@/core/commerce/retailer/productUrl";
import {
  flareSolverrDestroySession,
  flareSolverrRequestGet,
} from "@/lib/http/flareSolverr";
import { isAbortError } from "@/lib/http/abort";

export interface ChasseAuxLivresProduct {
  name: string;
  coverUrl?: string;
  images?: string[];
  productUrl?: string;
  sku?: string;
  barcode?: string | null;
  description?: string;
  authors?: string[];
  publisher?: string;
  category?: string;
  ratingValue?: number;
  ratingCount?: number;
  priceNew?: number; // landed cents (item + shipping), single-product resolution
  priceUsed?: number; // landed cents (item + shipping), single-product resolution
  priceNewItem?: number;
  priceUsedItem?: number;
  shippingNew?: number;
  shippingUsed?: number;
}

type ChasseProductValidator = (product: ChasseAuxLivresProduct) => boolean;

type ChasseResolveOptions = {
  validateProduct?: ChasseProductValidator;
  anchoredItemBarcode?: string | null;
  signal?: AbortSignal;
};

function chasseCatalogBarcodeConfirmed(
  product: ChasseAuxLivresProduct,
  itemBarcode: string,
): boolean {
  const gate = retailerCatalogBarcodeGate({
    productUrl: product.productUrl,
    productBarcode: product.barcode,
    itemBarcode,
  });
  return (
    gate.catalogBarcodeConfirmed &&
    !gate.barcodeContradicted &&
    !gate.urlBarcodeConflicts
  );
}

const CHASSE_SEARCH_PAGE_BATCH = 1;
const CHASSE_SEARCH_MAX_PAGES = 3;
const CHASSE_SEARCH_MAX_PAGES_ANCHORED = 8;

type ChassePageHtml = {
  html: string;
  finalUrl: string;
  flareSession?: string;
};

function chasseSearchMaxPages(anchoredItemBarcode?: string | null): number {
  return normalizeProductBarcode(anchoredItemBarcode)
    ? CHASSE_SEARCH_MAX_PAGES_ANCHORED
    : CHASSE_SEARCH_MAX_PAGES;
}

function extractChasseSearchContext(
  html: string,
): { hash: string; duih: string } | null {
  const hashContMatch = html.match(
    /id="hash-cont"[^>]*data-hash="([^"]+)"[^>]*data-duih="([^"]*)"/i,
  );
  if (hashContMatch) {
    return { hash: hashContMatch[1], duih: hashContMatch[2] ?? "" };
  }

  const hash = html.match(/data-hash="([^"]+)"/)?.[1];
  if (!hash) return null;
  const duih = html.match(/data-duih="([^"]*)"/)?.[1] ?? "";
  return { hash, duih };
}

function buildChasseSearchResultsUrl(
  hash: string,
  page: number,
  duih: string,
): string {
  const params = new URLSearchParams({
    h: hash,
    p: String(page),
    l: String(CHASSE_SEARCH_PAGE_BATCH),
    duih,
  });
  return `https://www.chasse-aux-livres.fr/rest/search-results?${params.toString()}`;
}

function parseChasseSearchResultsPayload(
  raw: unknown,
): ChasseSearchPayload | null {
  if (raw && typeof raw === "object") return raw as ChasseSearchPayload;
  if (typeof raw !== "string") return null;

  const trimmed = raw.trim();
  if (trimmed.startsWith("{")) {
    try {
      return JSON.parse(trimmed) as ChasseSearchPayload;
    } catch {
      return null;
    }
  }

  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  try {
    return JSON.parse(jsonMatch[0]) as ChasseSearchPayload;
  } catch {
    return null;
  }
}

async function createChasseFlareSession(
  searchUrl: string,
  signal?: AbortSignal,
): Promise<{ session: string; html: string } | null> {
  const session = `placarr-chasse-${randomUUID()}`;
  const html = await flareSolverrRequestGet(searchUrl, {
    session,
    maxTimeoutMs: CHASSE_FLARESOLVERR_TIMEOUT_MS,
    signal,
  });
  if (!html || isProtectedLoginPage(html, searchUrl)) {
    await flareSolverrDestroySession(session, signal);
    return null;
  }
  return { session, html };
}

const CHASSE_AUX_LIVRES_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
  "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
  Referer: "https://www.chasse-aux-livres.fr/",
};
const CHASSE_AUX_LIVRES_TIMEOUT_MS = 8_000;
const CHASSE_FLARESOLVERR_TIMEOUT_MS = 25_000;

function chasseDirectSearchPageIsUsable(
  html: string,
  finalUrl: string,
): boolean {
  if (finalUrl.includes("/prix/")) return true;
  return extractChasseSearchContext(html) !== null;
}

function chasseDirectPageIsUsable(
  html: string,
  finalUrl: string,
  requestUrl: string,
): boolean {
  if (finalUrl.includes("/prix/") || requestUrl.includes("/prix/")) {
    const product = parseChasseAuxLivresProductPage(html, finalUrl);
    return Boolean(product?.name && product?.sku);
  }
  if (requestUrl.includes("/search?")) {
    return chasseDirectSearchPageIsUsable(html, finalUrl);
  }
  return true;
}

async function fetchChassePageHtml(
  url: string,
  signal?: AbortSignal,
  options: { flareSession?: string } = {},
): Promise<ChassePageHtml | null> {
  if (options.flareSession) {
    const flareHtml = await flareSolverrRequestGet(url, {
      session: options.flareSession,
      maxTimeoutMs: CHASSE_FLARESOLVERR_TIMEOUT_MS,
      signal,
    });
    if (!flareHtml || isProtectedLoginPage(flareHtml, url)) return null;
    return {
      html: flareHtml,
      finalUrl: url,
      flareSession: options.flareSession,
    };
  }

  try {
    const response = await axios.get(url, {
      headers: CHASSE_AUX_LIVRES_HEADERS,
      timeout: CHASSE_AUX_LIVRES_TIMEOUT_MS,
      responseType: "text",
      transformResponse: [(body) => body],
      signal,
    });
    const html = String(response.data || "");
    const finalUrl = response.request?.res?.responseUrl || url;
    if (
      html &&
      !isProtectedLoginPage(html, finalUrl) &&
      chasseDirectPageIsUsable(html, finalUrl, url)
    ) {
      return { html, finalUrl };
    }
  } catch (error) {
    if (isAbortError(error)) throw error;
    // Fall through to FlareSolverr when direct access is blocked.
  }

  const session = `placarr-chasse-${randomUUID()}`;
  const flareHtml = await flareSolverrRequestGet(url, {
    session,
    maxTimeoutMs: CHASSE_FLARESOLVERR_TIMEOUT_MS,
    signal,
  });
  if (!flareHtml || isProtectedLoginPage(flareHtml, url)) {
    await flareSolverrDestroySession(session, signal);
    return null;
  }
  return { html: flareHtml, finalUrl: url, flareSession: session };
}

function describeChasseError(error: unknown): string {
  const requestError = error as {
    response?: { status?: number };
    code?: string;
    message?: string;
    cause?: { code?: string; message?: string };
  };
  const status = requestError.response?.status;
  if (typeof status === "number") return `HTTP ${status}`;
  const code = requestError.code || requestError.cause?.code;
  const message = error instanceof Error ? error.message : requestError.message;
  return [code, message].filter(Boolean).join(" - ") || "unknown error";
}

function buildSearchUrl(barcode: string, catalog: string): string {
  return `https://www.chasse-aux-livres.fr/search?query=${encodeURIComponent(barcode)}&catalog=${encodeURIComponent(catalog)}`;
}

function absoluteChasseUrl(value?: string | null): string | undefined {
  if (!value) return undefined;
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith("/")) return `https://www.chasse-aux-livres.fr${value}`;
  return `https://www.chasse-aux-livres.fr/${value}`;
}

function chasseProductUrlFromQuery(query: string): string | null {
  try {
    const url = new URL(query);
    if (!/(^|\.)chasse-aux-livres\.fr$/i.test(url.hostname)) return null;
    if (!url.pathname.includes("/prix/")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function cleanText(value?: string | null): string | undefined {
  const text = decodeHTMLEntities(String(value || ""))
    .replace(/\s+/g, " ")
    .trim();
  return text || undefined;
}

function isProtectedLoginPage(html: string, finalUrl = ""): boolean {
  return (
    finalUrl.includes("/login?protect=true") ||
    /<title[^>]*>\s*Connexion\s+-\s+Chasse aux livres/i.test(html)
  );
}

function parseRedirProduct(redir: string): ChasseAuxLivresProduct | null {
  const parts = redir.split("?")[0].split("/");
  const slug = parts[parts.length - 1];
  if (!slug) return null;

  const title = decodeHTMLEntities(
    slug
      .split("-")
      .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" "),
  ).trim();

  return title ? { name: title } : null;
}

type JsonLdSchema = Record<string, unknown>;

function parseJsonLdBlocks(html: string): JsonLdSchema[] {
  const blocks: JsonLdSchema[] = [];
  for (const match of html.matchAll(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    try {
      const parsed = JSON.parse(decodeHTMLEntities(match[1].trim()));
      if (Array.isArray(parsed)) blocks.push(...parsed);
      else if (parsed && typeof parsed === "object") blocks.push(parsed);
    } catch {
      // Ignore malformed schema snippets.
    }
  }
  return blocks;
}

function schemaTypes(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  return value ? [String(value)] : [];
}

function firstSchemaValue(value: unknown): string | undefined {
  if (typeof value === "string") return cleanText(value);
  if (Array.isArray(value)) {
    for (const item of value) {
      const parsed = firstSchemaValue(item);
      if (parsed) return parsed;
    }
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return firstSchemaValue(record.name || record.value || record.text);
  }
  return undefined;
}

function schemaNames(value: unknown): string[] {
  const raw = Array.isArray(value) ? value : value ? [value] : [];
  return raw
    .map(firstSchemaValue)
    .filter((item): item is string => Boolean(item));
}

function parseNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const text = cleanText(String(value || ""));
  if (!text) return undefined;
  const parsed = Number(text.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function metaContent(html: string, key: string): string | undefined {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const propertyFirst = html.match(
    new RegExp(
      `<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`,
      "i",
    ),
  );
  if (propertyFirst?.[1]) return cleanText(propertyFirst[1]);

  const contentFirst = html.match(
    new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["'][^>]*>`,
      "i",
    ),
  );
  return cleanText(contentFirst?.[1]);
}

function parsePublisherFromHtml(html: string): string | undefined {
  const biblioMatch = html.match(
    /<div[^>]*id=["']biblio-lines["'][^>]*>([\s\S]*?)<\/div>\s*<\/div>/i,
  );
  const text = cleanText(biblioMatch?.[1]?.replace(/<[^>]+>/g, " "));
  const publisher = text?.match(/\bParu chez\s+(.+?)(?:\s+-|$)/i)?.[1];
  return cleanText(publisher);
}

const CHASSE_PRODUCT_MEDIA_PATH = /\/v7\/(?:_zmx1_|_fns2_|_xkp3_|photo)\//i;

function isChasseProductMediaUrl(url: string): boolean {
  if (!CHASSE_PRODUCT_MEDIA_PATH.test(url)) return false;
  if (/\/v7\/_c_\//i.test(url)) return false;
  return /\.(?:jpe?g|png|webp)$/i.test(url);
}

/** Product header only — marketplace offer rows live under `#offers`. */
function extractChasseProductHeaderHtml(html: string): string {
  const offersIdx = html.search(/\bid=["']offers["']/i);
  return offersIdx >= 0 ? html.slice(0, offersIdx) : html;
}

function pushUniqueChasseImage(
  images: string[],
  seen: Set<string>,
  rawUrl?: string | null,
): void {
  const normalized = absoluteChasseUrl(rawUrl?.split("?")[0]);
  if (!normalized || !isChasseProductMediaUrl(normalized)) return;
  const key = normalized.toLowerCase();
  if (seen.has(key)) return;
  seen.add(key);
  images.push(normalized);
}

function extractChasseDataThumbsGallery(html: string): string[] {
  const match =
    html.match(
      /\bid=["']book-details["'][^>]*\bdata-thumbs=["'](\[[\s\S]*?\])["']/i,
    ) ??
    html.match(
      /\bdata-thumbs=["'](\[[\s\S]*?\])["'][^>]*\bid=["']book-details["']/i,
    );
  if (!match?.[1]) return [];

  try {
    const parsed = JSON.parse(decodeHTMLEntities(match[1])) as Array<{
      thumb?: string;
      full?: string;
    }>;
    if (!Array.isArray(parsed)) return [];

    const seen = new Set<string>();
    const images: string[] = [];
    for (const entry of parsed) {
      pushUniqueChasseImage(images, seen, entry.full || entry.thumb);
    }
    return images;
  } catch {
    return [];
  }
}

function extractChasseHeaderImgGallery(html: string): string[] {
  const header = extractChasseProductHeaderHtml(html);
  const seen = new Set<string>();
  const images: string[] = [];

  for (const match of header.matchAll(/<img\b[^>]*>/gi)) {
    const tag = match[0];
    const src =
      tag.match(/\bsrc=["']([^"']+)["']/i)?.[1] ||
      tag.match(/\bdata-forhisto=["']([^"']+)["']/i)?.[1];
    pushUniqueChasseImage(images, seen, src);
  }

  return images;
}

export function extractChasseAuxLivresProductImages(html: string): string[] {
  const fromThumbs = extractChasseDataThumbsGallery(html);
  if (fromThumbs.length > 0) return fromThumbs;
  return extractChasseHeaderImgGallery(html);
}

export function parseChasseAuxLivresProductPage(
  html: string,
  productUrl?: string,
): ChasseAuxLivresProduct | null {
  const schemas = parseJsonLdBlocks(html);
  const productSchema = schemas.find((schema) => {
    const types = schemaTypes(schema?.["@type"]).map((type) =>
      type.toLowerCase(),
    );
    return types.includes("product") || types.includes("book");
  });

  const name =
    firstSchemaValue(productSchema?.name) ||
    metaContent(html, "og:title") ||
    html
      .match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]
      ?.replace(/\s+-\s+les Prix.*$/i, "");
  const cleanName = cleanText(name);
  if (!cleanName) return null;

  const image =
    firstSchemaValue(productSchema?.image) ||
    metaContent(html, "og:image") ||
    metaContent(html, "twitter:image") ||
    html.match(/<img[^>]*id=["']book-cover["'][^>]*src=["']([^"']+)["']/i)?.[1];
  const galleryImages = extractChasseAuxLivresProductImages(html);
  const coverUrl =
    absoluteChasseUrl(
      (Array.isArray(image) ? image[0] : image)?.split("?")[0],
    ) || galleryImages[0];
  const aggregateRating = productSchema?.aggregateRating as
    | { ratingValue?: unknown; ratingCount?: unknown }
    | undefined;
  const sku =
    firstSchemaValue(productSchema?.sku) ||
    productUrl?.match(/\/prix\/([^/]+)/)?.[1];
  const barcode =
    normalizeProductBarcode(firstSchemaValue(productSchema?.isbn)) ||
    normalizeProductBarcode(firstSchemaValue(productSchema?.gtin13)) ||
    normalizeProductBarcode(
      html.match(/\b(?:EAN|ISBN(?:-13)?)\D{0,24}(\d[\d\s-]{10,20}\d)/i)?.[1],
    );

  return {
    name: cleanName,
    coverUrl,
    images:
      galleryImages.length > 0
        ? galleryImages
        : coverUrl
          ? [coverUrl]
          : undefined,
    productUrl,
    sku: cleanText(sku),
    barcode,
    description:
      firstSchemaValue(productSchema?.description) ||
      metaContent(html, "description") ||
      metaContent(html, "og:description"),
    authors: schemaNames(productSchema?.author),
    publisher:
      firstSchemaValue(productSchema?.publisher) ||
      parsePublisherFromHtml(html),
    category: firstSchemaValue(productSchema?.category),
    ratingValue: parseNumber(aggregateRating?.ratingValue),
    ratingCount: parseNumber(aggregateRating?.ratingCount),
  };
}

function extractCoverFromListing(
  html: string,
  redir?: string,
): string | undefined {
  if (!html) return undefined;

  if (redir) {
    const hrefPattern = redir.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const linkedImg = html.match(
      new RegExp(
        `<a[^>]*href="${hrefPattern}"[^>]*>[\\s\\S]*?<img[^>]*src="([^"]+)"`,
        "i",
      ),
    );
    if (linkedImg?.[1]) {
      return linkedImg[1].split("?")[0];
    }
  }

  const srcAlt = html.match(/<img[^>]*src="([^"]+)"[^>]*alt="([^"]+)"/i);
  if (srcAlt?.[1]) return srcAlt[1].split("?")[0];

  const altSrc = html.match(/<img[^>]*alt="([^"]+)"[^>]*src="([^"]+)"/i);
  if (altSrc?.[2]) return altSrc[2].split("?")[0];

  return undefined;
}

function parseListingProducts(html: string): ChasseAuxLivresProduct[] {
  const products: ChasseAuxLivresProduct[] = [];

  for (const match of html.matchAll(
    /<a[^>]*href="([^"]*\/prix\/[^"]+)"[^>]*>[\s\S]*?<img[^>]*src="([^"]+)"[^>]*alt="([^"]+)"/gi,
  )) {
    const name = cleanText(match[3]);
    if (name && !products.some((product) => product.name === name)) {
      products.push({
        name,
        productUrl: absoluteChasseUrl(match[1]),
        coverUrl: absoluteChasseUrl(match[2].split("?")[0]),
      });
    }
  }

  for (const match of html.matchAll(
    /<img[^>]*src="([^"]+)"[^>]*alt="([^"]+)"/gi,
  )) {
    const coverUrl = absoluteChasseUrl(match[1].split("?")[0]);
    const name = cleanText(match[2]);
    if (name && !products.some((product) => product.name === name)) {
      products.push({ name, coverUrl });
    }
  }

  if (products.length === 0) {
    for (const match of html.matchAll(
      /<img[^>]*alt="([^"]+)"[^>]*src="([^"]+)"/gi,
    )) {
      const name = cleanText(match[1]);
      const coverUrl = absoluteChasseUrl(match[2].split("?")[0]);
      if (name && !products.some((product) => product.name === name)) {
        products.push({ name, coverUrl });
      }
    }
  }

  if (products.length === 0) {
    const titleMatch = html.match(/title="([^"]+)"/);
    if (titleMatch) {
      const name = cleanText(titleMatch[1]);
      products.push({
        name: name || titleMatch[1].trim(),
      });
    }
  }

  return products;
}

function uniqueProductUrls(products: ChasseAuxLivresProduct[]): string[] {
  const urls: string[] = [];
  const seen = new Set<string>();
  for (const product of products) {
    const url = absoluteChasseUrl(product.productUrl);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    urls.push(url);
  }
  return urls;
}

type ChasseSearchPayload = { redir?: unknown; d?: unknown; c?: number };

function searchResultCandidates(
  data: ChasseSearchPayload | null | undefined,
): string[] {
  const redir = typeof data?.redir === "string" ? data.redir.trim() : "";
  return uniqueProductUrls([
    ...(redir ? [{ name: "", productUrl: redir }] : []),
    ...parseListingProducts(String(data?.d || "")),
  ]);
}

async function fetchChasseSearchResultsPage(
  searchUrl: string,
  context: { hash: string; duih: string },
  page: number,
  options: { flareSession?: string; signal?: AbortSignal } = {},
): Promise<ChasseSearchPayload | null> {
  const resultsUrl = buildChasseSearchResultsUrl(
    context.hash,
    page,
    context.duih,
  );

  if (options.flareSession) {
    const html = await flareSolverrRequestGet(resultsUrl, {
      session: options.flareSession,
      maxTimeoutMs: CHASSE_FLARESOLVERR_TIMEOUT_MS,
      signal: options.signal,
    });
    return parseChasseSearchResultsPayload(html);
  }

  try {
    const resultsRes = await axios.get(resultsUrl, {
      headers: {
        ...CHASSE_AUX_LIVRES_HEADERS,
        Referer: searchUrl,
      },
      timeout: CHASSE_AUX_LIVRES_TIMEOUT_MS,
      signal: options.signal,
      validateStatus: () => true,
    });
    const payload = parseChasseSearchResultsPayload(resultsRes.data);
    if (payload && (payload.c ?? 0) > 0) return payload;
  } catch (error) {
    if (isAbortError(error)) throw error;
  }

  return null;
}

async function resolveChasseSearchProductPage(
  searchUrl: string,
  html: string,
  options: {
    validateProduct?: ChasseProductValidator;
    anchoredBarcode?: string;
    flareSession?: string;
    signal?: AbortSignal;
  },
): Promise<{
  url: string;
  html: string;
  product: ChasseAuxLivresProduct;
} | null> {
  const context = extractChasseSearchContext(html);
  if (!context) return null;

  let flareSession = options.flareSession;
  let ownedFlareSession = false;
  const maxPages = chasseSearchMaxPages(options.anchoredBarcode);
  let firstUnanchoredMatch: {
    url: string;
    html: string;
    product: ChasseAuxLivresProduct;
  } | null = null;

  try {
    for (let page = 1; page <= maxPages; page += 1) {
      let data = await fetchChasseSearchResultsPage(searchUrl, context, page, {
        flareSession,
        signal: options.signal,
      });

      if (!data && page === 1 && !flareSession) {
        const flareBootstrap = await createChasseFlareSession(
          searchUrl,
          options.signal,
        );
        if (flareBootstrap) {
          flareSession = flareBootstrap.session;
          ownedFlareSession = true;
          data = await fetchChasseSearchResultsPage(searchUrl, context, page, {
            flareSession,
            signal: options.signal,
          });
        }
      }

      if (!data || (data.c ?? 0) < 1) break;

      if (typeof data.redir === "string" && data.redir.trim()) {
        const redirUrl = absoluteChasseUrl(data.redir.trim());
        if (redirUrl) {
          const redirPage = await fetchProductPage(
            redirUrl,
            options.signal,
            flareSession,
          );
          if (redirPage) {
            if (
              !options.validateProduct ||
              options.validateProduct(redirPage.product)
            ) {
              if (
                !options.anchoredBarcode ||
                chasseCatalogBarcodeConfirmed(
                  redirPage.product,
                  options.anchoredBarcode,
                )
              ) {
                return redirPage;
              }
            }
          }
        }
        break;
      }

      const seenUrls = new Set<string>();
      const candidateUrls = searchResultCandidates(data).filter((url) => {
        if (seenUrls.has(url)) return false;
        seenUrls.add(url);
        return true;
      });
      for (const productUrl of candidateUrls) {
        const productPage = await fetchProductPage(
          productUrl,
          options.signal,
          flareSession,
        );
        if (!productPage) continue;
        if (
          options.validateProduct &&
          !options.validateProduct(productPage.product)
        ) {
          continue;
        }
        if (
          options.anchoredBarcode &&
          !chasseCatalogBarcodeConfirmed(
            productPage.product,
            options.anchoredBarcode,
          )
        ) {
          continue;
        }
        if (options.anchoredBarcode) {
          return productPage;
        }
        if (!firstUnanchoredMatch) {
          firstUnanchoredMatch = productPage;
        }
      }
    }
  } finally {
    if (ownedFlareSession && flareSession) {
      await flareSolverrDestroySession(flareSession, options.signal);
    }
  }

  return firstUnanchoredMatch;
}

async function collectChasseSearchPayloads(
  searchUrl: string,
  html: string,
  options: {
    flareSession?: string;
    maxPages?: number;
    signal?: AbortSignal;
  } = {},
): Promise<ChasseSearchPayload[]> {
  const context = extractChasseSearchContext(html);
  if (!context) return [];

  let flareSession = options.flareSession;
  let ownedFlareSession = false;
  const payloads: ChasseSearchPayload[] = [];
  const maxPages = options.maxPages ?? CHASSE_SEARCH_MAX_PAGES;

  try {
    for (let page = 1; page <= maxPages; page += 1) {
      let data = await fetchChasseSearchResultsPage(searchUrl, context, page, {
        flareSession,
        signal: options.signal,
      });

      if (!data && page === 1 && !flareSession) {
        const flareBootstrap = await createChasseFlareSession(
          searchUrl,
          options.signal,
        );
        if (flareBootstrap) {
          flareSession = flareBootstrap.session;
          ownedFlareSession = true;
          data = await fetchChasseSearchResultsPage(searchUrl, context, page, {
            flareSession,
            signal: options.signal,
          });
        }
      }

      if (!data || (data.c ?? 0) < 1) break;
      payloads.push(data);
      if (typeof data.redir === "string" && data.redir.trim()) break;
    }
  } finally {
    if (ownedFlareSession && flareSession) {
      await flareSolverrDestroySession(flareSession, options.signal);
    }
  }

  return payloads;
}

async function fetchProductPage(
  productUrl: string,
  signal?: AbortSignal,
  flareSession?: string,
): Promise<{
  url: string;
  html: string;
  product: ChasseAuxLivresProduct;
} | null> {
  const page = await fetchChassePageHtml(productUrl, signal, { flareSession });
  if (!page) return null;
  const product = parseChasseAuxLivresProductPage(page.html, page.finalUrl);
  return product ? { url: page.finalUrl, html: page.html, product } : null;
}

async function resolveChasseAuxLivresProductPage(
  query: string,
  catalog: string,
  options: ChasseResolveOptions = {},
): Promise<{
  url: string;
  html: string;
  product?: ChasseAuxLivresProduct;
} | null> {
  const { validateProduct, anchoredItemBarcode, signal } = options;
  const anchoredBarcode = normalizeProductBarcode(anchoredItemBarcode);

  const directProductUrl = chasseProductUrlFromQuery(query);
  if (directProductUrl) {
    const page = await fetchProductPage(directProductUrl, signal);
    if (!page) return null;
    if (validateProduct && !validateProduct(page.product)) return null;
    return page;
  }

  const searchUrl = buildSearchUrl(query, catalog);
  const initialPage = await fetchChassePageHtml(searchUrl, signal);
  if (!initialPage) return null;
  const html = initialPage.html;
  const finalUrl = initialPage.finalUrl;
  if (isProtectedLoginPage(html, finalUrl)) return null;

  const flareSession = initialPage.flareSession;

  try {
    if (finalUrl.includes("/prix/")) {
      const redirected = parseChasseAuxLivresProductPage(html, finalUrl);
      if (
        redirected &&
        (!validateProduct || validateProduct(redirected)) &&
        (!anchoredBarcode ||
          chasseCatalogBarcodeConfirmed(redirected, anchoredBarcode))
      ) {
        return { url: finalUrl, html, product: redirected };
      }
    }

    const resolved = await resolveChasseSearchProductPage(searchUrl, html, {
      validateProduct,
      anchoredBarcode: anchoredBarcode || undefined,
      flareSession,
      signal,
    });
    if (resolved) return resolved;

    return null;
  } finally {
    if (flareSession) {
      await flareSolverrDestroySession(flareSession, signal);
    }
  }
}

export async function fetchChasseAuxLivresMetadataProduct(
  query: string,
  catalog = "fr",
  options: {
    validateProduct?: ChasseProductValidator;
    anchoredItemBarcode?: string | null;
    signal?: AbortSignal;
  } = {},
): Promise<ChasseAuxLivresProduct | null> {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) return null;

  try {
    const page = await resolveChasseAuxLivresProductPage(
      trimmedQuery,
      catalog,
      {
        validateProduct: options.validateProduct,
        anchoredItemBarcode: options.anchoredItemBarcode,
        signal: options.signal,
      },
    );
    if (!page) return null;
    return page.product || parseChasseAuxLivresProductPage(page.html, page.url);
  } catch (error) {
    if (isAbortError(error)) throw error;
    console.warn(
      `[ChasseAuxLivres] Metadata lookup failed for query ${trimmedQuery}: ${describeChasseError(error)}`,
    );
    return null;
  }
}

export async function fetchFromChasseAuxLivres(
  barcode: string,
  catalog: string,
  opts: { withPrices?: boolean } = {},
): Promise<ChasseAuxLivresProduct[]> {
  const searchUrl = buildSearchUrl(barcode, catalog);
  let flareSession: string | undefined;
  try {
    const initialPage = await fetchChassePageHtml(searchUrl);
    if (!initialPage) {
      console.warn(
        `[ChasseAuxLivres] Search is protected or unreachable for barcode ${barcode}`,
      );
      return [];
    }
    flareSession = initialPage.flareSession;
    const html = initialPage.html;
    const finalUrl = initialPage.finalUrl;

    if (finalUrl.includes("/prix/")) {
      console.log(`[ChasseAuxLivres] Direct redirect detected: ${finalUrl}`);
      const redirPath = finalUrl.replace(/^https?:\/\/[^/]+/, "");
      const product =
        parseChasseAuxLivresProductPage(html, finalUrl) ||
        parseRedirProduct(redirPath);
      if (product) {
        const coverUrl =
          product.coverUrl ||
          extractCoverFromListing(html) ||
          html
            .match(/<img[^>]*id="book-cover"[^>]*src="([^"]+)"/i)?.[1]
            ?.split("?")[0] ||
          html
            .match(/<img[^>]*class="[^"]*cover[^"]*"[^>]*src="([^"]+)"/i)?.[1]
            ?.split("?")[0];
        // Single product resolved: capture its prices in the same pass.
        const prices = opts.withPrices
          ? await fetchChasseAuxLivresOffers(finalUrl, html)
          : null;
        return [
          {
            ...product,
            coverUrl: absoluteChasseUrl(coverUrl),
            productUrl: product.productUrl || finalUrl,
            ...(prices ?? {}),
          },
        ];
      }
    }

    const hashMatch = html.match(/data-hash="([^"]+)"/);
    if (!hashMatch) {
      console.warn(
        `[ChasseAuxLivres] Could not find data-hash in response HTML for barcode ${barcode}`,
      );
      return [];
    }

    const searchPayloads = await collectChasseSearchPayloads(searchUrl, html, {
      flareSession: initialPage.flareSession,
      maxPages: CHASSE_SEARCH_MAX_PAGES,
    });

    for (const data of searchPayloads) {
      if (typeof data.redir === "string" && data.redir.trim()) {
        const product = parseRedirProduct(data.redir.trim());
        if (product) {
          const coverUrl = extractCoverFromListing(
            String(data.d || ""),
            data.redir.trim(),
          );
          const productUrl = absoluteChasseUrl(data.redir.trim());
          const prices = opts.withPrices
            ? await fetchChasseAuxLivresOffers(
                productUrl ||
                  `https://www.chasse-aux-livres.fr${data.redir.trim()}`,
              )
            : null;
          return [
            {
              ...product,
              productUrl,
              coverUrl: absoluteChasseUrl(coverUrl),
              ...(prices ?? {}),
            },
          ];
        }
      }

      const products = parseListingProducts(String(data.d || ""));
      if (products.length > 0) {
        return products;
      }
    }

    return [];
  } catch (error) {
    console.warn(
      `[ChasseAuxLivres] Barcode lookup failed for ${barcode}: ${describeChasseError(error)}`,
    );
    return [];
  } finally {
    if (flareSession) {
      await flareSolverrDestroySession(flareSession);
    }
  }
}

export async function isChasseAuxLivresSearchProtected(
  barcode: string,
  catalog: string,
): Promise<boolean> {
  const page = await fetchChassePageHtml(buildSearchUrl(barcode, catalog));
  if (!page) return true;
  return isProtectedLoginPage(page.html, page.finalUrl);
}

type ChasseLookupOffer = {
  condition?: { _name?: string | null };
  price?: { amount?: number | null };
  shippingCost?: { amount?: number | null };
  fees?: { amount?: number | null };
  totalPrice?: { amount?: number | null };
};

type ChasseBestOfferTotals = {
  landedCents: number;
  itemCents: number;
  shippingCents: number;
};

/** Landed price (item + shipping + fees), matching CAL's recap "Meilleur prix". */
export function chasseOfferLandedPriceCents(
  offer: ChasseLookupOffer,
): number | null {
  if (
    typeof offer.totalPrice?.amount === "number" &&
    offer.totalPrice.amount > 0
  ) {
    return offer.totalPrice.amount;
  }
  if (typeof offer.price?.amount !== "number" || offer.price.amount <= 0) {
    return null;
  }
  const shipping =
    typeof offer.shippingCost?.amount === "number"
      ? offer.shippingCost.amount
      : 0;
  const fees = typeof offer.fees?.amount === "number" ? offer.fees.amount : 0;
  return offer.price.amount + shipping + fees;
}

function chasseBestOfferTotals(
  offer: ChasseLookupOffer,
): ChasseBestOfferTotals | null {
  const landedCents = chasseOfferLandedPriceCents(offer);
  if (landedCents == null) return null;
  const itemCents =
    typeof offer.price?.amount === "number" && offer.price.amount > 0
      ? offer.price.amount
      : landedCents;
  const shippingCents =
    typeof offer.shippingCost?.amount === "number"
      ? offer.shippingCost.amount
      : 0;
  return { landedCents, itemCents, shippingCents };
}

function pickLowerChasseOffer(
  current: ChasseBestOfferTotals | null,
  candidate: ChasseBestOfferTotals,
): ChasseBestOfferTotals {
  if (!current || candidate.landedCents < current.landedCents) return candidate;
  return current;
}

/**
 * Continue from a resolved product page to its marketplace offers and return the
 * cheapest new/used landed prices (cents, shipping included). Shared by the
 * dedicated price fetch and the scan-time combined lookup.
 */
async function fetchChasseAuxLivresOffers(
  redirUrl: string,
  prefetchedHtml?: string,
): Promise<{ priceNew?: number; priceUsed?: number } | null> {
  const extractParams = (htmlContent: string) => {
    const htmlTagMatch = htmlContent.match(/<html[^>]*>/i);
    const htmlTag = htmlTagMatch ? htmlTagMatch[0] : "";
    const duihMatch = htmlTag.match(/data-duih="([^"]*)"/);
    const duih = duihMatch ? duihMatch[1] : "";

    const bookDetailsMatch = htmlContent.match(
      /<[^>]*id="book-details"[^>]*>/i,
    );
    const bookDetails = bookDetailsMatch ? bookDetailsMatch[0] : "";
    const asinMatch = bookDetails.match(/data-asin="([^"]*)"/);
    const asin = asinMatch ? asinMatch[1] : "";

    const lvsMatch = htmlContent.match(/data-lvs="([^"]*)"/);
    const lvs = lvsMatch ? lvsMatch[1] : "";

    const fuzzMatch = bookDetails.match(/data-fuzz="([^"]*)"/);
    const fuzz = fuzzMatch ? fuzzMatch[1] : "false";

    const offersMatch = htmlContent.match(/<[^>]*id="offers"[^>]*>/i);
    const offers = offersMatch ? offersMatch[0] : "";
    const nbengMatch = offers.match(/data-nbeng="([^"]*)"/);
    const nbeng = nbengMatch ? parseInt(nbengMatch[1], 10) : 0;

    const linkMatch = htmlContent.match(/<[^>]*id="d-tp-lnk"[^>]*>/i);
    const link = linkMatch ? linkMatch[0] : "";
    const uiMatch = link.match(/data-ui="([^"]*)"/);
    const ui = uiMatch ? uiMatch[1] : "";

    return { asin, duih, lvs, fuzz, nbeng, ui };
  };

  try {
    let redirHtml =
      prefetchedHtml ??
      (
        await axios.get(redirUrl, {
          headers: CHASSE_AUX_LIVRES_HEADERS,
          timeout: CHASSE_AUX_LIVRES_TIMEOUT_MS,
        })
      ).data;

    let params = extractParams(redirHtml);
    if (!params.asin) {
      console.warn(
        `[ChasseAuxLivres] Prices lookup: could not parse product details at ${redirUrl}`,
      );
      return null;
    }

    const ajaxHeaders = {
      ...CHASSE_AUX_LIVRES_HEADERS,
      Accept: "application/json, text/javascript, */*; q=0.01",
      "X-Requested-With": "XMLHttpRequest",
      Referer: redirUrl,
    };

    let retryCount = 0;
    const maxRetries = 2;
    let offersData: Record<string, unknown> | null = null;

    while (retryCount <= maxRetries) {
      const engines = Array.from({ length: params.nbeng }, (_, i) => i).join(
        "_",
      );
      const lookupUrl = `https://www.chasse-aux-livres.fr/rest/lookup/results?calls=offers&itemId=${params.asin}&retry=0&duih=${params.duih}&lvs=${params.lvs}&ui=${params.ui}&engines=${engines}&f=${params.fuzz}`;

      const lookupRes = await axios.get(lookupUrl, {
        headers: ajaxHeaders,
        timeout: CHASSE_AUX_LIVRES_TIMEOUT_MS,
      });
      const resData = lookupRes.data;

      if (resData.relook) {
        retryCount++;
        if (retryCount <= maxRetries) {
          console.log(
            `[ChasseAuxLivres] Relook is true, waiting 2.5s and retrying (${retryCount}/${maxRetries})...`,
          );
          await new Promise((resolve) => setTimeout(resolve, 2500));
          // Refetch product page to get new session/lvs parameters
          redirHtml = (
            await axios.get(redirUrl, {
              headers: CHASSE_AUX_LIVRES_HEADERS,
              timeout: CHASSE_AUX_LIVRES_TIMEOUT_MS,
            })
          ).data;
          params = extractParams(redirHtml);
        } else {
          console.warn(
            `[ChasseAuxLivres] Maximum retries reached at ${redirUrl}`,
          );
        }
      } else {
        offersData = resData.offers;
        break;
      }
    }

    if (!offersData) return null;

    let minNew: ChasseBestOfferTotals | null = null;
    let minUsed: ChasseBestOfferTotals | null = null;

    for (const engineOffers of Object.values(offersData)) {
      if (!Array.isArray(engineOffers)) continue;
      for (const offer of engineOffers as ChasseLookupOffer[]) {
        const cond = offer.condition?._name ?? null;
        const totals = chasseBestOfferTotals(offer);
        if (!totals) continue;
        if (cond === "NEW") {
          minNew = pickLowerChasseOffer(minNew, totals);
        } else if (cond === "USED") {
          minUsed = pickLowerChasseOffer(minUsed, totals);
        }
      }
    }

    const result: {
      priceNew?: number;
      priceUsed?: number;
      priceNewItem?: number;
      priceUsedItem?: number;
      shippingNew?: number;
      shippingUsed?: number;
    } = {};
    if (minNew) {
      result.priceNew = minNew.landedCents;
      result.priceNewItem = minNew.itemCents;
      result.shippingNew = minNew.shippingCents;
    }
    if (minUsed) {
      result.priceUsed = minUsed.landedCents;
      result.priceUsedItem = minUsed.itemCents;
      result.shippingUsed = minUsed.shippingCents;
    }

    return Object.keys(result).length > 0 ? result : null;
  } catch (error) {
    console.warn(
      `[ChasseAuxLivres] Offers lookup failed at ${redirUrl}: ${describeChasseError(error)}`,
    );
    return null;
  }
}

export type ChasseAuxLivresPrices = {
  /** Landed price in cents (item + shipping + fees). */
  priceNew?: number;
  priceUsed?: number;
  priceNewItem?: number;
  priceUsedItem?: number;
  shippingNew?: number;
  shippingUsed?: number;
  productName?: string;
  sourceUrl?: string;
};

export async function fetchPricesFromChasseAuxLivres(
  query: string,
  catalog = "fr",
  options: {
    validateProduct?: ChasseProductValidator;
    anchoredItemBarcode?: string | null;
  } = {},
): Promise<ChasseAuxLivresPrices | null> {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) return null;

  try {
    const page = await resolveChasseAuxLivresProductPage(
      trimmedQuery,
      catalog,
      {
        validateProduct: options.validateProduct,
        anchoredItemBarcode: options.anchoredItemBarcode,
      },
    );
    if (!page) return null;
    const prices = await fetchChasseAuxLivresOffers(page.url, page.html);
    if (!prices) return null;
    return {
      ...prices,
      productName: page.product?.name,
      sourceUrl: page.url,
    };
  } catch (error) {
    console.warn(
      `[ChasseAuxLivres] Prices lookup failed for query ${trimmedQuery}: ${describeChasseError(error)}`,
    );
    return null;
  }
}
