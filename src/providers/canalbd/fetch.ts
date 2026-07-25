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
  promoteCanalbdSearchEvidence,
  readCanalbdSearchEvidence,
} from "./durableEvidence";

const CANALBD_BASE_URL = "https://www.canalbd.net";
const CANALBD_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
};

export type CanalbdSearchHit = {
  id: string;
  title: string;
  url: string;
  coverUrl?: string;
};

export type CanalbdArticle = {
  id: string;
  title: string;
  sourceUrl: string;
  description?: string;
  imageUrl?: string;
  authors: string[];
  publisher?: string;
  seriesName?: string;
  seriesUrl?: string;
  barcode?: string;
  releaseDate?: string;
  pageCount?: number;
  priceCents?: number;
  ratingValue?: number;
  ratingCount?: number;
};

function cleanText(value?: string | null): string | undefined {
  if (!value) return undefined;
  const text = decodeHTMLEntities(String(value))
    .replace(/<[^>]+>/g, " ")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text || undefined;
}

function absoluteUrl(pathOrUrl?: string | null): string | undefined {
  if (!pathOrUrl) return undefined;
  try {
    return new URL(pathOrUrl, CANALBD_BASE_URL).toString();
  } catch {
    return undefined;
  }
}

function metaContent(html: string, property: string): string | undefined {
  const re = new RegExp(
    `<meta[^>]+(?:property|name|itemprop)=["']${property}["'][^>]+content=["']([^"']+)["']`,
    "i",
  );
  const match = html.match(re);
  if (match?.[1]) return cleanText(decodeHTMLEntities(match[1]));
  const re2 = new RegExp(
    `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name|itemprop)=["']${property}["']`,
    "i",
  );
  const match2 = html.match(re2);
  return match2?.[1] ? cleanText(decodeHTMLEntities(match2[1])) : undefined;
}

function listValue(html: string, label: string): string | undefined {
  const re = new RegExp(`<li>\\s*${label}\\s*:\\s*([\\s\\S]*?)</li>`, "i");
  return cleanText(html.match(re)?.[1]);
}

function parseEuroCents(value?: string | null): number | undefined {
  const text = cleanText(value);
  if (!text) return undefined;
  const match = text.replace(/\s/g, "").match(/(\d+)(?:[.,](\d{1,2}))?/);
  if (!match) return undefined;
  const euros = Number(match[1]);
  const cents = match[2] ? Number(match[2].padEnd(2, "0")) : 0;
  if (!Number.isFinite(euros)) return undefined;
  return euros * 100 + cents;
}

function articleIdFromUrl(url: string): string | undefined {
  return url.match(/\/articles\/[^/]*-(\d+)\/?/i)?.[1];
}

export function canalbdSearchUrl(query: string): string {
  const params = new URLSearchParams({ q: query.trim() });
  return `${CANALBD_BASE_URL}/recherche/?${params.toString()}`;
}

export function canalbdOffersUrl(articleId: string): string {
  return `${CANALBD_BASE_URL}/articles/view/${articleId}/offers/?availability=1`;
}

