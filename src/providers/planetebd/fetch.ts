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
  promotePlanetebdSearchEvidence,
  readPlanetebdSearchEvidence,
} from "./durableEvidence";

const PLANETEBD_BASE_URL = "https://www.planetebd.com";
const PLANETEBD_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
};

export type PlanetebdSearchHit = {
  id: string;
  title: string;
  url: string;
  coverUrl?: string;
  ratingStars?: number;
};

export type PlanetebdAlbum = {
  id: string;
  title: string;
  albumTitle?: string;
  sourceUrl: string;
  description?: string;
  imageUrl?: string;
  authors: string[];
  publisher?: string;
  seriesName?: string;
  seriesUrl?: string;
  barcode?: string;
  releaseDate?: string;
  genres: string[];
  ratingLabel?: string;
  ratingStars?: number;
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
    return new URL(pathOrUrl, PLANETEBD_BASE_URL).toString();
  } catch {
    return undefined;
  }
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
  return match2?.[1] ? cleanText(decodeHTMLEntities(match2[1])) : undefined;
}

function cleanSearchTitle(raw: string): string {
  return (
    cleanText(
      raw
        .replace(/\(\d+\)\s*,?\s*(?:bd|manga|comics)\s+chez\s+.+$/i, "")
        .replace(/\s+/g, " "),
    ) || raw.trim()
  );
}

export function planetebdSearchUrl(query: string): string {
  const params = new URLSearchParams({ "mot-clef": query.trim() });
  return `${PLANETEBD_BASE_URL}/recherche?${params.toString()}`;
}

