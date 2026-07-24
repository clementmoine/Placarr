import { cleanCode } from "@/core/identify/query";

import type { CatalogExternalLinkContext } from "@/types/providerModule";

function scorePriceChartingTitle(value: string) {
  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  let score = 0;

  if (/^[\x00-\x7F]+$/.test(value)) score += 20;
  if (/\b(of|the|and)\b/.test(normalized)) score += 10;
  if (/[éèàùçêâôîëïüû]/i.test(value)) score -= 18;
  if (/^\s*(le|la|les|du|des)\b/i.test(normalized)) score -= 8;
  if (/\b(ps1|ps2|ps3|ps4|ps5|playstation|xbox|wii)\b/i.test(normalized)) {
    score -= 6;
  }

  return score;
}

function pickPriceChartingTitle({
  title,
  fallbackTitle,
  aliases = [],
}: {
  title?: string | null;
  fallbackTitle?: string | null;
  aliases?: string[];
}) {
  const candidates = Array.from(
    new Set(
      [title, fallbackTitle, ...aliases]
        .filter((value): value is string => Boolean(value?.trim()))
        .map((value) => value.trim()),
    ),
  );

  if (candidates.length === 0) return "";
  return candidates.sort(
    (a, b) => scorePriceChartingTitle(b) - scorePriceChartingTitle(a),
  )[0];
}

/**
 * Catalog chips must not invent `/game/{platform}/{slug}` URLs: PriceCharting
 * soft-404s unknown slugs with a 302 to search (still HTTP 200 after follow).
 * Keep an honest search link; a verified game URL is written after scrape.
 */
export function buildPriceChartingCatalogLink({
  title,
  fallbackTitle,
  barcode,
  aliases,
}: CatalogExternalLinkContext) {
  const cleanTitle = pickPriceChartingTitle({ title, fallbackTitle, aliases });
  const searchUrl = `https://www.pricecharting.com/fr/search-products?type=videogames&q=${encodeURIComponent(cleanTitle || cleanCode(barcode))}`;
  return { url: searchUrl, isDirect: false };
}
