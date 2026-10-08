/**
 * LDDb live transport — search + title detail via FlareSolverr when Anubis
 * challenge-blocks the origin.
 */

import { normalizeProductBarcode } from "@/core/identify/normalize";
import { isMetadataTitleAligned } from "@/core/enrich/titleMatching";
import { throwIfAborted } from "@/lib/http/abort";
import { fetchGetWithFlareFallback } from "@/lib/http/scrapeFetch";

import { lddbCoverUrls, shelfSuggestsLddbFormat } from "./coverUrl";
import { lddbFormatById, type LddbFormat } from "./formats";
import {
  isLddbBlockedHtml,
  lddbHitListCoversQuery,
  lddbSiblingTitles,
  normalizeLddbImdbId,
  parseLddbSearchHits,
  parseLddbTitlePage,
  pickBestLddbHit,
  type LddbSearchHit,
  type LddbTitle,
} from "./parse";

const LDDB_ORIGIN = "https://www.lddb.com";

const LDDB_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9,fr;q=0.8",
};

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

async function fetchLddbHtml(
  url: string,
  signal?: AbortSignal,
): Promise<string | null> {
  throwIfAborted(signal);
  try {
    // LDDb is Anubis-gated: direct GETs open the host circuit and rarely help.
    // Skip straight to FlareSolverr with a longer solve budget.
    const res = await fetchGetWithFlareFallback(url, {
      headers: LDDB_HEADERS,
      timeout: 45000,
      signal,
      skipDirect: true,
      flareMaxTimeoutMs: 90_000,
      validateStatus: (status) => status >= 200 && status < 500,
    });
    const html = decodeHtml(res.data);
    if (!html || isLddbBlockedHtml(html)) return null;
    if (res.status >= 400) return null;
    return html;
  } catch {
    return null;
  }
}

export async function fetchLddbTitleByUrl(
  url: string,
  signal?: AbortSignal,
): Promise<LddbTitle | null> {
  const html = await fetchLddbHtml(url, signal);
  if (!html) return null;
  return parseLddbTitlePage(html, url);
}

/**
 * When Anubis/Flare drops the detail page, keep metadata from the search hit.
 * Cancelled SKUs never reach here (filtered in pickBest / UPC loop). Released
 * titles use deterministic cover URLs — LDDb serves them when artwork exists;
 * Affiche/proxy still drop real 404s at display time.
 */
function titleFromSearchHit(hit: LddbSearchHit): LddbTitle | null {
  if (hit.cancelled) return null;
  const format = lddbFormatById(hit.format);
  if (!format || !hit.title?.trim()) return null;
  const covers = lddbCoverUrls(hit.id, format);
  return {
    id: hit.id,
    format: hit.format,
    formatLabel: format.label,
    title: hit.title.trim(),
    sourceUrl: hit.url,
    year: hit.year,
    country: hit.country,
    ...(covers?.front ? { frontUrl: covers.front } : {}),
    ...(covers?.back ? { backUrl: covers.back } : {}),
    ...(hit.thumbUrl || covers?.thumb
      ? { thumbUrl: hit.thumbUrl ?? covers?.thumb }
      : {}),
  };
}

async function resolveHit(
  hit: LddbSearchHit,
  signal?: AbortSignal,
): Promise<LddbTitle | null> {
  const detail = await fetchLddbTitleByUrl(hit.url, signal);
  if (detail) return detail;
  return titleFromSearchHit(hit);
}

function withSearchAliases(
  detail: LddbTitle,
  hits: LddbSearchHit[],
  selectedId: string,
): LddbTitle {
  const aliases = lddbSiblingTitles(hits, selectedId);
  return aliases.length > 0 ? { ...detail, aliases } : detail;
}

/**
 * UPC/EAN search is catalog-wide — `format=ld` often returns an empty Flare
 * body on LDDb, while bare `?UPC=` finds the row. Prefer the shelf format when
 * several hits exist.
 */
export async function searchLddbByUpc(
  barcode: string,
  signal?: AbortSignal,
  preferredFormat?: LddbFormat | null,
): Promise<LddbTitle | null> {
  const upc = normalizeProductBarcode(barcode);
  if (!upc) return null;

  const html = await fetchLddbHtml(
    `${LDDB_ORIGIN}/search.php?UPC=${encodeURIComponent(upc)}`,
    signal,
  );
  if (!html) return null;

  const preferredHits = preferredFormat
    ? parseLddbSearchHits(html, preferredFormat)
    : [];
  const allHits =
    preferredHits.length > 0 ? preferredHits : parseLddbSearchHits(html);
  if (allHits.length === 0) return null;

  const ordered =
    preferredFormat && preferredHits.length === 0
      ? [
          ...allHits.filter((h) => h.format === preferredFormat.id),
          ...allHits.filter((h) => h.format !== preferredFormat.id),
        ]
      : allHits;

  for (const hit of ordered) {
    if (hit.cancelled) continue;
    const title = await resolveHit(hit, signal);
    if (title) return title;
  }
  return null;
}

