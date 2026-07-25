import { httpGet } from "@/lib/http/httpClient";
import { decode as decodeHTMLEntities } from "html-entities";

import {
  hasUnrequestedVariantMarker,
  isMetadataTitleAligned,
  metadataTitleSimilarity,
} from "@/core/enrich/titleMatching";
import { volumeNumberFromTitle } from "@/core/enrich/titles/volumeNumber";
import { normalizeProductBarcode } from "@/core/identify/normalize";
import {
  fetchGetWithFlareFallback,
  scrapeAccessBlocked,
} from "@/lib/http/scrapeFetch";
import { isAbortError, throwIfAborted } from "@/lib/http/abort";
import {
  collectMarkdownMappingSignals,
  mergeMappingSignalSets,
} from "@/lib/dev/scrapeMappingSignals";
import { booknodeCoverMediaKey, normalizeBooknodeCoverUrl } from "./coverUrl";
import {
  promoteBooknodeSearchEvidence,
  readBooknodeSearchEvidence,
} from "./durableEvidence";
import { METADATA_TITLE_ALIGN_FLOOR } from "@/core/enrich/titles/identityThresholds";

export interface BooknodeBook {
  id?: string;
  title: string;
  sourceUrl: string;
  imageUrl?: string;
  /** Additional cover URLs from the /covers gallery page. */
  coverImages?: string[];
  description?: string;
  authors?: string[];
  publisher?: string;
  genres?: string[];
  barcode?: string;
  releaseDate?: string;
  pageCount?: number;
  ratingValue?: number;
  ratingCount?: number;
  reviewCount?: number;
  seriesName?: string;
  seriesUrl?: string;
  seriesPosition?: number;
  /** Affiliate buy links scraped from the book page (neuf / occasion). */
  priceOffers?: BooknodePriceOffer[];
}

export type BooknodePriceCondition = "new" | "used" | "unknown";

export interface BooknodePriceOffer {
  retailer: string;
  priceCents: number;
  condition: BooknodePriceCondition;
  url: string;
}

type BooknodeSearchCandidate = {
  title: string;
  url: string;
};

/** Rank aligned SearchYield hits — detail GET only for the winner. */
export function pickBestBooknodeSearchCandidate(
  candidates: BooknodeSearchCandidate[],
  query: string,
): BooknodeSearchCandidate | null {
  const aligned = candidates.filter((candidate) =>
    isCandidateAligned(query, candidate.title),
  );
  if (aligned.length === 0) return null;
  if (aligned.length === 1) return aligned[0] ?? null;

  let best: BooknodeSearchCandidate | null = null;
  let bestScore = -1;
  for (const candidate of aligned) {
    const score = metadataTitleSimilarity(query, candidate.title);
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }
  return best;
}

const BOOKNODE_BASE_URL = "https://booknode.com";
const BOOKNODE_READER_URL_PREFIX = "https://r.jina.ai/http://r.jina.ai/http://";
const BOOKNODE_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
  "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
};

/**
 * SearchYield: durable candidates first, else GET + parse + promote.
 */
async function loadBooknodeSearchCandidates(
  searchUrl: string,
  signal?: AbortSignal,
): Promise<BooknodeSearchCandidate[]> {
  const fromEvidence = await readBooknodeSearchEvidence(searchUrl);
  if (fromEvidence) {
    console.info(`[Booknode] Search evidence hit for ${searchUrl}`);
    return fromEvidence;
  }

  const searchHtml = await fetchBooknodePage(searchUrl, signal);
  if (!searchHtml) return [];

  const candidates = parseBooknodeSearchCandidates(searchHtml);
  await promoteBooknodeSearchEvidence(searchUrl, candidates);
  return candidates;
}

function cleanText(value?: string | null): string | undefined {
  const text = decodeHTMLEntities(String(value || ""))
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
  return text || undefined;
}

