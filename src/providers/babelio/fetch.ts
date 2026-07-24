import axios from "axios";
import { decode as decodeHTMLEntities } from "html-entities";

import {
  barcodesEquivalent,
  normalizeProductBarcode,
} from "@/core/identify/normalize";
import {
  albumSpecificDistinctiveTokens,
  catalogLabelSimilarity,
  hasUnrequestedVariantMarker,
  isMetadataTitleAligned,
} from "@/core/enrich/titleMatching";
import { volumeNumberFromTitle } from "@/core/enrich/titles/volumeNumber";
import { collectObjectMappingSignals } from "@/lib/dev/scrapeMappingSignals";
import { isAbortError, throwIfAborted } from "@/lib/http/abort";
import { fetchGetWithFlareFallback } from "@/lib/http/scrapeFetch";

import {
  babelioSearchEvidenceUrl,
  promoteBabelioSearchEvidence,
  readBabelioSearchEvidence,
} from "./durableEvidence";

const BABELIO_BASE_URL = "https://www.babelio.com";
const BABELIO_SEARCH_URL = `${BABELIO_BASE_URL}/aj_recherche.php`;

const BABELIO_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
};

export type BabelioSearchHit = {
  id: string;
  title: string;
  url: string;
  authors?: string[];
  coverUrl?: string;
  copies?: number;
  ratingValue?: number;
};

export type BabelioBook = {
  id: string;
  title: string;
  sourceUrl: string;
  description?: string;
  imageUrl?: string;
  authors: string[];
  publisher?: string;
  seriesName?: string;
  seriesUrl?: string;
  seriesPosition?: number;
  barcode?: string;
  pageCount?: number;
  releaseDate?: string;
  readingAge?: string;
  tags: string[];
  ratingValue?: number;
  ratingCount?: number;
  reviewCount?: number;
  copies?: number;
};

type BabelioAjaxItem = Record<string, unknown>;

function cleanText(value?: string | null): string | undefined {
  if (!value) return undefined;
  const text = decodeHTMLEntities(String(value))
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
  return text || undefined;
}

function absoluteBabelioUrl(pathOrUrl?: string | null): string | undefined {
  if (!pathOrUrl) return undefined;
  try {
    return new URL(pathOrUrl, BABELIO_BASE_URL).toString();
  } catch {
    return undefined;
  }
}

function decodeBabelioHtml(data: unknown): string {
  if (typeof data === "string") return data;
  if (Buffer.isBuffer(data)) return data.toString("latin1");
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString("latin1");
  if (ArrayBuffer.isView(data)) {
    return Buffer.from(
      data.buffer,
      data.byteOffset,
      data.byteLength,
    ).toString("latin1");
  }
  return String(data || "");
}

/** Prefer larger Amazon thumbnails; keep Babelio `/couv/` as-is. */
export function normalizeBabelioCoverUrl(
  value?: string | null,
): string | undefined {
  const absolute = absoluteBabelioUrl(value);
  if (!absolute) return undefined;
  try {
    const url = new URL(absolute);
    if (/amazon\.com$/i.test(url.hostname) || /media-amazon\.com$/i.test(url.hostname)) {
      url.protocol = "https:";
      url.pathname = url.pathname.replace(
        /\._S[XY]\d+_\./i,
        "._SX500_.",
      );
      return url.toString();
    }
    return url.toString();
  } catch {
    return absolute;
  }
}

