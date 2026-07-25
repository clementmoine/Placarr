import { fetchGetWithFlareFallback } from "@/lib/http/scrapeFetch";
import { decode as decodeHTMLEntities } from "html-entities";

import { normalizeProductBarcode } from "@/core/identify/normalize";

const ABEBOOKS_BASE_URL = "https://www.abebooks.fr";
const ABEBOOKS_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
};

/** Locale suffixes AbeBooks uses on `pictures.abebooks.com/isbn/{ean}-{locale}.jpg`. */
const ABEBOOKS_COVER_LOCALES = ["fr", "us", "uk", "de", "it", "es"] as const;

export type AbeBooksOffer = {
  condition: "new" | "used";
  priceCents: number;
  offerCount?: number;
};

export type AbeBooksProduct = {
  barcode: string;
  productName?: string;
  author?: string;
  coverUrl?: string;
  sourceUrl: string;
  offers: AbeBooksOffer[];
};

/**
 * Only ISBN/EAN-direct product pages are fetched: AbeBooks' robots.txt
 * disallows /servlet/ and /search/ (title search) for generic agents, while
 * /products/isbn/ pages are unrestricted.
 */
export function abebooksProductUrl(barcode: string): string {
  return `${ABEBOOKS_BASE_URL}/products/isbn/${barcode}`;
}

/** Deterministic cover CDN URL for an ISBN (FR locale preferred). */
export function abebooksCoverUrl(
  barcode: string,
  locale: (typeof ABEBOOKS_COVER_LOCALES)[number] = "fr",
): string {
  return `https://pictures.abebooks.com/isbn/${barcode}-${locale}.jpg`;
}

export function abebooksCoverDownloadCandidates(url: string): string[] {
  const match = url.match(
    /^(https?:\/\/pictures\.abebooks\.com\/isbn\/)(\d{10,13})(?:-[a-z]{2})?(\.jpe?g)(\?.*)?$/i,
  );
  if (!match) return [url];
  const [, prefix, isbn, ext, query = ""] = match;
  const seen = new Set<string>([url]);
  const out: string[] = [url];
  for (const locale of ABEBOOKS_COVER_LOCALES) {
    const candidate = `${prefix}${isbn}-${locale}${ext}${query}`;
    if (seen.has(candidate)) continue;
    seen.add(candidate);
    out.push(candidate);
  }
  return out;
}

function parseEuroPriceCents(label?: string | null): number | undefined {
  if (!label) return undefined;
  const match = String(label).match(/([0-9]+(?:[.,][0-9]{1,2})?)/);
  if (!match) return undefined;
  const amount = Number.parseFloat(match[1].replace(",", "."));
  if (!Number.isFinite(amount) || amount <= 0) return undefined;
  return Math.round(amount * 100);
}

