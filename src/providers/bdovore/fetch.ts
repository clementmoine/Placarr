import { fetchGetWithFlareFallback } from "@/lib/http/scrapeFetch";
import { decode as decodeHTMLEntities } from "html-entities";

import { normalizeProductBarcode } from "@/core/identify/normalize";
import {
  normalizeVolumeTitleText,
  stripVolumeMarkersFromTitle,
  volumeNumberFromTitle,
} from "@/core/enrich/titles/volumeNumber";
import {
  hasHorsSerieMarker,
  horsSerieSeriesPart,
  horsSerieSubtitleIssueNumber,
} from "@/core/enrich/titles/horsSerie";
import {
  catalogLabelSimilarity,
  distinctiveTokenCoverage,
} from "@/core/enrich/titleMatching";

import {
  promoteBdovoreSeriesEvidence,
  readBdovoreSeriesEvidence,
} from "./durableEvidence";

const BDOVORE_BASE_URL = "https://www.bdovore.com";
const BDOVORE_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "application/json,text/html;q=0.9",
  "Accept-Language": "fr-FR,fr;q=0.9",
};

/** Raw record of the public `getjson` API (all values arrive as strings). */
type BdovoreAlbumRecord = Partial<Record<string, string | null>>;

export type BdovoreCreditEntry = {
  role: string;
  names: string[];
};

export interface BdovoreAlbum {
  id: string;
  title: string;
  sourceUrl: string;
  imageUrl?: string;
  description?: string;
  /** Normalized issue label from the title ("36", "100bis"), NUM_TOME fallback. */
  issueNumber?: string;
  seriesId?: string;
  seriesName?: string;
  publisher?: string;
  editionName?: string;
  collection?: string;
  /** ISO date (DTE_PARUTION), more precise than a bare year. */
  releaseDate?: string;
  genre?: string;
  ratingValue?: number;
  ratingCount?: number;
  credits: BdovoreCreditEntry[];
  barcode?: string;
  /** BDnet partner retail price for a new copy, when listed. */
  priceNewCents?: number;
}

export type BdovoreSeriesCandidate = {
  id: string;
  label: string;
};

function cleanBdovoreText(value?: string | null): string | undefined {
  if (!value) return undefined;
  const text = decodeHTMLEntities(String(value))
    .replace(/<[^>]+>/g, " ")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
  return text || undefined;
}

/** BDovore fills empty credit slots with these placeholders. */
const BDOVORE_PLACEHOLDER_NAMES = new Set(["aucun", "indetermine"]);

function isRealBdovoreName(name?: string): name is string {
  if (!name) return false;
  const normalized = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[<>]/g, "")
    .trim();
  return normalized.length > 0 && !BDOVORE_PLACEHOLDER_NAMES.has(normalized);
}

function bdovoreCredits(record: BdovoreAlbumRecord): BdovoreCreditEntry[] {
  const roles: Array<[string, Array<string | null | undefined>]> = [
    ["Scénario", [record.scpseudo, record.scapseudo]],
    ["Dessin", [record.depseudo, record.deapseudo]],
    ["Couleurs", [record.copseudo, record.coapseudo]],
  ];

  return roles.flatMap(([role, rawNames]) => {
    const names = Array.from(
      new Set(
        rawNames
          .map((name) => cleanBdovoreText(name))
          .filter(isRealBdovoreName),
      ),
    );
    return names.length > 0 ? [{ role, names }] : [];
  });
}

function parseBdovorePriceCents(value?: string | null): number | undefined {
  if (!value) return undefined;
  const amount = Number.parseFloat(String(value).replace(",", "."));
  if (!Number.isFinite(amount) || amount <= 0) return undefined;
  return Math.round(amount * 100);
}

export function bdovoreAlbumUrl(idTome: string): string {
  return `${BDOVORE_BASE_URL}/Album?id_tome=${idTome}`;
}

/**
 * BDovore names hors-série sub-series as "Base (hors-série, <sub-series>)"
 * ("Picsou Magazine (hors-série, les trésors de Picsou)"). The parenthetical
 * <sub-series> is the identity a shelf title actually carries ("Les trésors
 * de Picsou"), so composing must fold THAT back in — not the noisy full name,
 * which drags in "Picsou Magazine" and fails title alignment.
 */
export function effectiveBdovoreSeriesLabel(seriesName: string): string {
  const parenthetical = seriesName.match(/\(([^)]*)\)/)?.[1];
  if (!parenthetical || !hasHorsSerieMarker(parenthetical)) return seriesName;

  const subSeries = parenthetical
    .replace(/\bhors[\s._-]*s[ée]rie\b/i, " ")
    .replace(/^[\s,;:–—-]+|[\s,;:–—-]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!subSeries) return seriesName;
  return subSeries.charAt(0).toUpperCase() + subSeries.slice(1);
}

