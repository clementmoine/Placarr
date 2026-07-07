import { fetchGetWithFlareFallback } from "@/lib/http/scrapeFetch";
import { decode as decodeHTMLEntities } from "html-entities";

import { normalizeProductBarcode } from "@/core/identify/normalize";
import { volumeNumberFromTitle } from "@/core/enrich/titles/volumeNumber";
import { stripVolumeMarkersFromTitle } from "@/core/enrich/titles/volumeNumber";
import {
  metadataTitleSimilarity,
  hasUnrequestedVariantMarker,
} from "@/core/enrich/titleMatching";
import { collectHtmlMappingSignals } from "@/lib/dev/scrapeMappingSignals";

export type BedethequeCreditEntry = {
  role: string;
  names: string[];
};

export interface BedethequeAlbum {
  id: string;
  title: string;
  sourceUrl: string;
  imageUrl?: string;
  description?: string;
  /** Extra media from /media/{Couvertures,Versos,Planches,...} on the album page. */
  media?: Array<{ url: string; mediaKind: string }>;
  publisher?: string;
  releaseYear?: number;
  legalDeposit?: string;
  ratingValue?: number;
  ratingCount?: number;
  authors?: string[];
  credits?: BedethequeCreditEntry[];
  pageCount?: number;
  format?: string;
  weight?: string;
  priceEstimate?: string;
  genre?: string;
  seriesName?: string;
  seriesUrl?: string;
  seriesPosition?: number;
  alternateTitles?: string[];
  barcode?: string;
  /** C2C marketplace listings from the album page (prix-annonce). */
  saleListings?: BedethequeSaleListing[];
  /** Partner retail prices when present in static HTML (BDfugue widget). */
  retailPrices?: BedethequeRetailPrices;
}

export type BedethequeRetailPrices = {
  priceNewCents?: number;
};