function parseSummaryBlock(
  html: string,
  blockId: string,
  condition: AbeBooksOffer["condition"],
): AbeBooksOffer | null {
  const block = html.match(
    new RegExp(`<div id=["']${blockId}["'][\\s\\S]*?</a>`, "i"),
  )?.[0];
  if (!block) return null;

  const priceCents = parseEuroPriceCents(
    block.match(/EUR(?:\s|&nbsp;)*([\d.,]+)/i)?.[1],
  );
  if (!priceCents) return null;

  const offerCount = Number.parseInt(
    block.match(/mbo-count["'][^>]*>\s*(\d+)/i)?.[1] || "",
    10,
  );

  return {
    condition,
    priceCents,
    offerCount:
      Number.isFinite(offerCount) && offerCount > 0 ? offerCount : undefined,
  };
}

/**
 * AbeBooks <title> embeds the author after the work title:
 * "Naruto - Tome 26 - Masashi Kishimoto: 978… - AbeBooks"
 * "Alpha - Tome 11 - Fucking patriot - Jigounov, Iouri: 978… - AbeBooks"
 * Keep the work title for alignment; surface the author separately.
 */
export function splitAbeBooksTitleAndAuthor(raw: string): {
  title: string;
  author?: string;
} {
  const trimmed = raw.trim();
  if (!trimmed) return { title: "" };

  // Prefer "Last, First" on the final segment (keeps album subtitles).
  const commaAuthor = trimmed.match(
    /^(.+)\s+[-–—]\s+([^,–—]{2,60},\s*[^–—]{2,60})$/,
  );
  if (commaAuthor) {
    return {
      title: commaAuthor[1].trim(),
      author: commaAuthor[2].trim(),
    };
  }

  // "Series - Tome N - First Last" (author only — all tokens Capitalized).
  const afterVolume = trimmed.match(
    /^(.+?\b(?:tome|vol(?:ume)?|n[°º])\s*0*\d+[a-z]*)\s+[-–—]\s+([A-ZÀ-Ý][\p{L}'’-]+(?:\s+[A-ZÀ-Ý][\p{L}'’-]+)+)$/iu,
  );
  if (afterVolume) {
    return {
      title: afterVolume[1].trim(),
      author: afterVolume[2].trim(),
    };
  }

  return { title: trimmed };
}

export function parseAbeBooksProductName(html: string): string | undefined {
  const title = decodeHTMLEntities(
    html.match(/<title>([^<]*)<\/title>/i)?.[1] || "",
  ).trim();
  if (!title) return undefined;
  // "Alpha - Tome 11 - Fucking patriot - Jigounov, Iouri: 9782803624560 - AbeBooks"
  const withoutSuffix = title
    .replace(/\s*:\s*[\dXx-]{10,17}\s*-\s*AbeBooks\s*$/i, "")
    .replace(/\s*-\s*AbeBooks\s*$/i, "")
    .trim();
  if (!withoutSuffix) return undefined;
  return splitAbeBooksTitleAndAuthor(withoutSuffix).title || undefined;
}

export function parseAbeBooksProductAuthor(html: string): string | undefined {
  const title = decodeHTMLEntities(
    html.match(/<title>([^<]*)<\/title>/i)?.[1] || "",
  ).trim();
  if (!title) return undefined;
  const withoutSuffix = title
    .replace(/\s*:\s*[\dXx-]{10,17}\s*-\s*AbeBooks\s*$/i, "")
    .replace(/\s*-\s*AbeBooks\s*$/i, "")
    .trim();
  return splitAbeBooksTitleAndAuthor(withoutSuffix).author;
}

export function parseAbeBooksCoverUrl(
  html: string,
  barcode?: string,
): string | undefined {
  const fromHtml = html.match(
    /https?:\/\/pictures\.abebooks\.com\/isbn\/(\d{10,13})(?:-[a-z]{2})?\.jpe?g/i,
  );
  if (fromHtml) {
    const isbn = normalizeProductBarcode(fromHtml[1]) || fromHtml[1];
    return abebooksCoverUrl(isbn, "fr");
  }
  const normalized = normalizeProductBarcode(barcode);
  return normalized ? abebooksCoverUrl(normalized, "fr") : undefined;
}

/** ISBN/EAN embedded in AbeBooks cover CDN URLs (series widget cards). */
export function isbnFromAbeBooksCoverUrl(url: string): string | null {
  const match = url.match(
    /pictures\.abebooks\.com\/isbn\/(\d{10,13})(?:-[a-z]{2})?\.jpe?g/i,
  );
  return match ? normalizeProductBarcode(match[1]) : null;
}

/**
 * Series id from the product-page widget mount
 * (`series-widget-mount data-id="B0CT3L6SQB"`).
 */
export function parseAbeBooksSeriesId(html: string): string | null {
  const fromMount = html.match(
    /series-widget-mount[\s\S]{0,300}?data-id=["']([A-Z0-9]+)["']/i,
  )?.[1];
  if (fromMount) return fromMount.toUpperCase();
  const fromHref = html.match(/inclseries=([A-Z0-9]+)/i)?.[1];
  return fromHref ? fromHref.toUpperCase() : null;
}

export type AbeBooksSeriesVolume = {
  volume: string;
  barcode: string;
  title: string;
  coverUrl: string;
};

function volumeFromSeriesPositionLabel(label: string): string | null {
  const match = label.match(/(?:livre|book)\s+(\d+)\s+(?:sur|of)\s+\d+/i);
  if (!match) return null;
  return String(Number.parseInt(match[1], 10));
}

export function parseAbeBooksSeriesVolumes(
  payload: unknown,
): AbeBooksSeriesVolume[] {
  if (!payload || typeof payload !== "object") return [];
  const cards = (payload as { positionCards?: unknown }).positionCards;
  if (!Array.isArray(cards)) return [];

  const volumes: AbeBooksSeriesVolume[] = [];
  const seen = new Set<string>();

  for (const card of cards) {
    if (!card || typeof card !== "object") continue;
    const row = card as {
      imageUrl?: unknown;
      title?: unknown;
      positionLabel?: unknown;
    };
    const coverUrl =
      typeof row.imageUrl === "string" ? row.imageUrl.trim() : "";
    const barcode = coverUrl ? isbnFromAbeBooksCoverUrl(coverUrl) : null;
    if (!barcode || seen.has(barcode)) continue;

    const title =
      typeof row.title === "string" ? decodeHTMLEntities(row.title).trim() : "";
    const positionLabel =
      typeof row.positionLabel === "string" ? row.positionLabel.trim() : "";
    const volume = volumeFromSeriesPositionLabel(positionLabel);
    if (!volume) continue;

    seen.add(barcode);
    volumes.push({
      volume,
      barcode,
      title: title || `Volume ${volume}`,
      coverUrl: abebooksCoverUrl(barcode, "fr"),
    });
  }

  return volumes;
}

export function abebooksSeriesWidgetUrl(seriesId: string): string {
  return `${ABEBOOKS_BASE_URL}/servlet/SeriesWidgetApi?id=${encodeURIComponent(seriesId)}`;
}

/**
 * Series sibling volumes (tome → ISBN) from the product-page series widget API.
 * ISBN is taken from each card's cover CDN URL — then callers use robots-ok
 * `/products/isbn/{ean}` for prix/cover. The widget endpoint itself is under
 * `/servlet/` (robots Disallow for `*`); used only as a seed→siblings bridge.
 */
export async function fetchAbeBooksSeriesVolumes(
  seriesId: string,
): Promise<AbeBooksSeriesVolume[]> {
  const id = seriesId.trim().toUpperCase();
  if (!id) return [];

  try {
    const response = await fetchGetWithFlareFallback(
      abebooksSeriesWidgetUrl(id),
      {
        headers: {
          ...ABEBOOKS_HEADERS,
          Accept: "application/json,text/plain,*/*",
        },
        responseType: "json",
        timeout: 15_000,
        validateStatus: () => true,
      },
    );
    if (response.status >= 400) return [];
    return parseAbeBooksSeriesVolumes(response.data);
  } catch {
    return [];
  }
}

/** Seed ISBN → product page series id → sibling volumes with ISBNs. */
export async function fetchAbeBooksSeriesVolumesFromBarcode(
  barcode: string,
): Promise<AbeBooksSeriesVolume[]> {
  const normalized = normalizeProductBarcode(barcode);
  if (!normalized) return [];

  try {
    const response = await fetchGetWithFlareFallback(
      abebooksProductUrl(normalized),
      {
        headers: ABEBOOKS_HEADERS,
        responseType: "text",
        transformResponse: [(data) => data],
        timeout: 15_000,
        validateStatus: () => true,
      },
    );
    const html = String(response.data || "");
    if (response.status >= 400 || !html.trim()) return [];
    const seriesId = parseAbeBooksSeriesId(html);
    if (!seriesId) return [];
    return fetchAbeBooksSeriesVolumes(seriesId);
  } catch {
    return [];
  }
}

export function parseAbeBooksProductOffers(html: string): AbeBooksOffer[] {
  return [
    parseSummaryBlock(html, "new-from", "new"),
    parseSummaryBlock(html, "used-from", "used"),
  ].filter((offer): offer is AbeBooksOffer => offer !== null);
}

export async function fetchAbeBooksProduct(
  barcode: string,
  options: { requireOffers?: boolean } = {},
): Promise<AbeBooksProduct | null> {
  const requireOffers = options.requireOffers !== false;
  const normalized = normalizeProductBarcode(barcode);
  if (!normalized) return null;

  const sourceUrl = abebooksProductUrl(normalized);
  try {
    const response = await fetchGetWithFlareFallback(sourceUrl, {
      headers: ABEBOOKS_HEADERS,
      responseType: "text",
      transformResponse: [(data) => data],
      timeout: 15_000,
      validateStatus: () => true,
    });
    const html = String(response.data || "");
    if (response.status >= 400 || !html.trim()) return null;

    const offers = parseAbeBooksProductOffers(html);
    const productName = parseAbeBooksProductName(html);
    const author = parseAbeBooksProductAuthor(html);
    const coverUrl = parseAbeBooksCoverUrl(html, normalized);
    if (requireOffers && offers.length === 0) return null;
    if (!requireOffers && !productName && !coverUrl && offers.length === 0) {
      return null;
    }

    return {
      barcode: normalized,
      productName,
      author,
      coverUrl,
      sourceUrl,
      offers,
    };
  } catch {
    return null;
  }
}