/**
 * BDovore's TITRE_TOME is inconsistent: periodicals embed the series
 * ("Super Picsou Géant, Tome 7") while classic albums are bare subtitles
 * ("Fucking patriot"). Bare titles can't survive title/issue alignment, so
 * the series (and the issue when missing) is folded back into the title —
 * only when the series' tokens aren't already all present.
 */
export function composeBdovoreTitle(
  rawTitle: string,
  seriesName?: string,
  numTome?: string,
): string {
  if (!seriesName) return rawTitle;
  const seriesLabel = effectiveBdovoreSeriesLabel(seriesName);

  const titleTokens = new Set(
    normalizeVolumeTitleText(rawTitle).split(" ").filter(Boolean),
  );
  const seriesTokens = normalizeVolumeTitleText(seriesLabel)
    .split(" ")
    .filter(Boolean);
  const seriesCovered =
    seriesTokens.length > 0 &&
    seriesTokens.every((token) => titleTokens.has(token));
  if (seriesCovered) return rawTitle;

  const issueInTitle = volumeNumberFromTitle(rawTitle) !== null;
  return issueInTitle || !numTome
    ? `${seriesLabel} - ${rawTitle}`
    : `${seriesLabel} - Tome ${numTome} - ${rawTitle}`;
}

export function mapBdovoreAlbumRecord(
  record: BdovoreAlbumRecord,
): BdovoreAlbum | null {
  const id = cleanBdovoreText(record.ID_TOME);
  const rawTitle = cleanBdovoreText(record.TITRE_TOME);
  if (!id || !rawTitle) return null;

  const ratingValue = Number.parseFloat(record.MOYENNE_NOTE_TOME || "");
  const ratingCount = Number.parseInt(record.NB_NOTE_TOME || "", 10);
  const numTome = cleanBdovoreText(record.NUM_TOME);
  const seriesName = cleanBdovoreText(record.NOM_SERIE);
  const title = composeBdovoreTitle(rawTitle, seriesName, numTome);

  return {
    id,
    title,
    sourceUrl: bdovoreAlbumUrl(id),
    imageUrl: record.IMG_COUV
      ? `${BDOVORE_BASE_URL}/images/couv/${record.IMG_COUV}`
      : undefined,
    description: cleanBdovoreText(record.HISTOIRE_TOME),
    issueNumber: volumeNumberFromTitle(title) ?? numTome ?? undefined,
    seriesId: cleanBdovoreText(record.ID_SERIE),
    seriesName,
    publisher: cleanBdovoreText(record.NOM_EDITEUR),
    editionName: cleanBdovoreText(record.NOM_EDITION),
    collection: cleanBdovoreText(record.NOM_COLLECTION),
    releaseDate: cleanBdovoreText(record.DTE_PARUTION),
    genre: cleanBdovoreText(record.NOM_GENRE),
    ratingValue:
      Number.isFinite(ratingValue) && ratingValue > 0 ? ratingValue : undefined,
    ratingCount:
      Number.isFinite(ratingCount) && ratingCount > 0 ? ratingCount : undefined,
    credits: bdovoreCredits(record),
    barcode:
      normalizeProductBarcode(record.EAN_EDITION) ||
      normalizeProductBarcode(record.ISBN_EDITION) ||
      undefined,
    priceNewCents: parseBdovorePriceCents(record.PRIX_BDNET),
  };
}

