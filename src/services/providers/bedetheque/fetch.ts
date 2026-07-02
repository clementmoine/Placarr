import axios from "axios";
import { decode as decodeHTMLEntities } from "html-entities";

import { normalizeProductBarcode } from "@/lib/barcode/normalize";
import { volumeNumberFromTitle } from "@/lib/title/volumeNumber";
import { stripVolumeMarkersFromTitle } from "@/lib/title/volumeNumber";
import { metadataTitleSimilarity, hasUnrequestedVariantMarker } from "@/lib/metadata/titleMatching";

export interface BedethequeAlbum {
  id: string;
  title: string;
  sourceUrl: string;
  imageUrl?: string;
  publisher?: string;
  releaseYear?: number;
  ratingValue?: number;
  ratingCount?: number;
  authors?: string[];
  seriesName?: string;
  seriesUrl?: string;
  seriesPosition?: number;
  alternateTitles?: string[];
  barcode?: string;
}

type BedethequeSeriesCandidate = {
  id: number;
  label: string;
};

const BEDETHEQUE_BASE_URL = "https://www.bedetheque.com";
const BEDETHEQUE_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
  "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
};

const ALBUM_ISSUE_LINK_RE =
  /BD-[^"'\s]*-Numero-(\d+)-(\d+)\.html/gi;
const ALBUM_TOME_LINK_RE =
  /BD-[^"'\s]+-Tome-(\d+)-[^"'\s]+-(\d+)\.html/gi;

function cleanText(value?: string | null): string | undefined {
  const text = decodeHTMLEntities(String(value || ""))
    .replace(/<[^>]+>/g, " ")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
  return text || undefined;
}

function metaContent(html: string, key: string): string | undefined {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(
      `<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["']`,
      "i",
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["']`,
      "i",
    ),
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return decodeHTMLEntities(match[1]).trim();
  }
  return undefined;
}

function hiddenInputValue(html: string, id: string): string | undefined {
  const match = html.match(
    new RegExp(`<input[^>]+id=["']${id}["'][^>]+value=["']([^"']*)["']`, "i"),
  );
  return match?.[1]?.trim() || undefined;
}

export function absoluteBedethequeUrl(value?: string | null): string | undefined {
  if (!value) return undefined;
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith("/")) return `${BEDETHEQUE_BASE_URL}${value}`;
  return `${BEDETHEQUE_BASE_URL}/${value}`;
}

export function isBedethequeAlbumUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      /(^|\.)bedetheque\.com$/i.test(url.hostname) &&
      /\/BD-[^/]+-\d+\.html$/i.test(url.pathname)
    );
  } catch {
    return false;
  }
}

function seriesQueryFromTitle(title: string): string {
  return stripVolumeMarkersFromTitle(title);
}

function parentheticalFragments(value?: string | null): string[] {
  if (!value?.trim()) return [];
  return Array.from(value.matchAll(/\(([^)]+)\)/g))
    .map((match) => cleanText(match[1]))
    .filter((fragment): fragment is string => Boolean(fragment));
}

function parseBedethequeAlternateTitles(
  html: string,
  seriesName?: string,
): string[] {
  const alternates = new Set<string>();

  for (const fragment of parentheticalFragments(seriesName)) {
    alternates.add(fragment);
  }

  const labelledOriginal = html.match(
    /Titre\s+original[^<]*(?:<\/[^>]+>\s*)+(?:<[^>]+>\s*)*([^<\n]+)/i,
  )?.[1];
  const cleanedOriginal = cleanText(labelledOriginal);
  if (cleanedOriginal) alternates.add(cleanedOriginal);

  const hiddenOriginal = cleanText(hiddenInputValue(html, "TitreOriginal"));
  if (hiddenOriginal) alternates.add(hiddenOriginal);

  return Array.from(alternates);
}

function issueNumberFromBedethequeHtml(html: string): string | null {
  const h2 = html.match(/<h2>[\s\S]*?<\/h2>/i)?.[0] || "";
  const raw =
    volumeNumberFromTitle(h2) ||
    volumeNumberFromTitle(metaContent(html, "og:title") || "") ||
    h2.match(/Num[ée]ro\s+(\d+)/i)?.[1] ||
    html.match(/-Tome-(\d+)-Numero-/i)?.[1] ||
    null;
  return raw ? String(Number.parseInt(raw, 10)) : null;
}

function buildSeriesSearchQueries(query: string): string[] {
  const trimmed = query.replace(/\s+/g, " ").trim();
  const queries = [seriesQueryFromTitle(trimmed), trimmed];
  return Array.from(new Set(queries.filter(Boolean)));
}

