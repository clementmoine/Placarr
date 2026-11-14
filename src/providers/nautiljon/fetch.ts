/**
 * Nautiljon — encyclopédie FR anime/manga (Cloudflare).
 * Cible métier : **volumes manga VF** (EAN, prix €, éditeur, couverture).
 * Transport : `fetchGetWithFlareFallback` (FlareSolverr requis en live).
 */
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
import { METADATA_TITLE_ALIGN_FLOOR } from "@/core/enrich/titles/identityThresholds";
import { collectObjectMappingSignals } from "@/lib/dev/scrapeMappingSignals";
import { isAbortError, throwIfAborted } from "@/lib/http/abort";
import { fetchGetWithFlareFallback } from "@/lib/http/scrapeFetch";

const NAUTILJON_BASE = "https://www.nautiljon.com";

const NAUTILJON_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
};

export type NautiljonSeriesHit = {
  id: string;
  title: string;
  url: string;
  imageUrl?: string;
  type?: string;
  volumesNumber?: string;
  score?: string;
};

export type NautiljonVolume = {
  id: string;
  title: string;
  sourceUrl: string;
  seriesName?: string;
  seriesUrl?: string;
  volumeNumber?: number;
  barcode?: string;
  imageUrl?: string;
  description?: string;
  publisherVf?: string;
  publisherVo?: string;
  releaseDateVf?: string;
  releaseDateVo?: string;
  pageCount?: number;
  priceEuroCents?: number;
  priceYen?: number;
  demographic?: string;
  authors: string[];
};

function cleanText(value?: string | null): string | undefined {
  if (!value) return undefined;
  const text = decodeHTMLEntities(String(value))
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text || undefined;
}

function absoluteUrl(pathOrUrl?: string | null): string | undefined {
  if (!pathOrUrl) return undefined;
  try {
    return new URL(pathOrUrl, NAUTILJON_BASE).toString();
  } catch {
    return undefined;
  }
}

function decodeHtml(data: unknown): string {
  if (typeof data === "string") return data;
  if (Buffer.isBuffer(data)) return data.toString("utf8");
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString("utf8");
  if (ArrayBuffer.isView(data)) {
    return Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString(
      "utf8",
    );
  }
  return String(data || "");
}

function parseEuroCents(raw?: string | null): number | undefined {
  if (!raw) return undefined;
  const match = /(\d+[.,]\d{2})\s*€/.exec(raw.replace(/\s/g, " "));
  if (!match) return undefined;
  const cents = Math.round(Number(match[1].replace(",", ".")) * 100);
  return Number.isFinite(cents) ? cents : undefined;
}

function parseYen(raw?: string | null): number | undefined {
  if (!raw) return undefined;
  const match = /(\d[\d\s]*)\s*¥/.exec(raw);
  if (!match) return undefined;
  const yen = Number(match[1].replace(/\s/g, ""));
  return Number.isFinite(yen) ? yen : undefined;
}

function parseFrDate(raw?: string | null): string | undefined {
  const text = cleanText(raw);
  if (!text) return undefined;
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text);
  if (!match) return text;
  return `${match[3]}-${match[2]}-${match[1]}`;
}

function volumeIdFromUrl(url: string): string | undefined {
  return url.match(/volume-\d+,(\d+)\.html/i)?.[1];
}

function seriesIdFromUrl(url: string): string | undefined {
  // Series pages are slug.html without volume — use slug as soft id.
  const path = (() => {
    try {
      return new URL(url).pathname;
    } catch {
      return url;
    }
  })();
  const match = path.match(/\/mangas\/([^/]+)\.html$/i);
  return match?.[1] ? decodeURIComponent(match[1]) : undefined;
}

function labeledValue(html: string, label: string): string | undefined {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`<span[^>]*>\\s*${escaped}\\s*:?\\s*</span>\\s*([^<]+)`, "i"),
    new RegExp(`${escaped}\\s*:\\s*([^<\\n]+)`, "i"),
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(html);
    const value = cleanText(match?.[1]);
    if (value) return value;
  }
  return undefined;
}

