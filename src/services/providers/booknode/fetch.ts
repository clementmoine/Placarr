import axios from "axios";
import { decode as decodeHTMLEntities } from "html-entities";

import {
  hasUnrequestedVariantMarker,
  isMetadataTitleAligned,
} from "@/lib/metadata/titleMatching";
import { volumeNumberFromTitle } from "@/lib/title/volumeNumber";
import { fetchWithFlareSolverr } from "@/lib/http/flareSolverr";
import { normalizeBooknodeCoverUrl } from "./coverUrl";

export interface BooknodeBook {
  id?: string;
  title: string;
  sourceUrl: string;
  imageUrl?: string;
  description?: string;
  authors?: string[];
  genres?: string[];
  ratingValue?: number;
  ratingCount?: number;
  reviewCount?: number;
  seriesName?: string;
  seriesUrl?: string;
  seriesPosition?: number;
}

type BooknodeSearchCandidate = {
  title: string;
  url: string;
};

const BOOKNODE_BASE_URL = "https://booknode.com";
const BOOKNODE_READER_URL_PREFIX = "https://r.jina.ai/http://r.jina.ai/http://";
const BOOKNODE_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
  "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
};

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
  return isMetadataTitleAligned({ title }, [query], 0.58);
}

function parseJsonLdBlocks(html: string): any[] {
  const blocks: any[] = [];
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

  const rating = book?.aggregateRating;
  const series = book?.isPartOf;
  const image =
    firstSchemaValue(book?.image) ||
    metaContent(html, "twitter:image") ||
    metaContent(html, "og:image") ||
    html.match(
      /<img[^>]+alt=["']Couverture du livre[^"']*["'][^>]+src=["']([^"']+)["']/i,
    )?.[1] ||
    markdownCoverUrl(html);
  const markdownSeriesData = markdownSeries(html);

  return {
    id: idFromBooknodeUrl(sourceUrl) || idFromBooknodeUrl(book?.["@id"]),
    title: cleanTitle,
    sourceUrl,
    imageUrl: normalizeBooknodeCoverUrl(absoluteBooknodeUrl(image)),
    description:
      firstSchemaValue(book?.description) || markdownDescription(html),
    authors: schemaNames(book?.author).length
      ? schemaNames(book?.author)
      : markdownAuthors(html),
    genres: schemaNames(book?.genre).length
      ? schemaNames(book?.genre)
      : markdownGenres(html),
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

async function fetchWithReader(url: string): Promise<string | null> {
  try {
    const response = await axios.get(`${BOOKNODE_READER_URL_PREFIX}${url}`, {
      responseType: "text",
      transformResponse: [(data) => data],
      timeout: 12_000,
      validateStatus: () => true,
    });
    const markdown = String(response.data || "");
    if (response.status < 400 && markdown.includes("URL Source:")) {
      return markdown;
    }
  } catch {
    return null;
  }
  return null;
}

async function fetchBooknodePage(url: string): Promise<string | null> {
  try {
    const response = await axios.get(url, {
      headers: BOOKNODE_HEADERS,
      responseType: "text",
      transformResponse: [(data) => data],
      timeout: 6000,
      validateStatus: () => true,
    });
    const html = String(response.data || "");
    if (response.status < 400 && !isCloudflareBlock(html)) return html;
  } catch {
    // Fall through to reader/FlareSolverr when direct access fails.
  }
  const readerHtml = await fetchWithReader(url);
  if (readerHtml) return readerHtml;
  return fetchWithFlareSolverr(url);
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
): Promise<BooknodeBook | null> {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) return null;

  if (isBooknodeUrl(trimmedQuery) && isBooknodeBookUrl(trimmedQuery)) {
    for (const url of booknodePageUrlAlternates(trimmedQuery)) {
      const html = await fetchBooknodePage(url);
      const book = html ? parseBooknodeBookPage(html, url) : null;
      if (book) return book;
    }
    return null;
  }

  for (const searchQuery of buildSearchQueries(trimmedQuery)) {
    const searchHtml = await fetchBooknodePage(searchUrlFor(searchQuery));
    if (!searchHtml) continue;

    const candidates = parseBooknodeSearchCandidates(searchHtml).filter(
      (candidate) => isCandidateAligned(trimmedQuery, candidate.title),
    );

    for (const candidate of candidates.slice(0, 8)) {
      for (const url of booknodePageUrlAlternates(candidate.url)) {
        const html = await fetchBooknodePage(url);
        if (!html) continue;
        const product = parseBooknodeBookPage(html, url);
        if (product && isCandidateAligned(trimmedQuery, product.title)) {
          if (
            product.seriesName &&
            hasUnrequestedVariantMarker(trimmedQuery, product.seriesName)
          ) {
            continue;
          }
          return product;
        }
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
    const searchHtml = await fetchBooknodePage(searchUrlFor(searchQuery));
    if (!searchHtml) continue;

    for (const candidate of parseBooknodeSearchCandidates(searchHtml).slice(
      0,
      5,
    )) {
      const title = candidate.title.trim();
      if (!title || seen.has(title)) continue;
      seen.add(title);
      titles.push(title);
      if (titles.length >= 5) return titles;
    }
  }

  return titles;
}
