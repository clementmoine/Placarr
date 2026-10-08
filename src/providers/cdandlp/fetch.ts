/**
 * CDandLP live transport — barcode/title search + product detail via
 * FlareSolverr when the origin challenge-blocks.
 */

import { normalizeProductBarcode } from "@/core/identify/normalize";
import { isMetadataTitleAligned } from "@/core/enrich/titleMatching";
import { throwIfAborted } from "@/lib/http/abort";
import { fetchGetWithFlareFallback } from "@/lib/http/scrapeFetch";

import {
  isCdandlpBlockedHtml,
  parseCdandlpProductPage,
  parseCdandlpSearchHits,
  pickBestCdandlpHit,
  type CdandlpListing,
  type CdandlpSearchHit,
} from "./parse";

const CDANDLP_ORIGIN = "https://www.cdandlp.com";

const CDANDLP_HEADERS = {
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

async function fetchCdandlpHtml(
  url: string,
  signal?: AbortSignal,
): Promise<string | null> {
  throwIfAborted(signal);
  try {
    const res = await fetchGetWithFlareFallback(url, {
      headers: CDANDLP_HEADERS,
      timeout: 25000,
      signal,
      validateStatus: (status) => status >= 200 && status < 500,
    });
    const html = decodeHtml(res.data);
    if (!html || isCdandlpBlockedHtml(html)) return null;
    if (res.status >= 400) return null;
    return html;
  } catch {
    return null;
  }
}

export async function fetchCdandlpListingByUrl(
  url: string,
  signal?: AbortSignal,
): Promise<CdandlpListing | null> {
  const html = await fetchCdandlpHtml(url, signal);
  if (!html) return null;
  return parseCdandlpProductPage(html, url);
}

function listingFromSearchHit(hit: CdandlpSearchHit): CdandlpListing {
  return {
    id: hit.id,
    formatSlug: hit.formatSlug,
    formatLabel: hit.formatLabel,
    title: hit.title,
    sourceUrl: hit.url,
    imageUrl: hit.thumbUrl,
  };
}

async function resolveHit(
  hit: CdandlpSearchHit,
  signal?: AbortSignal,
): Promise<CdandlpListing | null> {
  const detail = await fetchCdandlpListingByUrl(hit.url, signal);
  if (detail) return detail;
  // Search thumbs are still real sleeve photos when Flare drops the fiche.
  return listingFromSearchHit(hit);
}

export async function searchCdandlp(
  query: string,
  signal?: AbortSignal,
): Promise<CdandlpSearchHit[]> {
  const q = query.trim();
  if (!q) return [];
  const html = await fetchCdandlpHtml(
    `${CDANDLP_ORIGIN}/en/search/?q=${encodeURIComponent(q)}`,
    signal,
  );
  if (!html) return [];
  return parseCdandlpSearchHits(html);
}

/**
 * Resolve a CDandLP listing for movies (LaserDisc) or musics (vinyl/CD…).
 * Barcode first, then title search with alignment.
 */
export async function resolveCdandlpListing(input: {
  name?: string | null;
  barcode?: string | null;
  type?: string | null;
  signal?: AbortSignal;
}): Promise<CdandlpListing | null> {
  const type = input.type?.trim() || null;
  if (type && type !== "movies" && type !== "musics") return null;

  const barcode = normalizeProductBarcode(input.barcode || "") || null;
  if (barcode) {
    const hits = await searchCdandlp(barcode, input.signal);
    const hit = pickBestCdandlpHit(hits, barcode, type);
    if (hit) {
      const listing = await resolveHit(hit, input.signal);
      if (listing) return listing;
    }
  }

  const name = input.name?.trim() || null;
  if (!name) return null;

  const hits = await searchCdandlp(name, input.signal);
  const hit = pickBestCdandlpHit(hits, name, type);
  if (!hit) return null;

  const listing = await resolveHit(hit, input.signal);
  if (!listing) return null;
  if (!isMetadataTitleAligned({ title: listing.title }, [name])) {
    return null;
  }
  return listing;
}