export async function searchLddbByTitle(
  title: string,
  format: LddbFormat,
  signal?: AbortSignal,
): Promise<LddbTitle | null> {
  const q = title.trim();
  if (!q) return null;

  // Prefer format-scoped search; fall back to catalog-wide when Flare returns
  // an empty body for `format=ld` (intermittent on LDDb).
  let html = await fetchLddbHtml(
    `${LDDB_ORIGIN}/search.php?search=${encodeURIComponent(q)}&format=${format.searchFormat}`,
    signal,
  );
  let hits = html ? parseLddbSearchHits(html, format) : [];
  if (hits.length === 0) {
    html = await fetchLddbHtml(
      `${LDDB_ORIGIN}/search.php?search=${encodeURIComponent(q)}`,
      signal,
    );
    hits = html ? parseLddbSearchHits(html, format) : [];
  }

  const hit = pickBestLddbHit(hits, q);
  if (!hit) return null;
  const detail = await resolveHit(hit, signal);
  if (!detail) return null;

  // Released SKUs often keep the English catalog title while Cancelled FR
  // siblings carry the localized name Affiche searched for. Pass siblings as
  // aliases; also accept when the hit list itself covers a truncated query
  // ("… Jac" vs "… Jack") that residual identity would reject.
  const aliases = lddbSiblingTitles(hits, hit.id);
  const aligned = isMetadataTitleAligned(
    { title: detail.title, aliases },
    [q],
  );
  if (!aligned && !lddbHitListCoversQuery(q, hits)) {
    return null;
  }
  return withSearchAliases(detail, hits, hit.id);
}

/**
 * IMDb identity search — LDDb indexes `/search/IMDb/{digits}` (no `tt`).
 * Same edition pick as title search when a display name is available; no
 * title-alignment gate (IMDb id is the identity).
 */
export async function searchLddbByImdb(
  imdbId: string,
  signal?: AbortSignal,
  preferredFormat?: LddbFormat | null,
  pickQuery?: string | null,
): Promise<LddbTitle | null> {
  const id = normalizeLddbImdbId(imdbId);
  if (!id) return null;

  const html = await fetchLddbHtml(
    `${LDDB_ORIGIN}/search/IMDb/${encodeURIComponent(id)}`,
    signal,
  );
  if (!html) return null;

  const preferredHits = preferredFormat
    ? parseLddbSearchHits(html, preferredFormat)
    : [];
  const hits =
    preferredHits.length > 0 ? preferredHits : parseLddbSearchHits(html);
  if (hits.length === 0) return null;

  const q = pickQuery?.trim() || "";
  const hit = q ? pickBestLddbHit(hits, q) : null;
  if (hit) {
    const detail = await resolveHit(hit, signal);
    if (detail) {
      return withSearchAliases(
        { ...detail, imdbId: detail.imdbId || `tt${id}` },
        hits,
        hit.id,
      );
    }
  }

  // No Affiche title to rank editions: first released hit (UPC-style).
  for (const row of hits) {
    if (row.cancelled) continue;
    const detail = await resolveHit(row, signal);
    if (detail) {
      return withSearchAliases(
        { ...detail, imdbId: detail.imdbId || `tt${id}` },
        hits,
        row.id,
      );
    }
  }
  return null;
}

/**
 * Resolve an LDDb title for a movies item.
 * Order: UPC/EAN → IMDb (from TMDB/OMDb external ids) → title (shelf format
 * only). Title search requires a catalog shelf name (LaserDisc / VHD / …).
 */
export async function resolveLddbTitle(input: {
  name?: string | null;
  barcode?: string | null;
  imdbId?: string | null;
  shelfName?: string | null;
  signal?: AbortSignal;
}): Promise<LddbTitle | null> {
  const shelfFormat = shelfSuggestsLddbFormat(input.shelfName);
  const barcode = input.barcode?.trim() || null;
  if (barcode) {
    const byUpc = await searchLddbByUpc(barcode, input.signal, shelfFormat);
    if (byUpc) return byUpc;
  }

  const imdbId = input.imdbId?.trim() || null;
  if (imdbId) {
    const byImdb = await searchLddbByImdb(
      imdbId,
      input.signal,
      shelfFormat,
      input.name,
    );
    if (byImdb) return byImdb;
  }

  if (!shelfFormat) return null;

  const name = input.name?.trim() || null;
  if (!name) return null;
  return searchLddbByTitle(name, shelfFormat, input.signal);
}