/** @internal exported for unit tests */
export function parseNautiljonSearchHits(html: string): NautiljonSeriesHit[] {
  const hits: NautiljonSeriesHit[] = [];
  const seen = new Set<string>();
  const rowRe =
    /<tr[\s\S]*?<td[^>]*class="[^"]*image[^"]*"[\s\S]*?<img[^>]+src="([^"]+)"[\s\S]*?<td[^>]*class="[^"]*left[^"]*vtop[^"]*"[\s\S]*?<a[^>]+href="(\/mangas\/[^"]+\.html)"[^>]*>([^<]+)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = rowRe.exec(html))) {
    const url = absoluteUrl(match[2]);
    const title = cleanText(match[3]);
    if (!url || !title) continue;
    if (/\/volume-/i.test(url)) continue;
    if (seen.has(url)) continue;
    seen.add(url);
    const id = seriesIdFromUrl(url) || url;
    hits.push({
      id,
      title,
      url,
      imageUrl: absoluteUrl(match[1]?.replace("imagesmin", "images")),
    });
  }

  // Fallback: any series manga links in results.
  const linkRe =
    /<a[^>]+href="(\/mangas\/[^"/?]+\.html)"[^>]*>([^<]{2,120})<\/a>/gi;
  while ((match = linkRe.exec(html))) {
    const url = absoluteUrl(match[1]);
    const title = cleanText(match[2]);
    if (!url || !title || /\/volume-/i.test(url)) continue;
    if (seen.has(url)) continue;
    seen.add(url);
    hits.push({
      id: seriesIdFromUrl(url) || url,
      title,
      url,
    });
  }
  return hits;
}

/** Volume links found on a series page or search dump. */
export function parseNautiljonVolumeLinks(
  html: string,
): Array<{ url: string; title?: string; id: string }> {
  const out: Array<{ url: string; title?: string; id: string }> = [];
  const seen = new Set<string>();
  const re =
    /<a[^>]+href="(\/mangas\/[^"]+\/volume-\d+,\d+\.html)"[^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html))) {
    const url = absoluteUrl(match[1]);
    if (!url) continue;
    const id = volumeIdFromUrl(url);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const title = cleanText(match[2].replace(/<[^>]+>/g, " "));
    out.push({ url, id, ...(title ? { title } : {}) });
  }
  return out;
}

