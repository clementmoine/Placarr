import { cleanCode, detectPlatformKey } from "@/lib/barcode/query";
import { getPriceChartingPlatformSlugs } from "@/lib/games/platforms";
import { slugify } from "@/lib/routing/slugs";

import type { CatalogExternalLinkContext } from "@/types/providerModule";

function looksPal({
  barcode,
  shelfName,
  title,
  aliases = [],
}: {
  barcode?: string | null;
  shelfName?: string | null;
  title?: string | null;
  aliases?: string[];
}) {
  const evidence = [shelfName, title, ...aliases].filter(Boolean).join(" ");
  if (/\b(ntsc|usa?|jp|jpn|japan)\b/i.test(evidence)) return false;
  if (/\b(pal|eur?|europe|fr|fra|fre|uk)\b/i.test(evidence)) return true;

  const code = cleanCode(barcode);
  return code.length === 13 && !code.startsWith("0");
}

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

function shouldUsePriceChartingSearchUrl(title: string) {
  return /\bclub football\b/i.test(title);
}

export function buildPriceChartingCatalogLink({
  title,
  fallbackTitle,
  shelfName,
  barcode,
  aliases,
}: CatalogExternalLinkContext) {
  const cleanTitle = pickPriceChartingTitle({ title, fallbackTitle, aliases });
  const titleSlug = slugify(cleanTitle);
  const searchUrl = `https://www.pricecharting.com/fr/search-products?type=videogames&q=${encodeURIComponent(cleanTitle || cleanCode(barcode))}`;

  if (!titleSlug || !shelfName || shouldUsePriceChartingSearchUrl(cleanTitle)) {
    return { url: searchUrl, isDirect: false };
  }

  const platformKey = detectPlatformKey(shelfName);
  const platform = getPriceChartingPlatformSlugs(platformKey);
  if (!platform) {
    return { url: searchUrl, isDirect: false };
  }

  const isPal = looksPal({ barcode, shelfName, title: cleanTitle, aliases });
  const platformSlug = isPal && platform.pal ? platform.pal : platform.default;

  return {
    url: `https://www.pricecharting.com/game/${platformSlug}/${titleSlug}`,
    isDirect: true,
  };
}
