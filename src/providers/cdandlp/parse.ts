/**
 * Pure HTML parsers for CDandLP search + product pages.
 * Live transport lives in `fetch.ts` (FlareSolverr when blocked).
 */

import { decode as decodeHTMLEntities } from "html-entities";

const CDANDLP_ORIGIN = "https://www.cdandlp.com";

/** URL format segment that maps to Placarr movies (LaserDisc). */
export const CDANDLP_LASERDISC_FORMAT = "laser-disc";

export type CdandlpSearchHit = {
  id: string;
  formatSlug: string;
  formatLabel: string;
  title: string;
  url: string;
  thumbUrl?: string;
};

export type CdandlpListing = {
  id: string;
  formatSlug: string;
  formatLabel: string;
  title: string;
  sourceUrl: string;
  barcode?: string;
  country?: string;
  year?: number;
  publisher?: string;
  priceEur?: number;
  imageUrl?: string;
};

function cleanText(value?: string | null): string | undefined {
  if (!value) return undefined;
  const text = decodeHTMLEntities(String(value))
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text || undefined;
}

function absoluteUrl(pathOrUrl?: string | null): string | undefined {
  if (!pathOrUrl) return undefined;
  try {
    return new URL(pathOrUrl, CDANDLP_ORIGIN).toString();
  } catch {
    return undefined;
  }
}