/** @internal exported for unit tests */
export function parseNautiljonVolumePage(
  html: string,
  sourceUrl: string,
): NautiljonVolume | null {
  const id = volumeIdFromUrl(sourceUrl);
  if (!id) return null;

  const title =
    cleanText(
      html.match(
        /<(?:h1[^>]*class="[^"]*h1titre[^"]*"[^>]*>[\s\S]*?)?(?:span[^>]*itemprop="name"[^>]*|h1)[^>]*>([^<]+)</i,
      )?.[1],
    ) ||
    cleanText(html.match(/property="og:title"\s+content="([^"]+)"/i)?.[1]) ||
    cleanText(html.match(/<title>([^<]+)<\/title>/i)?.[1]);

  if (!title) return null;

  const imageUrl =
    absoluteUrl(
      html
        .match(
          /class="[^"]*image_fiche[^"]*"[\s\S]*?<img[^>]+src="([^"]+)"/i,
        )?.[1]
        ?.replace("/mini", ""),
    ) ||
    absoluteUrl(html.match(/property="og:image"\s+content="([^"]+)"/i)?.[1]);

  const eanRaw = labeledValue(html, "Code EAN");
  const barcode = normalizeProductBarcode(eanRaw) || undefined;

  const priceRaw = labeledValue(html, "Prix");
  const pagesRaw = labeledValue(html, "Nombre de pages");
  const pageCount = pagesRaw ? Number(pagesRaw.replace(/\D/g, "")) : undefined;

  const publisherVfBlock = labeledValue(html, "Éditeur VF");
  let publisherVf = publisherVfBlock;
  let demographic: string | undefined;
  if (publisherVfBlock) {
    const demoMatch = publisherVfBlock.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
    if (demoMatch) {
      publisherVf = cleanText(demoMatch[1]);
      demographic = cleanText(demoMatch[2]);
    }
  }

  // Prefer series link that is not the volume itself.
  let seriesUrl: string | undefined;
  let seriesName: string | undefined;
  const seriesRe =
    /<a[^>]+href="(\/mangas\/[^"/]+\.html)"[^>]*>([^<]{2,120})<\/a>/gi;
  let sm: RegExpExecArray | null;
  while ((sm = seriesRe.exec(html))) {
    const url = absoluteUrl(sm[1]);
    if (!url || /\/volume-/i.test(url)) continue;
    seriesUrl = url;
    seriesName = cleanText(sm[2]);
    break;
  }

  const fromTitle = volumeNumberFromTitle(title);
  const fromUrlMatch = sourceUrl.match(/volume-(\d+),/i)?.[1];
  const parsedVolume =
    fromTitle != null
      ? Number(fromTitle)
      : fromUrlMatch != null
        ? Number(fromUrlMatch)
        : Number.NaN;
  const volumeNumber = Number.isFinite(parsedVolume) ? parsedVolume : undefined;

  const authors: string[] = [];
  const authorRe =
    /<(?:span)[^>]*>\s*Auteur(?:\s+original)?\s*:\s*<\/span>\s*([^<]+)/gi;
  let am: RegExpExecArray | null;
  while ((am = authorRe.exec(html))) {
    const name = cleanText(am[1]);
    if (name) authors.push(name);
  }

  const description =
    cleanText(
      html.match(
        /(?:Résumé du tome|itemprop="description")[^>]*>[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/i,
      )?.[1],
    ) ||
    cleanText(
      html.match(/class="[^"]*description[^"]*"[^>]*>([\s\S]*?)<\/div>/i)?.[1],
    );

  return {
    id,
    title,
    sourceUrl,
    seriesName,
    seriesUrl,
    volumeNumber,
    barcode,
    imageUrl: imageUrl || undefined,
    description,
    publisherVf,
    publisherVo: labeledValue(html, "Éditeur VO"),
    releaseDateVf: parseFrDate(labeledValue(html, "Date de parution VF")),
    releaseDateVo: parseFrDate(labeledValue(html, "Date de parution VO")),
    pageCount: Number.isFinite(pageCount) ? pageCount : undefined,
    priceEuroCents: parseEuroCents(priceRaw),
    priceYen: parseYen(priceRaw),
    demographic,
    authors,
  };
}

async function fetchNautiljonHtml(
  url: string,
  signal?: AbortSignal,
): Promise<string | null> {
  throwIfAborted(signal);
  try {
    const response = await fetchGetWithFlareFallback(url, {
      headers: NAUTILJON_HEADERS,
      timeout: 25_000,
      flareMaxTimeoutMs: 60_000,
      signal,
    });
    return decodeHtml(response.data);
  } catch (error) {
    if (isAbortError(error)) throw error;
    return null;
  }
}

export async function fetchNautiljonVolumeByUrl(
  url: string,
  signal?: AbortSignal,
): Promise<NautiljonVolume | null> {
  const absolute = absoluteUrl(url);
  if (!absolute || !/\/volume-\d+,\d+\.html/i.test(absolute)) return null;
  const html = await fetchNautiljonHtml(absolute, signal);
  if (!html) return null;
  return parseNautiljonVolumePage(html, absolute);
}

export async function searchNautiljonSeries(
  query: string,
  signal?: AbortSignal,
): Promise<NautiljonSeriesHit[]> {
  const q = query.trim();
  if (!q) return [];
  const url = `${NAUTILJON_BASE}/mangas/?q=${encodeURIComponent(q).replace(/%20/g, "+")}&tri=0`;
  const html = await fetchNautiljonHtml(url, signal);
  if (!html) return [];
  return parseNautiljonSearchHits(html);
}