function parseFrNumber(value?: string | null): number | undefined {
  const text = cleanText(value);
  if (!text) return undefined;
  const parsed = Number(text.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseIsoDateFromFr(value?: string | null): string | undefined {
  const text = cleanText(value);
  if (!text) return undefined;
  const match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return text;
  const day = match[1].padStart(2, "0");
  const month = match[2].padStart(2, "0");
  return `${match[3]}-${month}-${day}`;
}

function authorName(prenoms?: unknown, nom?: unknown): string | undefined {
  const first = cleanText(String(prenoms || ""));
  const last = cleanText(String(nom || ""));
  if (first && last) return `${first} ${last}`;
  return first || last || undefined;
}

function isLivreAjaxItem(item: BabelioAjaxItem): boolean {
  return String(item.type || "").toLowerCase() === "livres";
}

export function parseBabelioAjaxHits(payload: unknown): BabelioSearchHit[] {
  if (!Array.isArray(payload)) return [];
  const hits: BabelioSearchHit[] = [];
  const seen = new Set<string>();

  for (const raw of payload) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as BabelioAjaxItem;
    if (!isLivreAjaxItem(item)) continue;

    const id = cleanText(String(item.id_oeuvre || item.id || ""));
    const title = cleanText(String(item.titre || ""));
    const path = cleanText(String(item.url || ""));
    const url = absoluteBabelioUrl(path);
    if (!id || !title || !url) continue;
    if (seen.has(id)) continue;
    seen.add(id);

    const author = authorName(item.prenoms, item.nom);
    const copies = parseFrNumber(String(item.ca_copies ?? ""));
    const ratingValue = parseFrNumber(String(item.ca_note ?? ""));

    hits.push({
      id,
      title,
      url,
      authors: author ? [author] : undefined,
      coverUrl: normalizeBabelioCoverUrl(String(item.couverture || "")),
      copies,
      ratingValue,
    });
  }

  return hits;
}

/** HTML `/recherche.php` results — fuller titles than the AJAX autocomplete. */
export function parseBabelioHtmlSearchHits(html: string): BabelioSearchHit[] {
  const hits: BabelioSearchHit[] = [];
  const seen = new Set<string>();

  for (const match of html.matchAll(
    /href=["'](\/livres\/[^"']+)["'][^>]*class=["']titre1["'][^>]*>([^<]+)/gi,
  )) {
    const path = match[1];
    const title = cleanText(match[2]);
    const url = absoluteBabelioUrl(path);
    const id = path.match(/\/(\d+)\/?$/)?.[1];
    if (!title || !url || !id || seen.has(id)) continue;
    seen.add(id);
    hits.push({ id, title, url });
  }

  return hits;
}

function isAjaxTitleTruncated(title: string): boolean {
  return /\.\.\.\s*$/.test(title) || /…\s*$/.test(title);
}

function mergeBabelioHits(
  ...groups: BabelioSearchHit[][]
): BabelioSearchHit[] {
  const merged: BabelioSearchHit[] = [];
  const seen = new Set<string>();
  for (const group of groups) {
    for (const hit of group) {
      if (seen.has(hit.id)) continue;
      seen.add(hit.id);
      merged.push(hit);
    }
  }
  return merged;
}

function metaContent(html: string, property: string): string | undefined {
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']+)["']`,
    "i",
  );
  const match = html.match(re);
  if (match?.[1]) return cleanText(decodeHTMLEntities(match[1]));
  const re2 = new RegExp(
    `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${property}["']`,
    "i",
  );
  const match2 = html.match(re2);
  return match2?.[1]
    ? cleanText(decodeHTMLEntities(match2[1]))
    : undefined;
}

function extractItempropText(
  html: string,
  prop: string,
): string | undefined {
  const re = new RegExp(
    `itemprop=["']${prop}["'][^>]*>([\\s\\S]*?)</(?:span|div|h1|h2|a|meta)`,
    "i",
  );
  const match = html.match(re);
  if (match?.[1]) return cleanText(match[1]);
  const contentRe = new RegExp(
    `itemprop=["']${prop}["'][^>]*content=["']([^"']+)["']`,
    "i",
  );
  const contentMatch = html.match(contentRe);
  return contentMatch?.[1]
    ? cleanText(decodeHTMLEntities(contentMatch[1]))
    : undefined;
}

export function parseBabelioBookPage(
  html: string,
  sourceUrl: string,
): BabelioBook | null {
  const idMatch = sourceUrl.match(/\/livres\/[^/]+\/(\d+)/i) ||
    html.match(/\/livres\/[^/"']+\/(\d+)/i);
  const id = idMatch?.[1];
  if (!id) return null;

  const title =
    metaContent(html, "og:title")?.replace(/\s*-\s*Babelio\s*$/i, "").trim() ||
    extractItempropText(html, "name") ||
    cleanText(
      html.match(/<h1[^>]*class=["'][^"']*livre_header[^"']*["'][^>]*>([\s\S]*?)<\/h1>/i)?.[1],
    );
  // og:title is often "Title - Author" — strip trailing author segment when present.
  let cleanedTitle = title;
  if (cleanedTitle) {
    const authorFromHeader = html.match(
      /itemprop=["']author["'][\s\S]*?itemprop=["']name["'][^>]*>([\s\S]*?)<\//i,
    );
    const authorNameText = authorFromHeader?.[1]
      ? cleanText(authorFromHeader[1])
      : undefined;
    if (authorNameText) {
      const suffix = ` - ${authorNameText}`;
      if (cleanedTitle.endsWith(suffix)) {
        cleanedTitle = cleanedTitle.slice(0, -suffix.length).trim();
      }
    }
  }
  if (!cleanedTitle) return null;

  const authors: string[] = [];
  for (const match of html.matchAll(
    /itemprop=["']author["'][\s\S]*?itemprop=["']name["'][^>]*>([\s\S]*?)<\//gi,
  )) {
    const name = cleanText(match[1]);
    if (name && !authors.includes(name)) authors.push(name);
  }

  const seriesMatch = html.match(
    /href=["'](\/serie\/[^"']+)["'][^>]*>\s*<b>([^<]+)<\/b>/i,
  );
  const seriesName = seriesMatch?.[2] ? cleanText(seriesMatch[2]) : undefined;
  const seriesUrl = seriesMatch?.[1]
    ? absoluteBabelioUrl(seriesMatch[1])
    : undefined;
  const positionMatch = html.match(
    /tome\s+(\d+)\s+sur\s+\d+/i,
  );
  const seriesPosition = positionMatch?.[1]
    ? Number.parseInt(positionMatch[1], 10)
    : undefined;

  const refsBlock =
    html.match(/class=["']livre_refs[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)?.[1] ||
    "";
  const barcodeMatch = refsBlock.match(/\b(\d{10,13})\b/);
  const barcode = barcodeMatch?.[1]
    ? normalizeProductBarcode(barcodeMatch[1]) || barcodeMatch[1]
    : undefined;
  const pageCount = parseFrNumber(
    refsBlock.match(/(\d+)\s*pages?/i)?.[1] || undefined,
  );
  const releaseDate = parseIsoDateFromFr(
    refsBlock.match(/(\d{1,2}\/\d{1,2}\/\d{4})/)?.[1] || undefined,
  );
  const publisher = cleanText(
    refsBlock.match(
      /href=["']\/editeur\/\d+\/[^"']+["'][^>]*>([^<]+)<\/a>/i,
    )?.[1],
  );

  const description =
    cleanText(
      html.match(
        /itemprop=["']description["'][^>]*class=["']livre_resume["'][^>]*>([\s\S]*?)(?:<span[^>]*voir_plus|<\/div>)/i,
      )?.[1],
    ) || metaContent(html, "og:description");

  const readingAge = cleanText(
    html.match(/Âge de lecture\s*:\s*<b><a[^>]*>([^<]+)/i)?.[1],
  );

  const tags: string[] = [];
  const tagsBlock = html.match(/class=["']tags["'][^>]*>([\s\S]*?)<\/p>/i)?.[1];
  if (tagsBlock) {
    for (const match of tagsBlock.matchAll(
      /rel=["']tag["'][^>]*>([^<]+)</gi,
    )) {
      const tag = cleanText(match[1]);
      if (tag && !tags.includes(tag)) tags.push(tag);
    }
  }

  const ratingValue =
    parseFrNumber(
      html.match(
        /itemprop=["']aggregateRating["'][\s\S]*?itemprop=["']ratingValue["'][^>]*>([^<]+)/i,
      )?.[1],
    ) ||
    parseFrNumber(
      html.match(
        /itemprop=["']ratingValue["'][^>]*content\s*=\s*["']([^"']+)["']/i,
      )?.[1],
    );
  const ratingCount = parseFrNumber(
    html.match(
      /itemprop=["']ratingCount["'][^>]*>([^<]+)/i,
    )?.[1] ||
      html.match(/<span\s*>(\d+)<\/span>\s*notes/i)?.[1],
  );
  const reviewCount = parseFrNumber(
    html.match(
      /itemprop=["']reviewCount["'][^>]*content=["']([^"']+)["']/i,
    )?.[1],
  );

  const imageUrl =
    normalizeBabelioCoverUrl(
      html.match(
        /class=["'][^"']*livre_con[^"']*["'][\s\S]{0,800}?src=["']([^"']+)["']/i,
      )?.[1],
    ) ||
    normalizeBabelioCoverUrl(metaContent(html, "og:image"));

  return {
    id,
    title: cleanedTitle,
    sourceUrl: absoluteBabelioUrl(sourceUrl) || sourceUrl,
    description,
    imageUrl,
    authors,
    publisher,
    seriesName,
    seriesUrl,
    seriesPosition: Number.isFinite(seriesPosition)
      ? seriesPosition
      : undefined,
    barcode,
    pageCount,
    releaseDate,
    readingAge,
    tags,
    ratingValue,
    ratingCount,
    reviewCount,
  };
}

function hasUnrequestedCatalogVariant(query: string, title: string): boolean {
  const normalizedQuery = query
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const normalizedTitle = title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const variantTerms = [
    /\bcollect'?or\b/,
    /\bhors\s*serie\b/,
    /\bintegrale\b/,
    /\bboite\b/,
  ];
  return variantTerms.some(
    (term) => term.test(normalizedTitle) && !term.test(normalizedQuery),
  );
}

/** "Astérix, tome 6 : Astérix et Cléopâtre" → album subtitle after the colon. */
function albumSubtitle(title: string): string | undefined {
  const parts = title.split(/\s*:\s*/);
  if (parts.length < 2) return undefined;
  const subtitle = parts.slice(1).join(": ").trim();
  return subtitle || undefined;
}

function isCandidateAligned(query: string, title: string): boolean {
  if (hasUnrequestedVariantMarker(query, title)) return false;
  if (hasUnrequestedCatalogVariant(query, title)) return false;
  const queryIssue = volumeNumberFromTitle(query);
  const titleIssue = volumeNumberFromTitle(title);
  if (queryIssue && titleIssue && queryIssue !== titleIssue) return false;
  if (isMetadataTitleAligned({ title }, [query], 0.58)) return true;
  // Name-only queries often omit "tome N" while Babelio titles encode it before
  // the album subtitle — align against that subtitle when present.
  // Skip when the query already names a specific album (Wakfu + Mines…) so a
  // volume-sibling with a different subtitle cannot win via a loose bypass.
  if (albumSpecificDistinctiveTokens(query).length >= 2) return false;
  const subtitle = albumSubtitle(title);
  if (subtitle && isMetadataTitleAligned({ title: subtitle }, [query], 0.58)) {
    return true;
  }
  return false;
}

function rankBabelioHits(
  query: string,
  hits: BabelioSearchHit[],
): BabelioSearchHit[] {
  return hits
    .map((hit) => ({
      hit,
      score: catalogLabelSimilarity(query, hit.title),
    }))
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.hit);
}

async function fetchBabelioHtml(
  url: string,
  signal?: AbortSignal,
): Promise<string | null> {
  try {
    const response = await fetchGetWithFlareFallback(url, {
      headers: BABELIO_HEADERS,
      responseType: "arraybuffer",
      transformResponse: [(data) => data],
      timeout: 20_000,
      validateStatus: () => true,
      signal,
      flareMaxTimeoutMs: 60_000,
    });
    if (response.status >= 400) return null;
    const html = decodeBabelioHtml(response.data);
    if (!html.trim()) return null;
    return html;
  } catch (error) {
    if (isAbortError(error)) throw error;
    return null;
  }
}

async function searchBabelioHtmlHits(
  term: string,
  signal?: AbortSignal,
): Promise<BabelioSearchHit[]> {
  const trimmed = term.trim();
  if (!trimmed) return [];

  try {
    const body = new URLSearchParams({
      Recherche: trimmed,
      recherche: "",
    });
    const response = await axios.post(
      `${BABELIO_BASE_URL}/recherche.php`,
      body.toString(),
      {
        headers: {
          ...BABELIO_HEADERS,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        responseType: "arraybuffer",
        transformResponse: [(data) => data],
        timeout: 20_000,
        signal,
        validateStatus: () => true,
      },
    );
    if (response.status >= 400) return [];
    return parseBabelioHtmlSearchHits(decodeBabelioHtml(response.data));
  } catch (error) {
    if (isAbortError(error)) throw error;
    return [];
  }
}

export async function searchBabelioHits(
  term: string,
  signal?: AbortSignal,
): Promise<BabelioSearchHit[]> {
  const trimmed = term.trim();
  if (!trimmed) return [];

  const searchUrl = babelioSearchEvidenceUrl(trimmed);
  const fromEvidence = await readBabelioSearchEvidence(searchUrl);
  if (fromEvidence) {
    console.info(`[Babelio] Search evidence hit for ${searchUrl}`);
    return fromEvidence;
  }

  let ajaxHits: BabelioSearchHit[] = [];
  try {
    const response = await axios.post(
      BABELIO_SEARCH_URL,
      { id_user: "", isMobile: false, term: trimmed },
      {
        headers: {
          ...BABELIO_HEADERS,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        timeout: 15_000,
        signal,
        validateStatus: () => true,
      },
    );
    if (response.status < 400) {
      ajaxHits = parseBabelioAjaxHits(response.data);
    }
  } catch (error) {
    if (isAbortError(error)) throw error;
  }

  // HTML search ranks real albums ahead of side products and keeps full titles
  // (AJAX often truncates with "…" or returns a single noisy hit).
  const htmlHits = await searchBabelioHtmlHits(trimmed, signal);
  const hits = mergeBabelioHits(htmlHits, ajaxHits);
  await promoteBabelioSearchEvidence(searchUrl, hits);
  return hits;
}

export async function fetchBabelioBook(
  url: string,
  signal?: AbortSignal,
): Promise<BabelioBook | null> {
  const absolute = absoluteBabelioUrl(url);
  if (!absolute) return null;
  const html = await fetchBabelioHtml(absolute, signal);
  if (!html) return null;
  return parseBabelioBookPage(html, absolute);
}

async function pickAlignedBook(
  query: string,
  hits: BabelioSearchHit[],
  signal?: AbortSignal,
): Promise<BabelioBook | null> {
  const candidates = rankBabelioHits(
    query,
    hits.filter(
      (hit) =>
        isAjaxTitleTruncated(hit.title) || isCandidateAligned(query, hit.title),
    ),
  );
  for (const hit of candidates.slice(0, 8)) {
    throwIfAborted(signal);
    const book = await fetchBabelioBook(hit.url, signal);
    if (!book) continue;
    if (!isCandidateAligned(query, book.title)) continue;
    if (
      book.seriesName &&
      hasUnrequestedVariantMarker(query, book.seriesName)
    ) {
      continue;
    }
    return {
      ...book,
      copies: book.copies ?? hit.copies,
      ratingValue: book.ratingValue ?? hit.ratingValue,
    };
  }
  return null;
}

export async function resolveBabelioMetadata(options: {
  name?: string;
  barcode?: string;
  lookupQueries?: string[];
  signal?: AbortSignal;
}): Promise<BabelioBook | null> {
  const { signal } = options;
  const barcode = normalizeProductBarcode(options.barcode || "");

  // Babelio's community ISBN table is noisy (wrong series ↔ EAN). Only use a
  // barcode hit when a title query is also aligned — never barcode-alone.
  const nameQueries = Array.from(
    new Set(
      [options.name, ...(options.lookupQueries || [])]
        .map((q) => String(q || "").trim())
        .filter(Boolean),
    ),
  );

  if (barcode && nameQueries.length > 0) {
    throwIfAborted(signal);
    const hits = await searchBabelioHits(barcode, signal);
    for (const hit of hits.slice(0, 4)) {
      throwIfAborted(signal);
      const book = await fetchBabelioBook(hit.url, signal);
      if (!book?.barcode) continue;
      if (!barcodesEquivalent(book.barcode, barcode)) continue;
      if (!nameQueries.some((q) => isCandidateAligned(q, book.title))) continue;
      return {
        ...book,
        copies: book.copies ?? hit.copies,
      };
    }
  }

  for (const query of nameQueries) {
    throwIfAborted(signal);
    const hits = await searchBabelioHits(query, signal);
    const book = await pickAlignedBook(query, hits, signal);
    if (book) return book;
  }

  return null;
}

export async function getBabelioSuggestions(name: string): Promise<string[]> {
  const trimmed = name.trim();
  if (!trimmed) return [];
  const hits = await searchBabelioHits(trimmed);
  const titles: string[] = [];
  const seen = new Set<string>();
  for (const hit of hits.slice(0, 8)) {
    if (!hit.title || seen.has(hit.title)) continue;
    seen.add(hit.title);
    titles.push(hit.title);
    if (titles.length >= 5) break;
  }
  return titles;
}

export async function collectBabelioMappingRawKeys(
  query: string,
): Promise<string[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const hits = await searchBabelioHits(trimmed);
  const book = hits[0] ? await fetchBabelioBook(hits[0].url) : null;
  return collectObjectMappingSignals({
    hits: hits.slice(0, 3),
    book,
  });
}