/** Prefer large marketplace photos (`imgL`) over listing thumbs (`imgM`). */
export function upgradeCdandlpImageUrl(url: string): string {
  return url.replace(/\/imgM\//i, "/imgL/");
}

export function formatLabelFromSlug(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function isCdandlpLaserDiscFormat(formatSlug: string): boolean {
  return formatSlug.toLowerCase() === CDANDLP_LASERDISC_FORMAT;
}

/** True when the hit fits the requested Placarr content type. */
export function cdandlpHitMatchesType(
  formatSlug: string,
  type?: string | null,
): boolean {
  const laser = isCdandlpLaserDiscFormat(formatSlug);
  if (type === "movies") return laser;
  if (type === "musics") return !laser;
  return true;
}

export function isCdandlpBlockedHtml(html: string): boolean {
  return (
    /just a moment/i.test(html) ||
    /cf-browser-verification/i.test(html) ||
    /making sure you're not a bot/i.test(html) ||
    /techaro\.lol-anubis/i.test(html)
  );
}

/**
 * Parse search results: product links `…/{format}/r{id}/`.
 */
export function parseCdandlpSearchHits(html: string): CdandlpSearchHit[] {
  if (!html || isCdandlpBlockedHtml(html)) return [];

  const hits: CdandlpSearchHit[] = [];
  const seen = new Set<string>();

  const linkRe =
    /href=["']((?:https?:\/\/[^"']+)?\/(?:[a-z]{2}\/)?[^"']+\/([a-z0-9-]+)\/r(\d+)\/?)["']/gi;
  let match: RegExpExecArray | null;
  while ((match = linkRe.exec(html)) !== null) {
    const hrefRaw = match[1];
    const formatSlug = match[2]?.toLowerCase();
    const id = match[3];
    if (!hrefRaw || !formatSlug || !id) continue;
    if (seen.has(id)) continue;
    // Skip nav / filter junk that isn't a listing format path.
    if (
      /^(en|fr|es|de|it|jp|search|cart|account|sell|help|forum|blog)$/i.test(
        formatSlug,
      )
    ) {
      continue;
    }
    const href = absoluteUrl(hrefRaw);
    if (!href) continue;
    seen.add(id);

    // Prefer img alt / nearby listing title when present.
    const around = html.slice(
      Math.max(0, match.index - 80),
      Math.min(html.length, match.index + 500),
    );
    const alt =
      cleanText(
        /<img[^>]+alt=["']([^"']+)["']/i.exec(around)?.[1] ||
          /alt=["']([^"']+)["'][^>]*class=["'][^"']*afterload/i.exec(around)?.[1],
      ) || undefined;
    const thumb = absoluteUrl(
      /src=["'](https?:\/\/img\.cdandlp\.com\/[^"']+)["']/i.exec(around)?.[1],
    );
    const title =
      alt
        ?.replace(/\s*-\s*Laser Disc\s*$/i, "")
        .replace(/\s+/g, " ")
        .trim() || `Item ${id}`;

    hits.push({
      id,
      formatSlug,
      formatLabel: formatLabelFromSlug(formatSlug),
      title,
      url: href.replace(/\/en\//i, "/").replace(/([^:]\/)\/+/g, "$1"),
      thumbUrl: thumb ? upgradeCdandlpImageUrl(thumb) : undefined,
    });
  }

  return hits;
}

export function pickBestCdandlpHit(
  hits: CdandlpSearchHit[],
  query: string,
  type?: string | null,
): CdandlpSearchHit | null {
  const filtered = hits.filter((hit) =>
    cdandlpHitMatchesType(hit.formatSlug, type),
  );
  if (filtered.length === 0) return null;

  const q = query
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  if (!q || /^\d{8,14}$/.test(q.replace(/\s+/g, ""))) {
    return filtered[0] ?? null;
  }

  const tokens = q.split(/\s+/).filter((t) => t.length > 1);
  let best: CdandlpSearchHit | null = null;
  let bestScore = -1;
  for (const hit of filtered) {
    const title = hit.title
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ");
    let score = 0;
    if (title.includes(q)) score += 10;
    for (const token of tokens) {
      if (title.includes(token)) score += 2;
    }
    if (score > bestScore) {
      bestScore = score;
      best = hit;
    }
  }
  return bestScore > 0 ? best : filtered[0] ?? null;
}

function parseJsonLdProduct(html: string): Record<string, unknown> | null {
  const blocks = html.matchAll(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  );
  for (const block of blocks) {
    const raw = block[1]?.trim();
    if (!raw) continue;
    try {
      const data = JSON.parse(raw) as unknown;
      const candidates = Array.isArray(data) ? data : [data];
      for (const entry of candidates) {
        if (
          entry &&
          typeof entry === "object" &&
          (entry as { "@type"?: string })["@type"] === "Product"
        ) {
          return entry as Record<string, unknown>;
        }
      }
    } catch {
      // ignore malformed JSON-LD
    }
  }
  return null;
}

function propertyValue(
  product: Record<string, unknown>,
  name: string,
): string | undefined {
  const props = product.additionalProperty;
  if (!Array.isArray(props)) return undefined;
  for (const prop of props) {
    if (!prop || typeof prop !== "object") continue;
    const row = prop as { name?: unknown; value?: unknown };
    if (String(row.name || "").toLowerCase() !== name.toLowerCase()) continue;
    return cleanText(String(row.value ?? ""));
  }
  return undefined;
}

function parsePressage(value?: string): {
  barcode?: string;
  country?: string;
} {
  if (!value) return {};
  const digits = value.match(/\b(\d{8,14})\b/)?.[1];
  const country = value
    .replace(/\b\d{8,14}\b/, "")
    .replace(/^[\s\-–—:]+|[\s\-–—:]+$/g, "")
    .trim();
  return {
    barcode: digits,
    country: country || undefined,
  };
}

/**
 * Normalize marketplace listing titles:
 * "Walt Disney - Toy story – Toy story LD laserdisc france (Laser Disc)" → "Toy story"
 */
export function cleanListingTitle(raw: string): string | undefined {
  let title = cleanText(raw);
  if (!title) return undefined;
  title = title
    .replace(/\s*\((?:laser\s*disc|lp|cd|vinyl|7"|12")\)\s*$/i, "")
    .trim();

  const enDashParts = title.split(/\s*[–—]\s*/);
  if (enDashParts.length >= 2) {
    const last = enDashParts[enDashParts.length - 1]?.trim() || "";
    const head = enDashParts[0]?.trim() || "";
    title = /laser\s*disc|laserdisc|\bld\b/i.test(last) ? head : last;
  }

  const artistTitle = title.split(/\s+-\s+/);
  if (artistTitle.length >= 2) {
    const rest = artistTitle.slice(1).join(" - ").trim();
    if (rest.length >= 2) title = rest;
  }

  return title.replace(/\s+/g, " ").trim() || undefined;
}

function listingIdFromUrl(url: string): string | undefined {
  return /\/r(\d+)\/?/i.exec(url)?.[1];
}

function formatSlugFromUrl(url: string): string | undefined {
  return /\/([a-z0-9-]+)\/r\d+\/?/i.exec(url)?.[1]?.toLowerCase();
}

/**
 * Parse a product detail page (JSON-LD Product + og:image fallback).
 */
export function parseCdandlpProductPage(
  html: string,
  sourceUrl: string,
): CdandlpListing | null {
  if (!html || isCdandlpBlockedHtml(html)) return null;

  const product = parseJsonLdProduct(html);
  const ogTitle = cleanText(
    /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i.exec(
      html,
    )?.[1] ||
      /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i.exec(
        html,
      )?.[1],
  );
  const ogImage = absoluteUrl(
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i.exec(
      html,
    )?.[1] ||
      /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i.exec(
        html,
      )?.[1],
  );
  const ogUrl = absoluteUrl(
    /<meta[^>]+property=["']og:url["'][^>]+content=["']([^"']+)["']/i.exec(
      html,
    )?.[1] || sourceUrl,
  );

  const id =
    (typeof product?.sku === "string" ? product.sku : undefined) ||
    listingIdFromUrl(ogUrl || sourceUrl);
  if (!id) return null;

  const formatSlug =
    formatSlugFromUrl(ogUrl || sourceUrl) || CDANDLP_LASERDISC_FORMAT;
  const formatLabel = formatLabelFromSlug(formatSlug);

  const title = cleanListingTitle(
    cleanText(typeof product?.name === "string" ? product.name : undefined) ||
      ogTitle ||
      "",
  );
  if (!title) return null;

  const pressage = parsePressage(propertyValue(product || {}, "Pressage"));
  const brand =
    product?.brand && typeof product.brand === "object"
      ? cleanText(
          String((product.brand as { name?: unknown }).name ?? ""),
        )
      : undefined;

  const images = product?.image;
  const imageFromLd = Array.isArray(images)
    ? absoluteUrl(typeof images[0] === "string" ? images[0] : undefined)
    : absoluteUrl(typeof images === "string" ? images : undefined);

  const offers = product?.offers;
  let priceEur: number | undefined;
  if (offers && typeof offers === "object") {
    const offer = offers as { price?: unknown; priceCurrency?: unknown };
    const currency = String(offer.priceCurrency || "EUR").toUpperCase();
    const price = Number.parseFloat(String(offer.price ?? ""));
    if (currency === "EUR" && Number.isFinite(price) && price > 0) {
      priceEur = price;
    }
  }

  const yearMatch =
    /\b(19|20)\d{2}\b/.exec(
      cleanText(
        typeof product?.description === "string" ? product.description : "",
      ) || "",
    ) ||
    /\b(19|20)\d{2}\b/.exec(html.slice(0, 8000));

  return {
    id,
    formatSlug,
    formatLabel,
    title,
    sourceUrl: ogUrl || absoluteUrl(sourceUrl) || sourceUrl,
    barcode: pressage.barcode,
    country: pressage.country,
    year: yearMatch ? Number(yearMatch[0]) : undefined,
    publisher: brand,
    priceEur,
    imageUrl: imageFromLd
      ? upgradeCdandlpImageUrl(imageFromLd)
      : ogImage
        ? upgradeCdandlpImageUrl(ogImage)
        : undefined,
  };
}