function scoreVolumeCandidate(
  volume: NautiljonVolume,
  input: { name?: string; barcode?: string },
): number {
  let score = 0;
  const normalizedBarcode = normalizeProductBarcode(input.barcode);
  if (normalizedBarcode && volume.barcode) {
    if (barcodesEquivalent(normalizedBarcode, volume.barcode)) score += 100;
    else return -1;
  }
  const name = input.name?.trim();
  if (name) {
    if (
      isMetadataTitleAligned(
        { title: volume.title },
        [name],
        METADATA_TITLE_ALIGN_FLOOR,
      )
    ) {
      score += 40;
    }
    score += Math.round(catalogLabelSimilarity(name, volume.title) * 20);
    const wantVol = volumeNumberFromTitle(name);
    if (
      wantVol != null &&
      volume.volumeNumber != null &&
      Number(wantVol) === volume.volumeNumber
    ) {
      score += 25;
    }
    if (hasUnrequestedVariantMarker(name, volume.title)) score -= 15;
    if (albumSpecificDistinctiveTokens(name).length) score += 5;
  }
  return score;
}

async function volumesFromSeriesPage(
  seriesUrl: string,
  signal?: AbortSignal,
): Promise<NautiljonVolume[]> {
  const html = await fetchNautiljonHtml(seriesUrl, signal);
  if (!html) return [];
  const links = parseNautiljonVolumeLinks(html).slice(0, 12);
  const volumes: NautiljonVolume[] = [];
  for (const link of links) {
    const volume = await fetchNautiljonVolumeByUrl(link.url, signal);
    if (volume) volumes.push(volume);
  }
  return volumes;
}

export async function resolveNautiljonVolume(input: {
  name?: string;
  barcode?: string | null;
  lookupQueries?: string[];
  signal?: AbortSignal;
}): Promise<NautiljonVolume | null> {
  throwIfAborted(input.signal);
  const barcode = normalizeProductBarcode(input.barcode) || undefined;
  const queries = Array.from(
    new Set(
      [barcode, ...(input.lookupQueries ?? []), input.name ?? ""]
        .map((q) => q?.trim())
        .filter((q): q is string => Boolean(q)),
    ),
  );

  let best: { volume: NautiljonVolume; score: number } | null = null;

  for (const query of queries) {
    const htmlUrl = `${NAUTILJON_BASE}/mangas/?q=${encodeURIComponent(query).replace(/%20/g, "+")}&tri=0`;
    const html = await fetchNautiljonHtml(htmlUrl, input.signal);
    if (!html) continue;

    // Direct volume hits in the search HTML.
    for (const link of parseNautiljonVolumeLinks(html).slice(0, 8)) {
      const volume = await fetchNautiljonVolumeByUrl(link.url, input.signal);
      if (!volume) continue;
      const score = scoreVolumeCandidate(volume, {
        name: input.name,
        barcode,
      });
      if (score < 0) continue;
      if (!best || score > best.score) best = { volume, score };
      if (score >= 100) return volume;
    }

    const seriesHits = parseNautiljonSearchHits(html).slice(0, 4);
    for (const hit of seriesHits) {
      if (
        input.name &&
        !isMetadataTitleAligned(
          { title: hit.title },
          [input.name],
          METADATA_TITLE_ALIGN_FLOOR,
        ) &&
        catalogLabelSimilarity(input.name, hit.title) <
          METADATA_TITLE_ALIGN_FLOOR
      ) {
        // Soft skip very bad series titles unless we have a barcode hunt.
        if (!barcode) continue;
      }
      const volumes = await volumesFromSeriesPage(hit.url, input.signal);
      for (const volume of volumes) {
        const score = scoreVolumeCandidate(volume, {
          name: input.name,
          barcode,
        });
        if (score < 0) continue;
        if (!best || score > best.score) best = { volume, score };
        if (score >= 100) return volume;
      }
    }
  }

  if (best && best.score >= (barcode ? 100 : 35)) return best.volume;
  return null;
}

export async function collectNautiljonMappingRawKeys(
  query: string,
): Promise<string[]> {
  const hits = await searchNautiljonSeries(query);
  return collectObjectMappingSignals(hits[0] ?? { query });
}

export async function getNautiljonSuggestions(
  cleanedName: string,
): Promise<string[]> {
  const hits = await searchNautiljonSeries(cleanedName);
  return hits.slice(0, 8).map((hit) => hit.title);
}