export function parsePlanetebdSearchHits(html: string): PlanetebdSearchHit[] {
  const hits: PlanetebdSearchHit[] = [];
  const seen = new Set<string>();

  for (const match of html.matchAll(
    /<article class="featured article"[^>]*>([\s\S]*?)<\/article>/gi,
  )) {
    const block = match[1];
    const href = block.match(/href=["'](\/bd\/[^"'#]+\.html)/i)?.[1];
    const titleRaw = block.match(/title=["']\s*([^"']+)["']/i)?.[1];
    const cover = block.match(
      /src=["'](https:\/\/static\.planetebd\.com[^"']+)["']/i,
    )?.[1];
    const id = href?.match(/\/(\d+)\.html$/i)?.[1];
    const title = titleRaw ? cleanSearchTitle(titleRaw) : undefined;
    const url = absoluteUrl(href);
    if (!id || !title || !url || seen.has(id)) continue;
    seen.add(id);
    const ratingStars = (block.match(/ico_star_y/gi) || []).length || undefined;
    hits.push({
      id,
      title,
      url,
      coverUrl: cover,
      ratingStars,
    });
  }

  return hits;
}

export function parsePlanetebdAlbumPage(
  html: string,
  sourceUrl: string,
): PlanetebdAlbum | null {
  const id =
    sourceUrl.match(/\/(\d+)\.html(?:#.*)?$/i)?.[1] ||
    html.match(/album-cover-normal-(\d+)/i)?.[1];
  if (!id) return null;

  const seriesName = cleanText(
    html.match(/href=["']\/bd\/series\/[^"']+["'][^>]*>\s*([^<]+)/i)?.[1],
  );
  const seriesUrl = absoluteUrl(
    html.match(/href=["'](\/bd\/series\/[^"']+)["']/i)?.[1],
  );
  const albumTitle = cleanText(
    html.match(/class=["']album-title["'][^>]*>([^<]+)/i)?.[1],
  );
  const h1 = cleanText(html.match(/<h1[^>]*>([^<]+)/i)?.[1]);
  const title =
    [h1, albumTitle].filter(Boolean).join(" : ") ||
    metaContent(html, "og:title")
      ?.replace(/\s+chez\s+.+$/i, "")
      .trim() ||
    cleanText(metaContent(html, "itemprop:name"));
  if (!title) return null;

  const authors: string[] = [];
  const titleTag = cleanText(html.match(/<title>([\s\S]*?)<\/title>/i)?.[1]);
  const fromTitle = titleTag?.match(/\bde\s+(.+)$/i)?.[1];
  if (fromTitle) {
    for (const part of fromTitle.split(/,/)) {
      const name = cleanText(part);
      if (name && !authors.includes(name)) authors.push(name);
    }
  }

  const publisher = cleanText(
    html.match(/itemprop=["']editor["'][^>]*>([^<]+)/i)?.[1],
  );
  const description =
    cleanText(
      html.match(/<h2[^>]*itemprop=["']description["'][^>]*>([^<]+)/i)?.[1],
    ) || metaContent(html, "og:description");
  const barcode = normalizeProductBarcode(
    metaContent(html, "og:isbn") ||
      html.match(/itemprop=["']isbn["'][\s\S]{0,120}?(\d{13})/i)?.[1] ||
      "",
  );
  const releaseDate = html.match(
    /itemprop=["']datePublished["'][^>]+content=["']([^"']+)["']/i,
  )?.[1];
  const genres = Array.from(
    new Set(
      [...html.matchAll(/itemprop=["']genre["'][^>]*>([^<]+)/gi)]
        .map((m) => cleanText(m[1]))
        .filter((g): g is string => Boolean(g)),
    ),
  );
  const imageUrl =
    metaContent(html, "og:image") ||
    html.match(
      /src=["'](https:\/\/static\.planetebd\.com\/dynamicImages\/album\/cover\/[^"']+)["']/i,
    )?.[1];
  const ratingLabel = cleanText(
    html.match(/class=["']mark-information["'][\s\S]*?<h2[^>]*>([^<]+)/i)?.[1],
  );
  const ratingStars =
    (html.match(/ico_star_y\.png/gi) || []).length || undefined;

  return {
    id,
    title,
    albumTitle,
    sourceUrl: absoluteUrl(sourceUrl) || sourceUrl,
    description,
    imageUrl,
    authors,
    publisher,
    seriesName,
    seriesUrl,
    barcode: barcode || undefined,
    releaseDate,
    genres,
    ratingLabel,
    ratingStars,
  };
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
): Promise<string | null> {
  try {
    const response = await fetchGetWithFlareFallback(url, {
      headers: PLANETEBD_HEADERS,
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

export async function searchPlanetebdHits(
  query: string,
  signal?: AbortSignal,
): Promise<PlanetebdSearchHit[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const searchUrl = planetebdSearchUrl(trimmed);

  const fromEvidence = await readPlanetebdSearchEvidence(searchUrl);
  if (fromEvidence) {
    console.info(`[Planète BD] Search evidence hit for ${searchUrl}`);
    return fromEvidence;
  }

  const html = await fetchHtml(searchUrl, signal);
  if (!html) return [];
  const hits = parsePlanetebdSearchHits(html);
  await promotePlanetebdSearchEvidence(searchUrl, hits);
  return hits;
}

export async function fetchPlanetebdAlbum(
  url: string,
  signal?: AbortSignal,
): Promise<PlanetebdAlbum | null> {
  const absolute = absoluteUrl(url);
  if (!absolute) return null;
  const html = await fetchHtml(absolute, signal);
  return html ? parsePlanetebdAlbumPage(html, absolute) : null;
}

export async function resolvePlanetebdMetadata(options: {
  name?: string;
  barcode?: string;
  lookupQueries?: string[];
  signal?: AbortSignal;
}): Promise<PlanetebdAlbum | null> {
  const { signal } = options;
  const queries = Array.from(
    new Set(
      [options.name, ...(options.lookupQueries || [])]
        .map((q) => String(q || "").trim())
        .filter(Boolean),
    ),
  );
  const barcode = normalizeProductBarcode(options.barcode || "");

  if (barcode && queries.length > 0) {
    const hits = await searchPlanetebdHits(barcode, signal);
    for (const hit of hits.slice(0, 4)) {
      throwIfAborted(signal);
      const album = await fetchPlanetebdAlbum(hit.url, signal);
      if (!album?.barcode) continue;
      if (!barcodesEquivalent(album.barcode, barcode)) continue;
      if (queries.some((q) => isCandidateAligned(q, album.title))) return album;
    }
  }

  for (const query of queries) {
    throwIfAborted(signal);
    const hits = await searchPlanetebdHits(query, signal);
    for (const hit of hits.slice(0, 8)) {
      if (!isCandidateAligned(query, hit.title)) continue;
      throwIfAborted(signal);
      const album = await fetchPlanetebdAlbum(hit.url, signal);
      if (!album) continue;
      if (!isCandidateAligned(query, album.title)) continue;
      return album;
    }
  }

  return null;
}

export async function getPlanetebdSuggestions(name: string): Promise<string[]> {
  const hits = await searchPlanetebdHits(name);
  return hits.slice(0, 5).map((hit) => hit.title);
}

export async function collectPlanetebdMappingRawKeys(
  query: string,
): Promise<string[]> {
  const hits = await searchPlanetebdHits(query);
  const album = hits[0] ? await fetchPlanetebdAlbum(hits[0].url) : null;
  return collectObjectMappingSignals({ hits: hits.slice(0, 3), album });
}