function cleanMarkdownText(value?: string | null): string | undefined {
  const text = decodeHTMLEntities(String(value || ""))
    .replace(/!\[[^\]]*\]\([^)]+\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_`]+/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
  return text || undefined;
}

function absoluteBooknodeUrl(value?: string | null): string | undefined {
  if (!value) return undefined;
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith("/")) return `${BOOKNODE_BASE_URL}${value}`;
  return `${BOOKNODE_BASE_URL}/${value}`;
}

function isBooknodeUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return /(^|\.)booknode\.com$/i.test(url.hostname);
  } catch {
    return false;
  }
}

function isBooknodeBookUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      /(^|\.)booknode\.com$/i.test(url.hostname) &&
      !/^\/(?:auteur|serie|theme|profil|search|modules|forum)\b/i.test(
        url.pathname,
      ) &&
      /_\d+/.test(url.pathname)
    );
  } catch {
    return false;
  }
}

function isCloudflareBlock(html: string): boolean {
  return (
    /Attention Required!\s*\|\s*Cloudflare/i.test(html) ||
    /Sorry,\s+you have been blocked/i.test(html) ||
    /cdn-cgi\/challenge-platform/i.test(html)
  );
}

function normalizeIssueNumber(value: string): string {
  return String(Number.parseInt(value, 10));
}

function buildSearchQueries(query: string): string[] {
  const trimmed = query.replace(/\s+/g, " ").trim();
  const queries = [trimmed];
  const issue = trimmed.match(/\bn[°º]?\s*0*(\d+)\b/i);
  if (issue?.[1]) {
    const number = normalizeIssueNumber(issue[1]);
    queries.push(
      trimmed.replace(/\bn[°º]?\s*0*\d+\b/i, `n°${number}`),
      trimmed.replace(/\bn[°º]?\s*0*\d+\b/i, `n ${number}`),
      trimmed.replace(/\bn[°º]?\s*0*\d+\b/i, `n${number}`),
    );
  }
  return Array.from(new Set(queries.filter(Boolean)));
}

function stripBooknodeTitleSuffix(value: string): string {
  return value
    .replace(/\s+-\s+Bande Dessinée de .+$/i, "")
    .replace(/\s+-\s+Livre de .+$/i, "")
    .trim();
}

function hasUnrequestedVariant(query: string, title: string): boolean {
  const normalizedQuery = query
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const normalizedTitle = title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const variantTerms = [/\bcollect'?or\b/, /\bhors\s*serie\b/];
  return variantTerms.some(
    (term) => term.test(normalizedTitle) && !term.test(normalizedQuery),
  );
}

function isCandidateAligned(query: string, title: string): boolean {
  if (hasUnrequestedVariantMarker(query, title)) return false;
  if (hasUnrequestedVariant(query, title)) return false;
  const queryIssue = volumeNumberFromTitle(query);
  const titleIssue = volumeNumberFromTitle(title);
  if (queryIssue && titleIssue && queryIssue !== titleIssue) return false;
  return isMetadataTitleAligned({ title }, [query], METADATA_TITLE_ALIGN_FLOOR);
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
      // Ignore malformed JSON-LD snippets.
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

function parseFrenchInteger(value?: string | null): number | undefined {
  const parsed = Number(String(value || "").replace(/[^\d]/g, ""));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function parseEuroPriceCents(label?: string | null): number | undefined {
  if (!label) return undefined;
  const match = String(label).match(/([0-9]+(?:[.,][0-9]{1,2})?)/);
  if (!match) return undefined;
  const amount = Number.parseFloat(match[1].replace(",", "."));
  if (!Number.isFinite(amount) || amount <= 0) return undefined;
  return Math.round(amount * 100);
}

function booknodePriceConditionFromState(
  state?: string | null,
): BooknodePriceCondition {
  if (state === "1") return "new";
  if (state === "0") return "used";
  return "unknown";
}

export function parseBooknodePriceOffers(
  content: string,
): BooknodePriceOffer[] {
  const offers: BooknodePriceOffer[] = [];
  const seen = new Set<string>();

  const push = (offer: BooknodePriceOffer) => {
    const key = `${offer.condition}:${offer.retailer}:${offer.priceCents}`;
    if (seen.has(key)) return;
    seen.add(key);
    offers.push(offer);
  };

  for (const match of content.matchAll(
    /\[([0-9]+(?:[.,][0-9]{1,2})?)\s*€\s*([^\]]+)\]\((https:\/\/booknode\.com\/modules\/buylink_redirect\.php[^)\s"]+)/gi,
  )) {
    const retailer = cleanMarkdownText(match[2]);
    if (!retailer || /voir les prix/i.test(retailer)) continue;
    const priceCents = parseEuroPriceCents(`${match[1]}€`);
    const url = match[3];
    const state = url.match(/[?&]state=(-?\d+)/)?.[1];
    if (!priceCents) continue;
    push({
      retailer,
      priceCents,
      condition: booknodePriceConditionFromState(state),
      url,
    });
  }

  for (const match of content.matchAll(
    /<a[^>]+href=["'](https:\/\/booknode\.com\/modules\/buylink_redirect\.php[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,
  )) {
    const url = match[1];
    const label = cleanMarkdownText(
      match[2]
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim(),
    );
    if (!label || /voir les prix/i.test(label)) continue;
    const priceMatch = label.match(/^([0-9]+(?:[.,][0-9]{1,2})?)\s*€\s*(.+)$/i);
    if (!priceMatch) continue;
    const priceCents = parseEuroPriceCents(`${priceMatch[1]}€`);
    const state = url.match(/[?&]state=(-?\d+)/)?.[1];
    if (!priceCents) continue;
    push({
      retailer: cleanMarkdownText(priceMatch[2]) || "Boutique",
      priceCents,
      condition: booknodePriceConditionFromState(state),
      url,
    });
  }

  return offers.sort((a, b) => a.priceCents - b.priceCents);
}

function markdownRatingCount(html: string): number | undefined {
  return parseFrenchInteger(
    html.match(/\b(\d[\d\s]*)\s+notes?\s*\|/i)?.[1] ||
      html.match(/\b(\d[\d\s]*)\s+notes?\b/i)?.[1],
  );
}

function markdownReviewCount(html: string): number | undefined {
  return parseFrenchInteger(
    html.match(/\|\s*\[?(\d[\d\s]*)\s+commentaires?/i)?.[1] ||
      html.match(/\bnotes?[\s\S]{0,120}?(\d[\d\s]*)\s+commentaires?/i)?.[1],
  );
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

function idFromBooknodeUrl(value?: string | null): string | undefined {
  const match = String(value || "").match(/(?:_|media\/)(\d+)(?:[/?#]|$)/);
  return match?.[1];
}

function markdownSectionRaw(html: string, heading: string): string | undefined {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = html.match(
    new RegExp(
      `^#{2,6}\\s+${escaped}\\s*$([\\s\\S]*?)(?=^#{2,6}\\s+|(?![\\s\\S]))`,
      "im",
    ),
  );
  return match?.[1];
}

