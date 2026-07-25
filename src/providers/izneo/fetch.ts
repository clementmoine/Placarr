import { httpGet } from "@/lib/http/httpClient";

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

import {
  izneoSearchEvidenceUrl,
  promoteIzneoSearchEvidence,
  readIzneoSearchEvidence,
} from "./durableEvidence";

const IZNEO_WEB_API = "https://www.izneo.com/api/web";
const IZNEO_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "application/json",
  "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
};

export type IzneoSeriesHit = {
  id: string;
  title: string;
  slug?: string;
  shelf?: string;
  ratingValue?: number;
  ratingCount?: number;
  genreName?: string;
};

export type IzneoVolumeHit = {
  id: string;
  title: string;
  volume?: string;
  ean?: string;
  slug?: string;
  /** Full API album object when list endpoint embeds fiche fields. */
  raw?: Record<string, unknown>;
};

export type IzneoAlbum = {
  id: string;
  title: string;
  displayTitle?: string;
  sourceUrl: string;
  description?: string;
  imageUrl?: string;
  authors: string[];
  publishers: string[];
  genres: string[];
  seriesName?: string;
  seriesUrl?: string;
  volume?: string;
  barcode?: string;
  pageCount?: number;
  releaseDate?: string;
  ratingValue?: number;
  ratingCount?: number;
  priceCents?: number;
};

function cleanText(value?: string | null): string | undefined {
  if (!value) return undefined;
  const text = String(value)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text || undefined;
}

function absoluteIzneoUrl(pathOrUrl?: string | null): string | undefined {
  if (!pathOrUrl) return undefined;
  try {
    return new URL(pathOrUrl, "https://www.izneo.com").toString();
  } catch {
    return undefined;
  }
}

export function izneoAlbumCoverUrl(albumId: string): string {
  return `https://image.izneo.com/fr/images/album/${albumId}.jpg`;
}

function parseNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const text = cleanText(String(value ?? ""));
  if (!text) return undefined;
  const parsed = Number(text.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function namedList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map((item) =>
          item && typeof item === "object"
            ? cleanText(String((item as { name?: string }).name || ""))
            : cleanText(String(item || "")),
        )
        .filter((name): name is string => Boolean(name)),
    ),
  );
}

async function izneoGet<T>(
  path: string,
  signal?: AbortSignal,
): Promise<T | null> {
  try {
    const response = await httpGet<T>(`${IZNEO_WEB_API}${path}`, {
      headers: IZNEO_HEADERS,
      timeout: 20_000,
      signal,
      validateStatus: () => true,
      maxRedirects: 5,
    });
    if (response.status >= 400 || response.data == null) return null;
    return response.data;
  } catch (error) {
    if (isAbortError(error)) throw error;
    return null;
  }
}

export function parseIzneoSearchPayload(payload: unknown): IzneoSeriesHit[] {
  if (!payload || typeof payload !== "object") return [];
  const series = (payload as { series?: unknown }).series;
  if (!Array.isArray(series)) return [];
  const hits: IzneoSeriesHit[] = [];
  for (const raw of series) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;
    const id = cleanText(String(item.id || ""));
    const title = cleanText(String(item.title || ""));
    if (!id || !title) continue;
    hits.push({
      id,
      title,
      slug: cleanText(String(item.slug || "")),
      shelf: cleanText(String(item.shelf || "")),
      ratingValue: parseNumber(item.rate),
      ratingCount: parseNumber(item.rateAmount),
      genreName: cleanText(String(item.genreName || "")),
    });
  }
  return hits;
}

export function parseIzneoVolumesPayload(payload: unknown): IzneoVolumeHit[] {
  if (!payload || typeof payload !== "object") return [];
  const albums = (payload as { albums?: unknown }).albums;
  if (!Array.isArray(albums)) return [];
  const hits: IzneoVolumeHit[] = [];
  for (const raw of albums) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;
    const id = cleanText(String(item.id || ""));
    const title = cleanText(String(item.title || item.displayTitle || ""));
    if (!id || !title) continue;
    hits.push({
      id,
      title,
      volume: cleanText(String(item.volume || "")),
      ean: normalizeProductBarcode(String(item.ean || "")) || undefined,
      slug: cleanText(String(item.slug || "")),
      raw: item,
    });
  }
  return hits;
}

