import { decode as decodeHTMLEntities } from "html-entities";

import {
  barcodesEquivalent,
  normalizeProductBarcode,
} from "@/core/identify/normalize";
import {
  hasUnrequestedVariantMarker,
  isMetadataTitleAligned,
} from "@/core/enrich/titleMatching";
import { volumeNumberFromTitle } from "@/core/enrich/titles/volumeNumber";
import { collectObjectMappingSignals } from "@/lib/dev/scrapeMappingSignals";
import { isAbortError, throwIfAborted } from "@/lib/http/abort";
import { fetchGetWithFlareFallback } from "@/lib/http/scrapeFetch";

import {
  promoteVivlioSearchEvidence,
  readVivlioSearchEvidence,
} from "./durableEvidence";
import { METADATA_TITLE_ALIGN_FLOOR } from "@/core/enrich/titles/identityThresholds";

const VIVLIO_BASE_URL = "https://shop.vivlio.com";
const VIVLIO_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
};

export type VivlioSearchHit = {
  title: string;
  productUrl: string;
  barcode?: string;
};

export type VivlioProduct = {
  title: string;
  productUrl: string;
  description?: string;
  imageUrl?: string;
  authors: string[];
  publisher?: string;
  barcode?: string;
  bookFormat?: string;
  seriesName?: string;
  seriesUrl?: string;
  collection?: string;
  collectionUrl?: string;
  releaseDate?: string;
  categories?: string[];
  priceCents?: number;
  currency?: string;
};

type JsonLd = Record<string, unknown>;

function cleanText(value?: string | null): string | undefined {
  if (!value) return undefined;
  const text = decodeHTMLEntities(String(value))
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text || undefined;
}

function absoluteUrl(pathOrUrl?: string | null): string | undefined {
  if (!pathOrUrl) return undefined;
  try {
    return new URL(pathOrUrl, VIVLIO_BASE_URL).toString();
  } catch {
    return undefined;
  }
}

export function vivlioSearchUrl(query: string): string {
  const params = new URLSearchParams({ search: query.trim() });
  return `${VIVLIO_BASE_URL}/search?${params.toString()}`;
}

function parseJsonLdBlocks(html: string): JsonLd[] {
  const blocks: JsonLd[] = [];
  for (const match of html.matchAll(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    try {
      const parsed = JSON.parse(decodeHTMLEntities(match[1].trim()));
      if (Array.isArray(parsed)) blocks.push(...parsed);
      else if (parsed && typeof parsed === "object") blocks.push(parsed);
    } catch {
      // ignore
    }
  }
  return blocks;
}

function schemaTypes(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  return value ? [String(value)] : [];
}

function firstName(value: unknown): string | undefined {
  if (typeof value === "string") return cleanText(value);
  if (Array.isArray(value)) {
    for (const item of value) {
      const name = firstName(item);
      if (name) return name;
    }
  }
  if (value && typeof value === "object") {
    const record = value as JsonLd;
    return firstName(record.name || record.value);
  }
  return undefined;
}

function schemaNames(value: unknown): string[] {
  const raw = Array.isArray(value) ? value : value ? [value] : [];
  return Array.from(
    new Set(raw.map(firstName).filter((name): name is string => Boolean(name))),
  );
}

function parseEuroCents(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.round(value * 100);
  }
  const text = cleanText(String(value || ""));
  if (!text) return undefined;
  const parsed = Number(text.replace(",", "."));
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : undefined;
}

function parseVivlioCatalogLink(
  html: string,
  kind: "serie" | "collection",
): { name?: string; url?: string } {
  const match = html.match(
    new RegExp(
      `href=["']([^"']*/${kind}/[^"']+)["'][^>]*>([\\s\\S]*?)</a>`,
      "i",
    ),
  );
  if (!match) return {};
  const name = cleanText(match[2]);
  const url = absoluteUrl(match[1]);
  return name ? { name, url } : {};
}

function parseVivlioBreadcrumbCategories(html: string): string[] {
  const categories: string[] = [];
  const skip = /^(accueil|ebooks?|livres?)$/i;
  for (const match of html.matchAll(
    /"@type"\s*:\s*"ListItem"[\s\S]*?"name"\s*:\s*"([^"]+)"[\s\S]*?"item"\s*:\s*"([^"]*\/category\/[^"]+)"/gi,
  )) {
    const name = cleanText(match[1]);
    if (!name || skip.test(name)) continue;
    if (!categories.includes(name)) categories.push(name);
  }
  return categories;
}

/**
 * Vivlio CDN only accepts a fixed size allowlist (arbitrary WxH → HTTP 400).
 * Observed shop sizes: 70x105 (og), 160x240 (grid), 450x675 (detail).
 */