export function parseBedethequeSeriesAlbumLinks(html: string): Array<{
  issue: string;
  albumId: string;
  albumPath: string;
}> {
  const seen = new Set<string>();
  const links: Array<{ issue: string; albumId: string; albumPath: string }> = [];

  const pushMatch = (albumPath: string, issue: string, albumId: string) => {
    const key = `${issue}:${albumId}`;
    if (seen.has(key)) return;
    seen.add(key);
    links.push({ issue, albumId, albumPath });
  };

  for (const match of html.matchAll(ALBUM_ISSUE_LINK_RE)) {
    pushMatch(match[0], String(Number.parseInt(match[1], 10)), match[2]);
  }

  for (const match of html.matchAll(ALBUM_TOME_LINK_RE)) {
    pushMatch(match[0], String(Number.parseInt(match[1], 10)), match[2]);
  }

  return links;
}

function bedethequeAlbumsPageUrl(series: BedethequeSeriesCandidate): string {
  const slug = series.label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['’]/g, "-")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${BEDETHEQUE_BASE_URL}/albums-${series.id}-BD-${slug}.html`;
}

export function parseBedethequeAlbumPage(
  html: string,
  sourceUrl: string,
): BedethequeAlbum | null {
  const id =
    hiddenInputValue(html, "IdAlbum") ||
    sourceUrl.match(/-(\d+)\.html$/i)?.[1];
  if (!id) return null;

  const ogTitle = metaContent(html, "og:title");
  const seriesMatch = html.match(
    /<h1>\s*<a[^>]+href=["']([^"']+)["'][^>]*title=["']([^"']+)["']/i,
  );
  const issueTitle = cleanText(
    html.match(/<h2>\s*([\s\S]*?)<\/h2>/i)?.[1]?.replace(/<[^>]+>/g, " "),
  );
  const seriesName = cleanText(seriesMatch?.[2]);
  const seriesUrl = absoluteBedethequeUrl(seriesMatch?.[1]);
  const seriesPositionRaw = issueNumberFromBedethequeHtml(html);

  const title =
    cleanText(
      seriesName && seriesPositionRaw
        ? `${seriesName} n°${seriesPositionRaw}`
        : seriesName && issueTitle
          ? `${seriesName} ${issueTitle}`
          : ogTitle || issueTitle,
    ) || ogTitle;
  if (!title) return null;

  const publisher = cleanText(
    html.match(/<span[^>]+class=['"]editeur['"][^>]*>([\s\S]*?)<\/span>/i)?.[1],
  );
  const releaseYear = Number.parseInt(
    html.match(/<span[^>]+class=['"]annee['"][^>]*>(\d{4})<\/span>/i)?.[1] ||
      "",
    10,
  );
  const ratingValue = Number.parseFloat(
    html.match(/itemprop=["']ratingValue["'][^>]*>([\d.]+)</i)?.[1] || "",
  );
  const ratingCount = Number.parseInt(
    html.match(/itemprop=["']ratingCount["'][^>]*>(\d+)</i)?.[1] || "",
    10,
  );

  const authorsBlock = html.match(
    /<div[^>]+class=['"]liste-auteurs['"][\s\S]*?<\/div>/i,
  )?.[0];
  const authors = authorsBlock
    ? Array.from(
        authorsBlock.matchAll(
          /<a[^>]+title=["']Voir la fiche de ([^"']+)["']/gi,
        ),
      )
        .map((match) => cleanText(match[1]))
        .filter((name): name is string => Boolean(name))
    : [];

  const imageUrl = absoluteBedethequeUrl(
    hiddenInputValue(html, "Couverture") ||
      metaContent(html, "og:image") ||
      metaContent(html, "twitter:image"),
  );

  const barcode =
    hiddenInputValue(html, "EAN") ||
    hiddenInputValue(html, "EANs") ||
    undefined;

  return {
    id,
    title,
    sourceUrl,
    imageUrl,
    publisher,
    releaseYear: Number.isFinite(releaseYear) ? releaseYear : undefined,
    ratingValue: Number.isFinite(ratingValue) ? ratingValue : undefined,
    ratingCount: Number.isFinite(ratingCount) ? ratingCount : undefined,
    authors: authors.length ? Array.from(new Set(authors)) : undefined,
    seriesName,
    seriesUrl,
    seriesPosition: seriesPositionRaw
      ? Number.parseInt(seriesPositionRaw, 10)
      : undefined,
    alternateTitles: parseBedethequeAlternateTitles(html, seriesName),
    barcode: barcode || undefined,
  };
}

export function pickBedethequeSeriesCandidate(
  query: string,
  candidates: BedethequeSeriesCandidate[],
): BedethequeSeriesCandidate | null {
  if (!candidates.length) return null;

  const eligible = candidates.filter(
    (candidate) => !hasUnrequestedVariantMarker(query, candidate.label),
  );
  const pool = eligible.length > 0 ? eligible : candidates;
  if (pool.length === 1) return pool[0];

  const target = seriesQueryFromTitle(query);
  let best: BedethequeSeriesCandidate | null = null;
  let bestScore = -1;

  for (const candidate of pool) {
    const score = metadataTitleSimilarity(target, candidate.label);
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }

  return bestScore >= 0.55 ? best : null;
}

export function isBedethequeBarcodeQuery(value: string): boolean {
  return Boolean(normalizeProductBarcode(value));
}

export function bedethequeAlbumMatchesBarcode(
  album: Pick<BedethequeAlbum, "barcode">,
  barcode?: string | null,
): boolean {
  const expected = normalizeProductBarcode(barcode);
  if (!expected) return true;
  const found = normalizeProductBarcode(album.barcode);
  if (!found) return true;
  return found === expected;
}

export function pickBedethequeAlbumLink(
  links: Array<{ issue: string; albumId: string; albumPath: string }>,
  issueNumber: string | null,
): string | null {
  if (!links.length) return null;
  if (issueNumber) {
    const match = links.find((link) => link.issue === issueNumber);
    if (match) return match.albumPath;
    return null;
  }
  return links[0]?.albumPath ?? null;
}

async function fetchBedethequeHtml(url: string): Promise<string | null> {
  try {
    const response = await axios.get(url, {
      headers: BEDETHEQUE_HEADERS,
      responseType: "text",
      transformResponse: [(data) => data],
      timeout: 12_000,
      validateStatus: () => true,
    });
    const html = String(response.data || "");
    if (response.status >= 400 || !html.trim()) return null;
    return html;
  } catch {
    return null;
  }
}

export async function searchBedethequeSeries(
  query: string,
): Promise<BedethequeSeriesCandidate[]> {
  try {
    const response = await axios.get(`${BEDETHEQUE_BASE_URL}/ajax/tout`, {
      params: { term: query },
      headers: BEDETHEQUE_HEADERS,
      timeout: 10_000,
      validateStatus: () => true,
    });
    if (response.status >= 400 || !Array.isArray(response.data)) return [];

    return response.data.flatMap((entry: { id?: string; label?: string }) => {
      const id = entry.id?.match(/^S(\d+)$/)?.[1];
      const label = cleanText(entry.label);
      if (!id || !label) return [];
      return [{ id: Number.parseInt(id, 10), label }];
    });
  } catch {
    return [];
  }
}

async function fetchBedethequeAlbumByUrl(
  url: string,
): Promise<BedethequeAlbum | null> {
  const html = await fetchBedethequeHtml(url);
  if (!html) return null;
  return parseBedethequeAlbumPage(html, url);
}

async function fetchBedethequeAlbumForTitle(
  query: string,
): Promise<BedethequeAlbum | null> {
  const issueNumber = volumeNumberFromTitle(query);

  for (const seriesQuery of buildSeriesSearchQueries(query)) {
    const candidates = await searchBedethequeSeries(seriesQuery);
    const series = pickBedethequeSeriesCandidate(query, candidates);
    if (!series) continue;

    const seriesHtml = await fetchBedethequeHtml(bedethequeAlbumsPageUrl(series));
    if (!seriesHtml) continue;

    const albumPath = pickBedethequeAlbumLink(
      parseBedethequeSeriesAlbumLinks(seriesHtml),
      issueNumber,
    );
    if (!albumPath) continue;

    const album = await fetchBedethequeAlbumByUrl(
      absoluteBedethequeUrl(albumPath)!,
    );
    if (!album) continue;

    if (
      issueNumber &&
      album.seriesPosition &&
      String(album.seriesPosition) !== issueNumber
    ) {
      continue;
    }

    if (
      metadataTitleSimilarity(query, album.title) < 0.5 &&
      issueNumber &&
      album.seriesPosition &&
      String(album.seriesPosition) !== issueNumber
    ) {
      continue;
    }

    return album;
  }

  return null;
}

export type FetchBedethequeMetadataOptions = {
  barcode?: string | null;
};

function acceptBedethequeAlbum(
  album: BedethequeAlbum | null,
  barcode?: string | null,
): BedethequeAlbum | null {
  if (!album) return null;
  if (!bedethequeAlbumMatchesBarcode(album, barcode)) return null;
  return album;
}

export async function fetchBedethequeMetadata(
  query: string,
  options: FetchBedethequeMetadataOptions = {},
): Promise<BedethequeAlbum | null> {
  const trimmed = query.trim();
  const barcode = normalizeProductBarcode(options.barcode);
  if (!trimmed && !barcode) return null;

  if (trimmed && isBedethequeAlbumUrl(trimmed)) {
    return acceptBedethequeAlbum(
      await fetchBedethequeAlbumByUrl(trimmed),
      barcode,
    );
  }

  if (trimmed && !isBedethequeBarcodeQuery(trimmed)) {
    return acceptBedethequeAlbum(
      await fetchBedethequeAlbumForTitle(trimmed),
      barcode,
    );
  }

  return null;
}

export async function getBedethequeSuggestions(name: string): Promise<string[]> {
  const trimmed = name.trim();
  if (!trimmed) return [];

  const titles: string[] = [];
  const seen = new Set<string>();

  for (const seriesQuery of buildSeriesSearchQueries(trimmed)) {
    const candidates = await searchBedethequeSeries(seriesQuery);
    for (const candidate of candidates.slice(0, 5)) {
      const label = candidate.label.trim();
      if (!label || seen.has(label)) continue;
      seen.add(label);
      titles.push(label);
      if (titles.length >= 5) return titles;
    }
  }

  return titles;
}