export function mapIzneoAlbumPayload(
  payload: Record<string, unknown>,
): IzneoAlbum | null {
  const id = cleanText(String(payload.id || ""));
  const title = cleanText(String(payload.title || payload.displayTitle || ""));
  if (!id || !title) return null;
  const path = cleanText(String(payload.url || ""));
  const price = parseNumber(payload.price);
  return {
    id,
    title,
    displayTitle: cleanText(String(payload.displayTitle || "")),
    sourceUrl: absoluteIzneoUrl(path) || `https://www.izneo.com/fr/bd/${id}`,
    description: cleanText(String(payload.synopsis || "")),
    imageUrl: izneoAlbumCoverUrl(id),
    authors: namedList(payload.authors),
    publishers: namedList(payload.publishers),
    genres: namedList(payload.genres),
    seriesName: cleanText(String(payload.serieName || "")),
    seriesUrl: absoluteIzneoUrl(String(payload.serieUrl || "")),
    volume: cleanText(String(payload.volume || "")),
    barcode: normalizeProductBarcode(String(payload.ean || "")) || undefined,
    pageCount: parseNumber(payload.totalPages),
    releaseDate: cleanText(String(payload.publicationDate || "")),
    ratingValue: parseNumber(payload.rate),
    ratingCount: parseNumber(payload.rateAmount),
    priceCents: price != null ? Math.round(price * 100) : undefined,
  };
}

function queryHasSpecificAlbumTokens(query: string): boolean {
  return albumSpecificDistinctiveTokens(query).length >= 2;
}

/** @internal exported for unit tests */
export function isCandidateAligned(query: string, title: string): boolean {
  if (hasUnrequestedVariantMarker(query, title)) return false;
  const queryIssue = volumeNumberFromTitle(query);
  const titleIssue = volumeNumberFromTitle(title);
  if (queryIssue && titleIssue && queryIssue !== titleIssue) return false;
  if (isMetadataTitleAligned({ title }, [query], 0.58)) return true;
  // Izneo titles: "Série - Album - n°N" — align on the album segment.
  // When the query already names a specific album, do not accept a bare
  // franchise/series segment (that would snap any volume N of the series).
  if (queryHasSpecificAlbumTokens(query)) return false;
  for (const part of title.split(/\s+-\s+/)) {
    const segment = part.trim();
    if (!segment) continue;
    if (/^n[°º]?\s*\d+/i.test(segment) || /^t\d+\b/i.test(segment)) continue;
    if (isMetadataTitleAligned({ title: segment }, [query], 0.58)) return true;
  }
  const subtitle = title
    .split(/\s*:\s*/)
    .slice(1)
    .join(": ")
    .trim();
  return Boolean(
    subtitle && isMetadataTitleAligned({ title: subtitle }, [query], 0.58),
  );
}

export async function searchIzneoSeries(
  query: string,
  signal?: AbortSignal,
): Promise<IzneoSeriesHit[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const searchUrl = izneoSearchEvidenceUrl(trimmed);
  const fromEvidence = await readIzneoSearchEvidence(searchUrl);
  if (fromEvidence) {
    console.info(`[Izneo] Search evidence hit for ${searchUrl}`);
    return fromEvidence;
  }

  const encoded = encodeURIComponent(trimmed);
  const payload = await izneoGet<unknown>(
    `/search/v2/search-all/${encoded}`,
    signal,
  );
  const hits = parseIzneoSearchPayload(payload);
  await promoteIzneoSearchEvidence(searchUrl, hits);
  return hits;
}

export async function fetchIzneoSerieVolumes(
  serieId: string,
  signal?: AbortSignal,
): Promise<IzneoVolumeHit[]> {
  // Sort by rating + large page so classic volumes (tome 1…) are included —
  // the default `/volumes` window only returns the newest 20.
  const payload = await izneoGet<unknown>(
    `/serie/${encodeURIComponent(serieId)}/volumes/rating/0/100`,
    signal,
  );
  return parseIzneoVolumesPayload(payload);
}

/** Prefer a rich volume payload as album when the list already embeds fiche fields. */
export function mapIzneoVolumeToAlbum(
  volume: IzneoVolumeHit,
): IzneoAlbum | null {
  if (!volume.raw) return null;
  return mapIzneoAlbumPayload(volume.raw);
}