export function looksLikeCanalbdArticlePage(html: string): boolean {
  return Boolean(
    metaContent(html, "isbn") ||
      html.match(/itemprop=["']isbn["']/i) ||
      (metaContent(html, "og:type") === "product" && html.match(/EAN13\s*:/i)),
  );
}

export function parseCanalbdSearchHits(html: string): CanalbdSearchHit[] {
  if (looksLikeCanalbdArticlePage(html)) return [];

  const hits: CanalbdSearchHit[] = [];
  const seen = new Set<string>();

  for (const cls of ["card-booksm", "card-book"]) {
    for (const match of html.matchAll(
      new RegExp(`<article class="${cls}">([\\s\\S]*?)</article>`, "gi"),
    )) {
      const block = match[1];
      const href = block.match(/href=["'](\/articles\/[^"'#]+)/i)?.[1];
      const url = absoluteUrl(href);
      const id = href ? articleIdFromUrl(href) : undefined;
      const title =
        cleanText(
          block.match(/class=["']title[^"']*["'][^>]*>([^<]+)/i)?.[1],
        ) ||
        cleanText(
          block.match(
            /alt=["'](?:couverture de '|Image de )?([^"']+?)(?:')?["']/i,
          )?.[1],
        );
      const coverUrl = block.match(
        /src=["'](https:\/\/canalbd\.b-cdn\.net[^"']+)["']/i,
      )?.[1];
      if (!id || !title || !url || seen.has(id)) continue;
      seen.add(id);
      hits.push({ id, title, url, coverUrl });
    }
  }

  return hits;
}

export function parseCanalbdArticlePage(
  html: string,
  sourceUrl: string,
): CanalbdArticle | null {
  if (/introuvable/i.test(html) && !metaContent(html, "isbn")) {
    return null;
  }

  const id =
    articleIdFromUrl(sourceUrl) ||
    html.match(/id=["']product-(\d+)["']/i)?.[1] ||
    html.match(/\/articles\/view\/(\d+)\//i)?.[1];
  if (!id) return null;

  const title =
    cleanText(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]) ||
    metaContent(html, "og:title");
  if (!title) return null;

  const authors: string[] = [];
  for (const match of html.matchAll(
    /href=["']\/personnes\/[^"']+["'][^>]*>([^<]+)/gi,
  )) {
    const name = cleanText(match[1]);
    if (name && !authors.includes(name)) authors.push(name);
  }

  const seriesHref = html.match(/href=["'](\/series\/[^"']+)["']/i)?.[1];
  const seriesName =
    cleanText(html.match(/href=["']\/series\/[^"']+["'][^>]*>([^<]+)/i)?.[1]) ||
    cleanText(
      seriesHref?.match(/\/series\/([^-/]+)/i)?.[1]?.replace(/-/g, " "),
    );
  const seriesUrl = absoluteUrl(seriesHref);

  const barcode = normalizeProductBarcode(
    metaContent(html, "isbn") ||
      listValue(html, "EAN13") ||
      html.match(/EAN13\s*:\s*(\d{13})/i)?.[1] ||
      "",
  );

  const pageCountRaw =
    metaContent(html, "numberOfPages") || listValue(html, "Nombre de pages");
  const pageCount = pageCountRaw ? Number(pageCountRaw) : undefined;

  const ratingValueRaw = metaContent(html, "ratingValue");
  const ratingCountRaw = metaContent(html, "reviewCount");
  const ratingValue = ratingValueRaw ? Number(ratingValueRaw) : undefined;
  const ratingCount = ratingCountRaw ? Number(ratingCountRaw) : undefined;

  return {
    id,
    title,
    sourceUrl: absoluteUrl(sourceUrl) || sourceUrl,
    description: metaContent(html, "og:description"),
    imageUrl: metaContent(html, "og:image"),
    authors,
    publisher: listValue(html, "Éditeur") || listValue(html, "Editeur"),
    seriesName,
    seriesUrl,
    barcode: barcode || undefined,
    releaseDate:
      metaContent(html, "datePublished") || listValue(html, "Date de parution"),
    pageCount: pageCount && Number.isFinite(pageCount) ? pageCount : undefined,
    ratingValue:
      ratingValue && Number.isFinite(ratingValue) ? ratingValue : undefined,
    ratingCount:
      ratingCount && Number.isFinite(ratingCount) ? ratingCount : undefined,
  };
}

export function parseCanalbdOffersPrice(html: string): number | undefined {
  return parseEuroCents(
    html.match(/class=["']product-offer-price-value["'][^>]*>([^<]+)/i)?.[1] ||
      html.match(/Neuf\s*:[\s\S]{0,120}?(\d+[.,]\d{2}\s*€)/i)?.[1],
  );
}

function isCandidateAligned(query: string, title: string): boolean {
  if (hasUnrequestedVariantMarker(query, title)) return false;
  const queryIssue = volumeNumberFromTitle(query);
  const titleIssue = volumeNumberFromTitle(title);
  if (queryIssue && titleIssue && queryIssue !== titleIssue) return false;
  if (isMetadataTitleAligned({ title }, [query], 0.58)) return true;
  const subtitle = title
    .split(/\s*:\s*/)
    .slice(1)
    .join(": ")
    .trim();
  return Boolean(
    subtitle && isMetadataTitleAligned({ title: subtitle }, [query], 0.58),
  );
}

async function fetchHtml(
  url: string,
  signal?: AbortSignal,
): Promise<{ html: string; finalUrl: string } | null> {
  try {
    const response = await fetchGetWithFlareFallback(url, {
      headers: CANALBD_HEADERS,
      responseType: "text",
      transformResponse: [(data) => data],
      timeout: 20_000,
      validateStatus: () => true,
      signal,
      maxRedirects: 5,
    });
    if (response.status >= 400) return null;
    const html = String(response.data || "");
    if (!html.trim()) return null;
    const finalUrl = response.responseUrl || url;
    return { html, finalUrl };
  } catch (error) {
    if (isAbortError(error)) throw error;
    return null;
  }
}

export async function searchCanalbdHits(
  query: string,
  signal?: AbortSignal,
): Promise<CanalbdSearchHit[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const searchUrl = canalbdSearchUrl(trimmed);

  const fromEvidence = await readCanalbdSearchEvidence(searchUrl);
  if (fromEvidence) {
    console.info(`[Canal BD] Search evidence hit for ${searchUrl}`);
    return fromEvidence;
  }

  const fetched = await fetchHtml(searchUrl, signal);
  if (!fetched) return [];

  let hits: CanalbdSearchHit[];
  if (looksLikeCanalbdArticlePage(fetched.html)) {
    const article = parseCanalbdArticlePage(fetched.html, fetched.finalUrl);
    if (!article) return [];
    hits = [
      {
        id: article.id,
        title: article.title,
        url: article.sourceUrl,
        coverUrl: article.imageUrl,
      },
    ];
  } else {
    hits = parseCanalbdSearchHits(fetched.html);
  }

  await promoteCanalbdSearchEvidence(searchUrl, hits);
  return hits;
}

export async function fetchCanalbdArticle(
  url: string,
  signal?: AbortSignal,
): Promise<CanalbdArticle | null> {
  const absolute = absoluteUrl(url);
  if (!absolute) return null;
  const fetched = await fetchHtml(absolute, signal);
  if (!fetched) return null;
  const article = parseCanalbdArticlePage(fetched.html, fetched.finalUrl);
  if (!article) return null;

  const offers = await fetchHtml(canalbdOffersUrl(article.id), signal);
  if (offers) {
    article.priceCents = parseCanalbdOffersPrice(offers.html);
  }
  return article;
}

export async function resolveCanalbdMetadata(options: {
  name?: string;
  barcode?: string;
  lookupQueries?: string[];
  signal?: AbortSignal;
}): Promise<CanalbdArticle | null> {
  const { signal } = options;
  const queries = Array.from(
    new Set(
      [options.name, ...(options.lookupQueries || [])]
        .map((q) => String(q || "").trim())
        .filter(Boolean),
    ),
  );
  const barcode = normalizeProductBarcode(options.barcode || "");

  if (barcode) {
    throwIfAborted(signal);
    const hits = await searchCanalbdHits(barcode, signal);
    for (const hit of hits.slice(0, 4)) {
      throwIfAborted(signal);
      const article = await fetchCanalbdArticle(hit.url, signal);
      if (!article?.barcode) continue;
      if (!barcodesEquivalent(article.barcode, barcode)) continue;
      if (
        queries.length === 0 ||
        queries.some((q) => isCandidateAligned(q, article.title))
      ) {
        return article;
      }
    }
    if (queries.length === 0) return null;
  }

  for (const query of queries) {
    throwIfAborted(signal);
    const hits = await searchCanalbdHits(query, signal);
    for (const hit of hits.slice(0, 8)) {
      if (!isCandidateAligned(query, hit.title)) continue;
      throwIfAborted(signal);
      const article = await fetchCanalbdArticle(hit.url, signal);
      if (!article) continue;
      if (!isCandidateAligned(query, article.title)) continue;
      if (
        barcode &&
        article.barcode &&
        !barcodesEquivalent(article.barcode, barcode)
      ) {
        continue;
      }
      return article;
    }
  }

  return null;
}

export async function getCanalbdSuggestions(name: string): Promise<string[]> {
  const hits = await searchCanalbdHits(name);
  return hits.slice(0, 5).map((hit) => hit.title);
}

export async function collectCanalbdMappingRawKeys(
  query: string,
): Promise<string[]> {
  const hits = await searchCanalbdHits(query);
  const article = hits[0] ? await fetchCanalbdArticle(hits[0].url) : null;
  return collectObjectMappingSignals({ hits: hits.slice(0, 3), article });
}