function markdownCoverUrl(html: string): string | undefined {
  const coverImage =
    html.match(
      /!\[[^\]]*Couverture du livre[^\]]*\]\((https?:\/\/[^)\s]+)\)/i,
    )?.[1] ||
    html.match(
      /!\[[^\]]*\]\((https:\/\/cdn1\.booknode\.com\/book_cover\/[^)\s]+)\)/i,
    )?.[1];
  return coverImage?.split("?")[0];
}

function markdownAuthors(html: string): string[] | undefined {
  const authorSection = markdownSectionRaw(html, "Auteur");
  const source = authorSection || html;
  const authors = Array.from(
    source.matchAll(/\[([^\]]+)\]\(https:\/\/booknode\.com\/auteur\/[^)]+\)/gi),
  )
    .map((match) => cleanMarkdownText(match[1]))
    .filter((value): value is string => Boolean(value));
  return authors.length ? Array.from(new Set(authors)).slice(0, 5) : undefined;
}

function markdownPublisher(html: string): string | undefined {
  const publisherSection =
    markdownSectionRaw(html, "Éditeur") || markdownSectionRaw(html, "Editeur");
  const source = publisherSection || html;
  const match = source.match(
    /\[([^\]]+)\]\(https:\/\/booknode\.com\/editeur\/[^)]+\)/i,
  );
  return cleanMarkdownText(match?.[1]);
}