const VIVLIO_COVER_SIZES = ["450x675", "160x240", "70x105"] as const;

export function vivlioCoverDownloadCandidates(url: string): string[] {
  try {
    const parsed = new URL(url);
    if (!/cdn\.vivlio\.com$/i.test(parsed.hostname)) return [];
    if (!/\/front-cover/i.test(parsed.pathname)) return [];
    return VIVLIO_COVER_SIZES.map((size) => {
      const next = new URL(parsed.toString());
      next.searchParams.set("size", size);
      return next.toString();
    });
  } catch {
    return [];
  }
}

export function normalizeVivlioCoverUrl(
  value?: string | null,
): string | undefined {
  const absolute = absoluteUrl(value);
  if (!absolute) return undefined;
  try {
    const url = new URL(absolute);
    if (/cdn\.vivlio\.com$/i.test(url.hostname)) {
      // Prefer the largest allowlisted rendition (not an invented 400x600).
      url.searchParams.set("size", VIVLIO_COVER_SIZES[0]);
      return url.toString();
    }
    return absolute;
  } catch {
    return absolute;
  }
}

export function parseVivlioSearchHits(html: string): VivlioSearchHit[] {
  const hits: VivlioSearchHit[] = [];
  const seen = new Set<string>();

  for (const match of html.matchAll(
    /href=["'](\/product\/(\d{10,13})_[^"']+)["']/gi,
  )) {
    const path = match[1];
    const barcode = normalizeProductBarcode(match[2]) || match[2];
    const url = absoluteUrl(path);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    const slugTitle = path.split("/").pop()?.replace(/-/g, " ").trim();
    hits.push({
      title: cleanText(slugTitle) || barcode,
      productUrl: url,
      barcode,
    });
  }

  return hits;
}