export interface BedethequeSaleListing {
  listingId?: string;
  seller?: string;
  condition?: string;
  priceCents: number;
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

const ALBUM_ISSUE_LINK_RE = /BD-[^"'\s]*-Numero-(\d+)-(\d+)\.html/gi;
const ALBUM_TOME_LINK_RE = /BD-[^"'\s]+-Tome-(\d+)-[^"'\s]+-(\d+)\.html/gi;

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

export function absoluteBedethequeUrl(
  value?: string | null,
): string | undefined {
  if (!value) return undefined;
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith("/")) return `${BEDETHEQUE_BASE_URL}${value}`;
  return `${BEDETHEQUE_BASE_URL}/${value}`;
}

export function parseBedethequeAlbumInfoFields(
  html: string,
): Record<string, string> {
  const fields: Record<string, string> = {};

  for (const match of html.matchAll(
    /<li>\s*<label>\s*([^:<]+)\s*:?\s*<\/label>\s*([\s\S]*?)<\/li>/gi,
  )) {
    const label = cleanText(match[1])?.toLowerCase();
    const value = cleanText(match[2]);
    if (!label || !value) continue;
    fields[label] = value;
  }

  return fields;
}

/** Bédéthèque uses « non coté » when the album has no market estimate. */
export function isKnownBedethequePriceEstimate(
  value?: string | null,
): value is string {
  const trimmed = value?.trim();
  if (!trimmed) return false;

  const normalized = trimmed
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
  return !/^non\s+cotee?$/.test(normalized);
}

const BEDETHEQUE_MEDIA_URL_RE =
  /https?:\/\/(?:www\.)?bedetheque\.com\/media\/([^/"'\s?)]+)\/([^"'\s?)]+)/gi;

export function parseBedethequeCreditedRoles(
  html: string,
): BedethequeCreditEntry[] {
  const block = html.match(
    /<div[^>]+class=['"]liste-auteurs['"][\s\S]*?<\/div>/i,
  )?.[0];
  if (!block) return [];

  const byRole = new Map<string, string[]>();

  for (const match of block.matchAll(
    /<span class=['"]metier['"]>\(([^)]+)\)<\/span>\s*<a[^>]+title=["']Voir la fiche de ([^"']+)["']/gi,
  )) {
    const role = cleanText(match[1]);
    const name = cleanText(match[2]);
    if (!role || !name) continue;
    const names = byRole.get(role) ?? [];
    if (!names.includes(name)) names.push(name);
    byRole.set(role, names);
  }

  return Array.from(byRole.entries()).map(([role, names]) => ({ role, names }));
}

function parseBedethequePageCount(html: string, infoFields: Record<string, string>) {
  const fromSchema = Number.parseInt(
    html.match(/itemprop=["']numberOfPages["'][^>]*>(\d+)/i)?.[1] || "",
    10,
  );
  if (Number.isFinite(fromSchema) && fromSchema > 0) return fromSchema;

  const fromLabel = Number.parseInt(infoFields.planches || "", 10);
  if (Number.isFinite(fromLabel) && fromLabel > 0) return fromLabel;

  return undefined;
}

export function parseBedethequeMediaUrls(
  html: string,
): Array<{ url: string; mediaKind: string }> {
  const seen = new Set<string>();
  const media: Array<{ url: string; mediaKind: string }> = [];

  for (const match of html.matchAll(BEDETHEQUE_MEDIA_URL_RE)) {
    const mediaKind = match[1]?.trim();
    const fileName = match[2]?.trim();
    if (!mediaKind || !fileName) continue;
    const url = absoluteBedethequeUrl(`/media/${mediaKind}/${fileName}`);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    media.push({ url, mediaKind });
  }

  return media;
}

function parseEuroPriceCents(label?: string | null): number | undefined {
  if (!label) return undefined;
  const match = String(label).match(/([0-9]+(?:[.,][0-9]{1,2})?)/);
  if (!match) return undefined;
  const amount = Number.parseFloat(match[1].replace(",", "."));
  if (!Number.isFinite(amount) || amount <= 0) return undefined;
  return Math.round(amount * 100);
}

export function parseBedethequeSaleListings(
  html: string,
): BedethequeSaleListing[] {
  const listings: BedethequeSaleListing[] = [];

  for (const match of html.matchAll(
    /<tr[^>]+id=["']Vente_(\d+)["'][^>]*>([\s\S]*?)<\/tr>/gi,
  )) {
    const listingId = match[1];
    const row = match[2];
    const seller = cleanText(
      row.match(/RechVendeur=[^"']+["'][^>]*><u>([^<]+)<\/u>/i)?.[1] ||
        row.match(
          /class=["'][^"']*vendeur[^"']*["'][^>]*>[\s\S]*?<u>([^<]+)<\/u>/i,
        )?.[1],
    );
    const condition = cleanText(
      row.match(/<td class="tdv"><b>([^<]+)<\/b>/i)?.[1],
    );
    const priceText = row.match(/prix-annonce[^>]*>([^<]+)/i)?.[1];
    const priceCents = parseEuroPriceCents(priceText);
    if (!priceCents) continue;
    listings.push({ listingId, seller, condition, priceCents });
  }

  return listings.sort((a, b) => a.priceCents - b.priceCents);
}

/** BDfugue partner price when the server renders it into the album HTML. */
export function parseBedethequeRetailPrices(
  html: string,
): BedethequeRetailPrices | undefined {
  const hiddenNew = html.match(
    /id=["']prix_bdfugue["'][^>]*value=["']([^"']*)["']/i,
  )?.[1];
  const panierNew = html.match(
    /<span[^>]*class=["'][^"']*PrixAlbumPanier[^"']*["'][^>]*>([^<]+)</i,
  )?.[1];

  const priceNewCents =
    parseEuroPriceCents(hiddenNew) ?? parseEuroPriceCents(panierNew);
  if (!priceNewCents) return undefined;

  return { priceNewCents };
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

function issueNumberFromBedethequeHtml(
  html: string,
  sourceUrl?: string,
): string | null {
  const h2 = html.match(/<h2>[\s\S]*?<\/h2>/i)?.[0] || "";
  const h2Plain = cleanText(h2.replace(/<[^>]+>/g, " "));

  const h2Leading = h2Plain?.match(/^(\d+)\s*\./)?.[1];
  if (h2Leading) return String(Number.parseInt(h2Leading, 10));

  const fromTitle =
    volumeNumberFromTitle(h2Plain || "") ||
    volumeNumberFromTitle(metaContent(html, "og:title") || "");
  if (fromTitle) return fromTitle;

  const numeroInH2 = h2.match(/Num[ée]ro\s+(\d+)/i)?.[1];
  if (numeroInH2) return String(Number.parseInt(numeroInH2, 10));

  const url = sourceUrl || metaContent(html, "og:url") || "";
  const fromUrl =
    url.match(/-Tome-(\d+)-Numero-/i)?.[1] ||
    url.match(/-Tome-(\d+)-/i)?.[1];
  if (fromUrl) return String(Number.parseInt(fromUrl, 10));

  return null;
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
  const links: Array<{ issue: string; albumId: string; albumPath: string }> =
    [];

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
    hiddenInputValue(html, "IdAlbum") || sourceUrl.match(/-(\d+)\.html$/i)?.[1];
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
  const seriesPositionRaw = issueNumberFromBedethequeHtml(html, sourceUrl);

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

  const credits = parseBedethequeCreditedRoles(html);
  const authors = credits.length
    ? Array.from(new Set(credits.flatMap((entry) => entry.names)))
    : [];

  const infoFields = parseBedethequeAlbumInfoFields(html);
  const pageCount = parseBedethequePageCount(html, infoFields);
  const description = cleanText(
    html.match(/itemprop=["']description["'][^>]*>([\s\S]*?)<\//i)?.[1],
  );
  const genre = cleanText(
    html.match(/itemprop=["']genre["'][^>]*content=["']([^"']+)["']/i)?.[1] ||
      html.match(/itemprop=["']genre["'][^>]*>([^<]+)</i)?.[1],
  );
  const legalDeposit =
    infoFields["dépot légal"] ||
    infoFields["depot legal"] ||
    cleanText(
      html.match(/title=["']Dépot légal["'][^>]*>[\s\S]*?(\d{2}\/\d{4})/i)?.[1],
    );

  const imageUrl = absoluteBedethequeUrl(
    hiddenInputValue(html, "Couverture") ||
      metaContent(html, "og:image") ||
      metaContent(html, "twitter:image"),
  );

  const barcode =
    hiddenInputValue(html, "EAN") ||
    hiddenInputValue(html, "EANs") ||
    undefined;

  const media = parseBedethequeMediaUrls(html);
  const saleListings = parseBedethequeSaleListings(html);
  const retailPrices = parseBedethequeRetailPrices(html);

  return {
    id,
    title,
    sourceUrl,
    imageUrl,
    description,
    media: media.length > 0 ? media : undefined,
    saleListings: saleListings.length > 0 ? saleListings : undefined,
    retailPrices,
    publisher,
    releaseYear: Number.isFinite(releaseYear) ? releaseYear : undefined,
    legalDeposit,
    ratingValue: Number.isFinite(ratingValue) ? ratingValue : undefined,
    ratingCount: Number.isFinite(ratingCount) ? ratingCount : undefined,
    authors: authors.length ? authors : undefined,
    credits: credits.length ? credits : undefined,
    pageCount,
    format: infoFields.format,
    weight: infoFields.poids,
    priceEstimate: isKnownBedethequePriceEstimate(infoFields.estimation)
      ? infoFields.estimation
      : undefined,
    genre,
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
    const response = await fetchGetWithFlareFallback(url, {
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
    const response = await fetchGetWithFlareFallback(
      `${BEDETHEQUE_BASE_URL}/ajax/tout`,
      {
        params: { term: query },
        headers: BEDETHEQUE_HEADERS,
        timeout: 10_000,
        validateStatus: () => true,
      },
    );
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

    const seriesHtml = await fetchBedethequeHtml(
      bedethequeAlbumsPageUrl(series),
    );
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

export async function getBedethequeSuggestions(
  name: string,
): Promise<string[]> {
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

export function collectBedethequeMappingSignals(html: string): string[] {
  return collectHtmlMappingSignals(html);
}

export async function collectBedethequeMappingRawKeys(
  query: string,
): Promise<string[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  if (isBedethequeAlbumUrl(trimmed)) {
    const html = await fetchBedethequeHtml(trimmed);
    return html ? collectBedethequeMappingSignals(html) : [];
  }

  const album = await fetchBedethequeMetadata(trimmed);
  if (!album?.sourceUrl) return [];
  const html = await fetchBedethequeHtml(album.sourceUrl);
  return html ? collectBedethequeMappingSignals(html) : [];
}