async function fetchBdovoreJson(
  params: Record<string, string>,
): Promise<BdovoreAlbumRecord[]> {
  try {
    const response = await fetchGetWithFlareFallback(
      `${BDOVORE_BASE_URL}/getjson`,
      {
        params,
        headers: BDOVORE_HEADERS,
        responseType: "text",
        transformResponse: [(data) => data],
        timeout: 15_000,
        validateStatus: () => true,
      },
    );
    if (response.status >= 400) return [];
    const parsed =
      typeof response.data === "string"
        ? JSON.parse(response.data || "[]")
        : response.data;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function searchBdovoreSeries(
  term: string,
): Promise<BdovoreSeriesCandidate[]> {
  const trimmed = term.trim();
  if (!trimmed) return [];

  const searchUrl = new URL(`${BDOVORE_BASE_URL}/getjson`);
  searchUrl.searchParams.set("data", "Serie");
  searchUrl.searchParams.set("mode", "2");
  searchUrl.searchParams.set("term", trimmed);
  const requestUrl = searchUrl.toString();

  const fromEvidence = await readBdovoreSeriesEvidence(requestUrl);
  if (fromEvidence) {
    console.info(`[Bdovore] Series evidence hit for ${requestUrl}`);
    return fromEvidence;
  }

  const rows = await fetchBdovoreJson({ data: "Serie", mode: "2", term: trimmed });
  const hits = rows.flatMap((row) => {
    const id = cleanBdovoreText(row.ID_SERIE);
    const label = cleanBdovoreText(row.NOM_SERIE);
    if (!id || !label) return [];
    return [{ id, label }];
  });
  await promoteBdovoreSeriesEvidence(requestUrl, hits);
  return hits;
}

export async function fetchBdovoreSeriesAlbums(
  seriesId: string,
): Promise<BdovoreAlbum[]> {
  const rows = await fetchBdovoreJson({
    data: "Album",
    mode: "1",
    id_serie: seriesId,
  });
  return rows
    .map(mapBdovoreAlbumRecord)
    .filter((album): album is BdovoreAlbum => album !== null);
}

export async function fetchBdovoreAlbumByEan(
  barcode: string,
): Promise<BdovoreAlbum | null> {
  const normalized = normalizeProductBarcode(barcode);
  if (!normalized) return null;
  const rows = await fetchBdovoreJson({ data: "Album", EAN: normalized });
  for (const row of rows) {
    const album = mapBdovoreAlbumRecord(row);
    if (album?.barcode === normalized) return album;
  }
  return null;
}

export async function fetchBdovoreAlbumById(
  idTome: string,
): Promise<BdovoreAlbum | null> {
  const rows = await fetchBdovoreJson({ data: "Album", id_tome: idTome });
  return rows.length > 0 ? mapBdovoreAlbumRecord(rows[0]) : null;
}

function seriesQueryFromTitle(title: string): string {
  return stripVolumeMarkersFromTitle(horsSerieSeriesPart(title) ?? title);
}

function buildBdovoreSeriesQueries(query: string): string[] {
  const trimmed = query.replace(/\s+/g, " ").trim();
  const base = seriesQueryFromTitle(trimmed);
  const queries: string[] = [];

  // French catalogs shelve suffixed interim issues ("n°100bis") and
  // hors-série issues as sibling series ("<série> bis", "<série> hors
  // série") — query those first, they are the most specific.
  const issueSuffix = volumeNumberFromTitle(trimmed)?.match(
    /(bis|ter|quater)$/,
  )?.[1];
  if (base && issueSuffix) queries.push(`${base} ${issueSuffix}`);

  const horsSerie = hasHorsSerieMarker(trimmed);
  const horsSerieDedicatedFirst =
    horsSerie && Boolean(horsSerieSubtitleIssueNumber(trimmed));

  // Multi-tome HS sub-series (e.g. « Des souvenirs par millions - Tome 1 »)
  // live under a dedicated « <série> hors série » line on BDovore.
  if (base && horsSerieDedicatedFirst) queries.push(`${base} hors serie`);
  if (base) queries.push(base);
  queries.push(trimmed);
  // Standalone HS specials (e.g. « Tout Picsou de A à Z ») sit in the main
  // series without a marker in the composed title — try that line first.
  if (base && horsSerie && !horsSerieDedicatedFirst) {
    queries.push(`${base} hors serie`);
  }

  return Array.from(new Set(queries.filter(Boolean)));
}

const SERIES_CANDIDATE_MIN_SIMILARITY = 0.55;
const ALBUM_TITLE_MIN_SIMILARITY = 0.5;
const MAX_SERIES_CANDIDATES_PER_QUERY = 3;

export function rankBdovoreSeriesCandidates(
  query: string,
  candidates: BdovoreSeriesCandidate[],
): BdovoreSeriesCandidate[] {
  if (candidates.length <= 1) return candidates;

  const target = seriesQueryFromTitle(query);
  return candidates
    .map((candidate) => ({
      candidate,
      score: catalogLabelSimilarity(target, candidate.label),
    }))
    .filter((entry) => entry.score >= SERIES_CANDIDATE_MIN_SIMILARITY)
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.candidate);
}

function isBdovoreDedicatedHorsSerieSeries(seriesName?: string | null): boolean {
  return seriesName ? hasHorsSerieMarker(seriesName) : false;
}

function isBdovoreHorsSerieAlbum(album: BdovoreAlbum): boolean {
  return (
    hasHorsSerieMarker(album.title) ||
    isBdovoreDedicatedHorsSerieSeries(album.seriesName)
  );
}

function seriesLabelAlignsWithQuery(
  query: string,
  seriesName?: string | null,
): boolean {
  if (!seriesName?.trim()) return false;
  const seriesQuery = seriesQueryFromTitle(query);
  if (!seriesQuery) return false;
  return distinctiveTokenCoverage(seriesQuery, seriesName) >= 1;
}

function isBdovoreHorsSerieAlbumForQuery(
  album: BdovoreAlbum,
  query: string,
): boolean {
  if (!isBdovoreHorsSerieAlbum(album)) return false;
  if (
    isBdovoreDedicatedHorsSerieSeries(album.seriesName) &&
    seriesLabelAlignsWithQuery(query, album.seriesName)
  ) {
    return false;
  }
  return true;
}

/** HS issue shelved in the main series without a regular issue number. */
function isBdovoreMainSeriesSpecialAlbum(album: BdovoreAlbum): boolean {
  return (
    !album.issueNumber && !isBdovoreDedicatedHorsSerieSeries(album.seriesName)
  );
}

/**
 * Album picker within a series: an explicit issue in the request must match
 * the album's issue exactly (n°100bis never falls back to n°100); requests
 * without an issue (or hors-série requests) resolve by title similarity.
 * Hors-série requests only consider hors-série albums and vice versa — a
 * special issue's subtitle must never match a regular tome, nor the reverse.
 */
export function pickBdovoreAlbum(
  albums: BdovoreAlbum[],
  query: string,
): BdovoreAlbum | null {
  const horsSerie = hasHorsSerieMarker(query);
  const horsSerieSubtitleIssue = horsSerie
    ? horsSerieSubtitleIssueNumber(query)
    : null;
  const queryIssue = horsSerie ? null : volumeNumberFromTitle(query);

  let pool = albums.filter((album) => {
    if (horsSerie) {
      if (horsSerieSubtitleIssue) {
        return isBdovoreHorsSerieAlbum(album);
      }
      return isBdovoreMainSeriesSpecialAlbum(album);
    }
    return (
      !isBdovoreHorsSerieAlbumForQuery(album, query) &&
      !isBdovoreMainSeriesSpecialAlbum(album)
    );
  });
  if (queryIssue) {
    pool = pool.filter((album) => album.issueNumber === queryIssue);
  }
  if (pool.length === 0) return null;

  let best: BdovoreAlbum | null = null;
  let bestScore = -1;
  for (const album of pool) {
    const score = catalogLabelSimilarity(query, album.title);
    if (score > bestScore) {
      best = album;
      bestScore = score;
    }
  }

  if (queryIssue) return best;
  return bestScore >= ALBUM_TITLE_MIN_SIMILARITY ? best : null;
}

function bdovoreAlbumMatchesBarcode(
  album: BdovoreAlbum,
  barcode?: string | null,
): boolean {
  const expected = normalizeProductBarcode(barcode);
  if (!expected || !album.barcode) return true;
  return album.barcode === expected;
}

export type FetchBdovoreMetadataOptions = {
  barcode?: string | null;
};

export async function fetchBdovoreMetadata(
  query: string,
  options: FetchBdovoreMetadataOptions = {},
): Promise<BdovoreAlbum | null> {
  const trimmed = query.trim();
  const barcode = normalizeProductBarcode(options.barcode);
  if (!trimmed && !barcode) return null;

  if (barcode) {
    const album = await fetchBdovoreAlbumByEan(barcode);
    if (album) return album;
  }
  if (!trimmed || normalizeProductBarcode(trimmed)) return null;

  for (const term of buildBdovoreSeriesQueries(trimmed)) {
    const candidates = await searchBdovoreSeries(term);
    const rankedSeries = rankBdovoreSeriesCandidates(trimmed, candidates).slice(
      0,
      MAX_SERIES_CANDIDATES_PER_QUERY,
    );

    for (const series of rankedSeries) {
      const albums = await fetchBdovoreSeriesAlbums(series.id);
      const album = pickBdovoreAlbum(albums, trimmed);
      if (!album) continue;
      if (!bdovoreAlbumMatchesBarcode(album, barcode)) continue;
      return album;
    }
  }

  return null;
}

export async function getBdovoreSuggestions(name: string): Promise<string[]> {
  const trimmed = name.trim();
  if (!trimmed) return [];

  const titles: string[] = [];
  const seen = new Set<string>();

  for (const term of buildBdovoreSeriesQueries(trimmed)) {
    const candidates = await searchBdovoreSeries(term);
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