export function parseVivlioProductPage(
  html: string,
  productUrl: string,
): VivlioProduct | null {
  const blocks = parseJsonLdBlocks(html);
  const product =
    blocks.find((block) =>
      schemaTypes(block["@type"]).some((type) => /product|book/i.test(type)),
    ) || null;
  const bookFeed = blocks.find((block) =>
    schemaTypes(block["@type"]).some((type) => /datafeed/i.test(type)),
  );
  const bookExample =
    bookFeed && typeof bookFeed.dataFeedElement === "object"
      ? (bookFeed.dataFeedElement as JsonLd)
      : null;

  const title =
    firstName(product?.name) ||
    firstName(bookExample?.name) ||
    cleanText(
      html.match(
        /property=["']og:title["'][^>]+content=["']([^"']+)["']/i,
      )?.[1],
    )?.replace(/\s+Ebook\b.*$/i, "");
  if (!title) return null;

  const authors = schemaNames(
    product?.author || bookExample?.author || bookExample?.creator,
  );
  const publisher = firstName(
    product?.publisher ||
      (bookExample?.workExample as JsonLd | undefined)?.bookEdition ||
      bookExample?.publisher,
  );
  const barcode = normalizeProductBarcode(
    String(product?.isbn || bookExample?.isbn || "") ||
      productUrl.match(/\/product\/(\d{10,13})_/)?.[1] ||
      "",
  );
  const description =
    cleanText(String(product?.description || "")) ||
    cleanText(
      html.match(
        /property=["']og:description["'][^>]+content=["']([^"']+)["']/i,
      )?.[1],
    );
  const imageUrl = normalizeVivlioCoverUrl(
    firstName(product?.image) ||
      html.match(
        /property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
      )?.[1],
  );
  const offers =
    product?.offers && typeof product.offers === "object"
      ? (product.offers as JsonLd)
      : null;
  const workExample =
    bookExample?.workExample && typeof bookExample.workExample === "object"
      ? (bookExample.workExample as JsonLd)
      : null;
  const workExampleOffer =
    workExample?.potentialAction &&
    typeof workExample.potentialAction === "object"
      ? ((workExample.potentialAction as JsonLd).expectsAcceptanceOf as
          | JsonLd
          | undefined)
      : null;
  const priceCents = parseEuroCents(
    offers?.price ??
      product?.price ??
      workExampleOffer?.price ??
      workExampleOffer?.Price,
  );
  const bookFormat = cleanText(
    String(product?.bookFormat || "").replace(/^https?:\/\/schema\.org\//i, ""),
  );
  const releaseDate = cleanText(String(workExample?.datePublished || ""));
  const series = parseVivlioCatalogLink(html, "serie");
  const collection = parseVivlioCatalogLink(html, "collection");
  const categories = parseVivlioBreadcrumbCategories(html);

  return {
    title,
    productUrl: absoluteUrl(productUrl) || productUrl,
    description,
    imageUrl,
    authors,
    publisher,
    barcode: barcode || undefined,
    bookFormat,
    seriesName: series.name,
    seriesUrl: series.url,
    collection: collection.name,
    collectionUrl: collection.url,
    releaseDate: releaseDate || undefined,
    categories: categories.length ? categories : undefined,
    priceCents,
    currency: cleanText(String(offers?.priceCurrency || "EUR")),
  };
}

function isCandidateAligned(query: string, title: string): boolean {
  if (hasUnrequestedVariantMarker(query, title)) return false;
  const queryIssue = volumeNumberFromTitle(query);
  const titleIssue = volumeNumberFromTitle(title);
  if (queryIssue && titleIssue && queryIssue !== titleIssue) return false;
  return isMetadataTitleAligned({ title }, [query], METADATA_TITLE_ALIGN_FLOOR);
}

async function fetchHtml(
  url: string,
  signal?: AbortSignal,
): Promise<string | null> {
  try {
    const response = await fetchGetWithFlareFallback(url, {
      headers: VIVLIO_HEADERS,
      responseType: "text",
      transformResponse: [(data) => data],
      timeout: 20_000,
      validateStatus: () => true,
      signal,
    });
    if (response.status >= 400) return null;
    const html = String(response.data || "");
    return html.trim() ? html : null;
  } catch (error) {
    if (isAbortError(error)) throw error;
    return null;
  }
}

export async function searchVivlioHits(
  query: string,
  signal?: AbortSignal,
): Promise<VivlioSearchHit[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const searchUrl = vivlioSearchUrl(trimmed);

  const fromEvidence = await readVivlioSearchEvidence(searchUrl);
  if (fromEvidence) {
    console.info(`[Vivlio] Search evidence hit for ${searchUrl}`);
    return fromEvidence;
  }

  const html = await fetchHtml(searchUrl, signal);
  if (!html) return [];
  const hits = parseVivlioSearchHits(html);
  await promoteVivlioSearchEvidence(searchUrl, hits);
  return hits;
}

export async function fetchVivlioProduct(
  url: string,
  signal?: AbortSignal,
): Promise<VivlioProduct | null> {
  const absolute = absoluteUrl(url);
  if (!absolute) return null;
  const html = await fetchHtml(absolute, signal);
  return html ? parseVivlioProductPage(html, absolute) : null;
}

export async function resolveVivlioMetadata(options: {
  name?: string;
  barcode?: string;
  lookupQueries?: string[];
  signal?: AbortSignal;
}): Promise<VivlioProduct | null> {
  const { signal } = options;
  const barcode = normalizeProductBarcode(options.barcode || "");
  const queries = Array.from(
    new Set(
      [options.name, ...(options.lookupQueries || []), barcode]
        .map((q) => String(q || "").trim())
        .filter(Boolean),
    ),
  );

  if (barcode) {
    const hits = await searchVivlioHits(barcode, signal);
    for (const hit of hits.slice(0, 8)) {
      throwIfAborted(signal);
      // Prefer URL / hit barcode before fetching when present.
      if (
        hit.barcode &&
        !barcodesEquivalent(hit.barcode, barcode) &&
        !hit.productUrl.includes(barcode)
      ) {
        continue;
      }
      const product = await fetchVivlioProduct(hit.productUrl, signal);
      if (!product?.barcode) continue;
      if (!barcodesEquivalent(product.barcode, barcode)) continue;
      // Ebook ISBN match is authoritative — don't require title alignment.
      return product;
    }
  }

  for (const query of queries) {
    if (barcode && query === barcode) continue;
    throwIfAborted(signal);
    const hits = await searchVivlioHits(query, signal);
    for (const hit of hits.slice(0, 8)) {
      if (
        !isCandidateAligned(query, hit.title) &&
        !hit.productUrl
          .toLowerCase()
          .includes(query.toLowerCase().replace(/\s+/g, "-").slice(0, 20))
      ) {
        // Slug titles are weak — still fetch top hits and align on fiche.
      }
      throwIfAborted(signal);
      const product = await fetchVivlioProduct(hit.productUrl, signal);
      if (!product) continue;
      if (!isCandidateAligned(query, product.title)) continue;
      return product;
    }
  }

  return null;
}

export async function collectVivlioMappingRawKeys(
  query: string,
): Promise<string[]> {
  const hits = await searchVivlioHits(query);
  const product = hits[0] ? await fetchVivlioProduct(hits[0].productUrl) : null;
  return collectObjectMappingSignals({ hits: hits.slice(0, 3), product });
}