const BOOKNODE_COVER_URL_RE =
  /https:\/\/cdn1\.booknode\.com\/book_cover\/[^\s"'<>)\]]+/gi;

function isBooknodeCoverAssetUrl(url: string): boolean {
  return (
    url.includes("cdn1.booknode.com/book_cover/") &&
    !url.includes("/version/") &&
    !url.includes("/global/img/")
  );
}

export function parseBooknodeCoverUrls(content: string): string[] {
  const urls: string[] = [];
  const seenUrls = new Set<string>();
  const seenMediaKeys = new Set<string>();

  const pushRaw = (raw?: string | null) => {
    const trimmed = raw?.split("?")[0]?.trim();
    if (!trimmed || !isBooknodeCoverAssetUrl(trimmed)) return;

    const normalized = normalizeBooknodeCoverUrl(trimmed);
    if (!normalized || seenUrls.has(normalized)) return;

    const mediaKey = booknodeCoverMediaKey(normalized);
    if (mediaKey) {
      if (seenMediaKeys.has(mediaKey)) return;
      seenMediaKeys.add(mediaKey);
    }

    seenUrls.add(normalized);
    urls.push(normalized);
  };

  for (const match of content.matchAll(
    /!\[[^\]]*\]\((https:\/\/cdn1\.booknode\.com\/book_cover\/[^)\s]+)\)/gi,
  )) {
    pushRaw(match[1]);
  }

  for (const match of content.matchAll(BOOKNODE_COVER_URL_RE)) {
    pushRaw(match[0]);
  }

  for (const match of content.matchAll(
    /(?:src|href)=["'](https:\/\/cdn1\.booknode\.com\/book_cover\/[^"']+)["']/gi,
  )) {
    pushRaw(match[1]);
  }

  return urls;
}

function markdownGenres(html: string): string[] | undefined {
  const section =
    markdownSectionRaw(html, "Thèmes") || markdownSectionRaw(html, "Themes");
  if (!section) return undefined;
  const genres = Array.from(
    section.matchAll(/\[([^\]]+)\]\(https:\/\/booknode\.com\/theme\/[^)]+\)/gi),
  )
    .map((match) => cleanMarkdownText(match[1]))
    .filter((value): value is string => Boolean(value));
  return genres.length ? Array.from(new Set(genres)) : undefined;
}