export async function fetchIzneoAlbum(
  albumId: string,
  signal?: AbortSignal,
): Promise<IzneoAlbum | null> {
  const payload = await izneoGet<Record<string, unknown>>(
    `/album/${encodeURIComponent(albumId)}`,
    signal,
  );
  return payload ? mapIzneoAlbumPayload(payload) : null;
}

function rankAlignedVolumes(
  query: string,
  volumes: IzneoVolumeHit[],
): IzneoVolumeHit[] {
  return volumes
    .map((volume) => ({
      volume,
      score: catalogLabelSimilarity(query, volume.title),
    }))
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.volume);
}

/** @internal exported for unit tests */
export function pickVolume(
  volumes: IzneoVolumeHit[],
  query: string,
  barcode?: string,
): IzneoVolumeHit | null {
  if (barcode) {
    const byBarcode = volumes.find(
      (volume) => volume.ean && barcodesEquivalent(volume.ean, barcode),
    );
    if (byBarcode) return byBarcode;
  }

  const queryVolume = volumeNumberFromTitle(query);
  const aligned = rankAlignedVolumes(
    query,
    volumes.filter((volume) => isCandidateAligned(query, volume.title)),
  );
  if (queryVolume) {
    const exact = aligned.filter((volume) => volume.volume === queryVolume);
    if (exact.length > 0) return exact[0] ?? null;
  }
  return aligned[0] || null;
}

export async function resolveIzneoMetadata(options: {
  name?: string;
  barcode?: string;
  lookupQueries?: string[];
  signal?: AbortSignal;
}): Promise<IzneoAlbum | null> {
  const { signal } = options;
  const barcode = normalizeProductBarcode(options.barcode || "");
  const queries = Array.from(
    new Set(
      [options.name, ...(options.lookupQueries || [])]
        .map((q) => String(q || "").trim())
        .filter(Boolean),
    ),
  );

  for (const query of queries.length ? queries : barcode ? [barcode] : []) {
    throwIfAborted(signal);
    const seriesHits = await searchIzneoSeries(query, signal);
    for (const series of seriesHits.slice(0, 4)) {
      if (
        queries.length > 0 &&
        !queries.some(
          (q) =>
            isCandidateAligned(q, series.title) ||
            series.title
              .toLowerCase()
              .includes(q.toLowerCase().split(/\s+/)[0] || ""),
        )
      ) {
        // Keep top series from search API — validate on album title later.
      }
      throwIfAborted(signal);
      const volumes = await fetchIzneoSerieVolumes(series.id, signal);
      const picked =
        pickVolume(volumes, query, barcode || undefined) ||
        (barcode
          ? volumes.find(
              (volume) => volume.ean && barcodesEquivalent(volume.ean, barcode),
            )
          : null);
      if (!picked) continue;
      const album =
        (picked.raw ? mapIzneoAlbumPayload(picked.raw) : null) ||
        (await fetchIzneoAlbum(picked.id, signal));
      if (!album) continue;
      if (
        barcode &&
        album.barcode &&
        !barcodesEquivalent(album.barcode, barcode)
      ) {
        continue;
      }
      if (
        queries.length > 0 &&
        !queries.some((q) => {
          if (isCandidateAligned(q, album.title)) return true;
          if (album.displayTitle && isCandidateAligned(q, album.displayTitle)) {
            return true;
          }
          // Series name alone is enough only when the query has no album
          // subtitle tokens — otherwise any volume of that series would win.
          if (
            album.seriesName &&
            !queryHasSpecificAlbumTokens(q) &&
            isCandidateAligned(q, album.seriesName)
          ) {
            return true;
          }
          return false;
        })
      ) {
        continue;
      }
      return album;
    }
  }

  return null;
}

export async function getIzneoSuggestions(name: string): Promise<string[]> {
  const series = await searchIzneoSeries(name);
  return series.slice(0, 5).map((hit) => hit.title);
}

export async function collectIzneoMappingRawKeys(
  query: string,
): Promise<string[]> {
  const series = await searchIzneoSeries(query);
  const volumes = series[0] ? await fetchIzneoSerieVolumes(series[0].id) : [];
  const album = volumes[0] ? await fetchIzneoAlbum(volumes[0].id) : null;
  return collectObjectMappingSignals({
    series: series.slice(0, 3),
    volumes: volumes.slice(0, 3),
    album,
  });
}