function markdownDescription(html: string): string | undefined {
  const match = html.match(
    /\bR[ée]sum[ée]\s*\n\n([\s\S]*?)(?=\n\n\[Afficher en entier\]|\n\nRecommander ce livre|\n\n#{2,6}\s+|\n\n\* \* \*)/i,
  );
  return cleanMarkdownText(match?.[1]);
}

function markdownSeries(
  html: string,
): Pick<BooknodeBook, "seriesName" | "seriesUrl"> {
  const section =
    markdownSectionRaw(html, "Série") || markdownSectionRaw(html, "Serie");
  const match = section?.match(
    /\[([^\]]+)\]\((https:\/\/booknode\.com\/serie\/[^)\s"]+)/i,
  );
  const seriesName = cleanMarkdownText(
    match?.[1]?.replace(/\s*\([^)]*\)\s*$/, ""),
  );
  return {
    seriesName,
    seriesUrl: absoluteBooknodeUrl(match?.[2]),
  };
}

export function parseBooknodeBookPage(
  html: string,
  sourceUrl: string,
): BooknodeBook | null {
  const schemas = parseJsonLdBlocks(html);
  const book = schemas.find((schema) =>
    schemaTypes(schema?.["@type"]).some(
      (type) => type.toLowerCase() === "book",
    ),
  );

  const title =
    firstSchemaValue(book?.name) ||
    metaContent(html, "twitter:title") ||
    metaContent(html, "og:title") ||
    html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ||
    html.match(/^#\s+(.+)$/m)?.[1];
  const cleanTitle = cleanText(stripBooknodeTitleSuffix(title || ""));
  if (!cleanTitle) return null;

  const rating = book?.aggregateRating as
    | { ratingValue?: unknown; ratingCount?: unknown; reviewCount?: unknown }
    | undefined;
  const series = book?.isPartOf as
    | { name?: unknown; url?: unknown; position?: unknown }
    | undefined;
  const image =
    firstSchemaValue(book?.image) ||
    metaContent(html, "twitter:image") ||
    metaContent(html, "og:image") ||
    html.match(
      /<img[^>]+alt=["']Couverture du livre[^"']*["'][^>]+src=["']([^"']+)["']/i,
    )?.[1] ||
    markdownCoverUrl(html);
  const markdownSeriesData = markdownSeries(html);
  const schemaPublisher = firstSchemaValue(
    (book?.publisher as { name?: unknown } | undefined)?.name ??
      book?.publisher,
  );
  const barcode =
    normalizeProductBarcode(firstSchemaValue(book?.isbn)) ||
    normalizeProductBarcode(firstSchemaValue(book?.gtin13)) ||
    normalizeProductBarcode(firstSchemaValue(book?.gtin)) ||
    undefined;
  const releaseDate =
    firstSchemaValue(book?.datePublished) ||
    firstSchemaValue(book?.dateCreated);
  const pageCount = parseNumber(book?.numberOfPages);

  return {
    id:
      idFromBooknodeUrl(sourceUrl) ||
      idFromBooknodeUrl(firstSchemaValue(book?.["@id"])),
    title: cleanTitle,
    sourceUrl,
    imageUrl: normalizeBooknodeCoverUrl(absoluteBooknodeUrl(image)),
    description:
      firstSchemaValue(book?.description) || markdownDescription(html),
    authors: schemaNames(book?.author).length
      ? schemaNames(book?.author)
      : markdownAuthors(html),
    publisher: schemaPublisher || markdownPublisher(html),
    genres: schemaNames(book?.genre).length
      ? schemaNames(book?.genre)
      : markdownGenres(html),
    barcode,
    releaseDate,
    pageCount,
    ratingValue: parseNumber(rating?.ratingValue),
    ratingCount: parseNumber(rating?.ratingCount) || markdownRatingCount(html),
    reviewCount: parseNumber(rating?.reviewCount) || markdownReviewCount(html),
    seriesName: firstSchemaValue(series?.name) || markdownSeriesData.seriesName,
    seriesUrl:
      absoluteBooknodeUrl(firstSchemaValue(series?.url)) ||
      markdownSeriesData.seriesUrl,
    seriesPosition:
      parseNumber(series?.position) ||
      parseNumber(volumeNumberFromTitle(cleanTitle)),
    priceOffers: (() => {
      const offers = parseBooknodePriceOffers(html);
      return offers.length > 0 ? offers : undefined;
    })(),
  };
}

export function parseBooknodeSearchCandidates(
  html: string,
): BooknodeSearchCandidate[] {
  const candidates: BooknodeSearchCandidate[] = [];
  const seen = new Set<string>();

  const push = (title?: string, rawUrl?: string) => {
    const cleanTitle = cleanText(title);
    const url = absoluteBooknodeUrl(rawUrl);
    if (
      !cleanTitle ||
      /^!?\[?\s*image\b/i.test(cleanTitle) ||
      !url ||
      !isBooknodeBookUrl(url) ||
      seen.has(url)
    ) {
      return;
    }
    seen.add(url);
    candidates.push({ title: cleanTitle, url });
  };

  for (const match of html.matchAll(
    /\[([^\]]+)\]\((https:\/\/booknode\.com\/[^)\s"]+)\)/gi,
  )) {
    push(match[1], match[2]);
  }

  for (const match of html.matchAll(
    /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,
  )) {
    push(match[2], match[1]);
  }

  return candidates;
}

async function fetchWithReader(
  url: string,
  signal?: AbortSignal,
): Promise<string | null> {
  try {
    const response = await httpGet(`${BOOKNODE_READER_URL_PREFIX}${url}`, {
      responseType: "text",
      transformResponse: [(data) => data],
      timeout: 12_000,
      validateStatus: () => true,
      signal,
    });
    const markdown = String(response.data || "");
    if (response.status < 400 && markdown.includes("URL Source:")) {
      return markdown;
    }
  } catch (error) {
    if (isAbortError(error)) throw error;
    return null;
  }
  return null;
}

async function fetchBooknodePage(
  url: string,
  signal?: AbortSignal,
): Promise<string | null> {
  try {
    const response = await httpGet(url, {
      headers: BOOKNODE_HEADERS,
      responseType: "text",
      transformResponse: [(data) => data],
      timeout: 6000,
      validateStatus: () => true,
      signal,
    });
    const html = String(response.data || "");
    if (
      response.status < 400 &&
      !isCloudflareBlock(html) &&
      !scrapeAccessBlocked(response.status, html)
    ) {
      return html;
    }
  } catch (error) {
    if (isAbortError(error)) throw error;
    // Fall through to reader/FlareSolverr when direct access fails.
  }
  const readerHtml = await fetchWithReader(url, signal);
  if (readerHtml) return readerHtml;
  try {
    const response = await fetchGetWithFlareFallback(url, {
      skipDirect: true,
      headers: BOOKNODE_HEADERS,
      responseType: "text",
      transformResponse: [(data) => data],
      timeout: 6000,
      validateStatus: () => true,
      signal,
    });
    const html = String(response.data || "");
    if (
      response.status < 400 &&
      !isCloudflareBlock(html) &&
      !scrapeAccessBlocked(response.status, html)
    ) {
      return html;
    }
  } catch (error) {
    if (isAbortError(error)) throw error;
  }
  return null;
}

async function enrichBooknodeWithCovers(
  book: BooknodeBook,
  signal?: AbortSignal,
): Promise<BooknodeBook> {
  const coversUrl = `${book.sourceUrl.replace(/\/$/, "")}/covers`;
  const coversHtml = await fetchBooknodePage(coversUrl, signal);
  if (!coversHtml) return book;

  const coverImages = parseBooknodeCoverUrls(coversHtml);
  if (coverImages.length === 0) return book;

  return {
    ...book,
    coverImages,
    imageUrl: book.imageUrl || coverImages[0],
  };
}

function searchUrlFor(query: string): string {
  return `${BOOKNODE_BASE_URL}/search?q=${encodeURIComponent(query)}`;
}

function booknodePageUrlAlternates(url: string): string[] {
  const numberedIssueUrl = url.replace(/_n(\d+)_/i, "_n_$1_");
  return Array.from(new Set([numberedIssueUrl, url]));
}

export async function fetchBooknodeMetadata(
  query: string,
  signal?: AbortSignal,
): Promise<BooknodeBook | null> {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) return null;

  if (isBooknodeUrl(trimmedQuery) && isBooknodeBookUrl(trimmedQuery)) {
    for (const url of booknodePageUrlAlternates(trimmedQuery)) {
      const html = await fetchBooknodePage(url, signal);
      const book = html ? parseBooknodeBookPage(html, url) : null;
      if (book) return enrichBooknodeWithCovers(book, signal);
    }
    return null;
  }

  for (const searchQuery of buildSearchQueries(trimmedQuery)) {
    throwIfAborted(signal);
    const searchUrl = searchUrlFor(searchQuery);
    const candidates = await loadBooknodeSearchCandidates(searchUrl, signal);
    if (candidates.length === 0) continue;

    const best = pickBestBooknodeSearchCandidate(candidates, trimmedQuery);
    if (!best) continue;

    for (const url of booknodePageUrlAlternates(best.url)) {
      const html = await fetchBooknodePage(url, signal);
      if (!html) continue;
      const product = parseBooknodeBookPage(html, url);
      if (product && isCandidateAligned(trimmedQuery, product.title)) {
        if (
          product.seriesName &&
          hasUnrequestedVariantMarker(trimmedQuery, product.seriesName)
        ) {
          continue;
        }
        return enrichBooknodeWithCovers(product, signal);
      }
    }
  }

  return null;
}

export async function getBooknodeSuggestions(name: string): Promise<string[]> {
  const trimmedQuery = name.trim();
  if (!trimmedQuery) return [];

  const titles: string[] = [];
  const seen = new Set<string>();

  for (const searchQuery of buildSearchQueries(trimmedQuery)) {
    const candidates = await loadBooknodeSearchCandidates(
      searchUrlFor(searchQuery),
    );
    if (candidates.length === 0) continue;

    for (const candidate of candidates.slice(0, 5)) {
      const title = candidate.title.trim();
      if (!title || seen.has(title)) continue;
      seen.add(title);
      titles.push(title);
      if (titles.length >= 5) return titles;
    }
  }

  return titles;
}

export function collectBooknodeMappingSignals(content: string): string[] {
  return collectMarkdownMappingSignals(content);
}

export async function collectBooknodeMappingRawKeys(
  query: string,
): Promise<string[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  let urls: string[] = [];
  if (isBooknodeBookUrl(trimmed)) {
    urls = booknodePageUrlAlternates(trimmed);
  } else {
    const candidates = await loadBooknodeSearchCandidates(
      searchUrlFor(trimmed),
    );
    const candidate = candidates[0]?.url;
    if (candidate) urls = booknodePageUrlAlternates(candidate);
  }

  const signalSets: string[][] = [];
  for (const url of urls.slice(0, 2)) {
    const html = await fetchBooknodePage(url);
    if (html) signalSets.push(collectBooknodeMappingSignals(html));
    const coversHtml = await fetchBooknodePage(
      `${url.replace(/\/$/, "")}/covers`,
    );
    if (coversHtml) signalSets.push(collectBooknodeMappingSignals(coversHtml));
  }

  return mergeMappingSignalSets(...signalSets);
}
