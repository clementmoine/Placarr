import axios from "axios";
import levenshtein from "fast-levenshtein";
import { normalizeProductBarcode } from "@/lib/barcode/normalize";
import type {
  PriceChartingMetadata,
  PriceChartingPrices,
} from "@/lib/barcode/lookup/providerTypes";
import { parsePriceChartingBarcode } from "@/lib/barcode/lookup/priceChartingParse";
import { detectPlatformKey } from "@/lib/barcode/query";
import { containsGameClassicsKeyword } from "@/lib/barcode/listingTerms";
import { getPriceChartingPlatformSlugs } from "@/lib/games/platforms";
import { franchiseSequelNumbersConflict } from "@/lib/metadata/titleMatching";
import { slugify } from "@/lib/routing/slugs";
import { pickPriceChartingPrimaryCoverUrl, priceChartingGalleryLabelIsRecognized } from "./imageLabels";

export type {
  PriceChartingMetadata,
  PriceChartingPrices,
} from "@/lib/barcode/lookup/providerTypes";
export { parsePriceChartingBarcode } from "@/lib/barcode/lookup/priceChartingParse";

const PRICECHARTING_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
  "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
};

const TITLE_STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "de",
  "des",
  "du",
  "la",
  "le",
  "les",
  "of",
  "the",
  "un",
  "une",
]);

export function decodePriceChartingHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, code) =>
      String.fromCharCode(Number.parseInt(code, 10)),
    )
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) =>
      String.fromCharCode(Number.parseInt(hex, 16)),
    );
}

function normalizeTitleForComparison(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function titleTokens(value: string): string[] {
  return normalizeTitleForComparison(value)
    .split(/\s+/)
    .filter((token) => token && !TITLE_STOP_WORDS.has(token));
}

function titleSimilarityScore(a: string, b: string): number {
  const normA = titleTokens(a).join(" ");
  const normB = titleTokens(b).join(" ");
  if (!normA || !normB) return 0;
  if (normA === normB) return 1;
  if (normA.includes(normB) || normB.includes(normA)) return 0.9;

  const aTokens = new Set(normA.split(/\s+/));
  const bTokens = new Set(normB.split(/\s+/));
  const shared = [...aTokens].filter((token) => bTokens.has(token)).length;
  const tokenScore = shared / Math.max(aTokens.size, bTokens.size);
  const distanceScore =
    1 - levenshtein.get(normA, normB) / Math.max(normA.length, normB.length);

  return Math.max(tokenScore, distanceScore);
}

function buildTitleSlugCandidates(title: string): string[] {
  const cleanedTitle = title
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .replace(
      /\b(ps1|ps2|ps3|ps4|ps5|playstation\s*\d?|xbox\s*(360)?|wii)\b/gi,
      " ",
    )
    .replace(/\s+/g, " ")
    .trim();

  const withoutArticles = cleanedTitle
    .replace(/\b(the|a|an)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  const withoutSequelBeforeEdition = cleanedTitle
    .replace(/\bedition\b/gi, " ")
    .replace(
      /\b\d{1,2}\s*[-–—]?\s*(?=game of the year|goty)\b/gi,
      " ",
    )
    .replace(/\s+/g, " ")
    .trim();

  return Array.from(
    new Set(
      [cleanedTitle, withoutArticles, withoutSequelBeforeEdition]
        .map((value) => slugify(value))
        .filter(Boolean),
    ),
  );
}

function getPlatformSlug(platform?: string, isPal?: boolean): string | null {
  if (!platform) return null;
  const platformKey = detectPlatformKey(platform);
  const slugs = getPriceChartingPlatformSlugs(platformKey);
  if (!slugs) return null;
  return isPal && slugs.pal ? slugs.pal : slugs.default;
}

export function priceChartingPlatformMatchesTarget(
  parsedPlatform: string | undefined,
  fallbackPlatform?: string,
): boolean {
  if (!fallbackPlatform) return true;
  const targetKey = detectPlatformKey(fallbackPlatform);
  if (!targetKey) return true;
  const parsedKey = detectPlatformKey(parsedPlatform || "");
  if (!parsedKey) return true;
  return parsedKey === targetKey;
}

function rejectMismatchedPriceChartingMetadata(
  metadata: PriceChartingMetadata | null,
  fallbackName?: string,
  fallbackPlatform?: string,
): PriceChartingMetadata | null {
  if (!metadata) return null;
  if (
    !priceChartingPlatformMatchesTarget(metadata.platform, fallbackPlatform)
  ) {
    return null;
  }
  if (
    fallbackName &&
    franchiseSequelNumbersConflict([fallbackName], metadata.title || "")
  ) {
    return null;
  }
  return metadata;
}

function priceChartingEditionKeywordBonus(
  requestedName: string,
  catalogTitle: string,
): number {
  const request = requestedName.toLowerCase();
  const catalog = catalogTitle.toLowerCase();
  let bonus = 0;
  if (
    /\bgame of the year\b|\bgoty\b/.test(request) &&
    /\bgame of the year\b|\bgoty\b/.test(catalog)
  ) {
    bonus += 0.15;
  }
  return bonus;
}

function buildDirectDetailUrls(
  title: string,
  fallbackPlatform?: string,
  isPal?: boolean,
): string[] {
  const platformSlug = getPlatformSlug(fallbackPlatform, isPal);
  if (!platformSlug) return [];
  return buildTitleSlugCandidates(title).map(
    (titleSlug) =>
      `https://www.pricecharting.com/game/${platformSlug}/${titleSlug}`,
  );
}

function isSearchUrl(url: string): boolean {
  return url.includes("/search-products");
}

function isDetailUrlForPlatform(
  url: string,
  fallbackPlatform?: string,
): boolean {
  if (!url.includes("/game/")) return false;
  const platformSlug = getPlatformSlug(fallbackPlatform, url.includes("/pal-"));
  return !platformSlug || url.includes(`/game/${platformSlug}/`);
}

function preferSpecificFallbackTitle(
  title: string,
  fallbackName?: string,
): string {
  if (!fallbackName) return title;

  const cleanFallback = fallbackName
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const normalizedTitle = normalizeTitleForComparison(title);
  const normalizedFallback = normalizeTitleForComparison(cleanFallback);

  if (
    cleanFallback &&
    detectPlatformKey(cleanFallback) &&
    !detectPlatformKey(title) &&
    normalizedFallback.startsWith(normalizedTitle) &&
    normalizedFallback.split(/\s+/).length <=
      normalizedTitle.split(/\s+/).length + 2
  ) {
    return cleanFallback;
  }

  return title;
}

function parseSearchRows(
  html: string,
): { id: string; gamePath: string; title: string; platform: string }[] {
  const rows: { id: string; gamePath: string; title: string; platform: string }[] =
    [];
  const rowRegex =
    /<tr class=\"offer\" id=\"product-(\d+)\">([\s\S]*?)<\/tr>/gi;
  let rMatch;
  while ((rMatch = rowRegex.exec(html)) !== null) {
    const id = rMatch[1];
    const content = rMatch[2];
    const titleMatch = content.match(
      /class=\"product_name\">[\s\S]*?<a[^>]*href=\"([^\"]+)\"[^>]*>\s*([\s\S]*?)\s*<\/a>/i,
    );
    const legacyTitleMatch = titleMatch
      ? null
      : content.match(
          /class=\"product_name\">[\s\S]*?<a[^>]*>\s*([\s\S]*?)\s*<\/a>/i,
        );
    const platformMatch = content.match(/<br>\s*([\s\S]*?)\s*<\/h2>/i);
    const title = (titleMatch?.[2] ?? legacyTitleMatch?.[1])
      ?.replace(/\s+/g, " ")
      .trim();
    if (title) {
      const href = titleMatch?.[1]?.trim();
      rows.push({
        id,
        gamePath: href || `/game/${id}`,
        title,
        platform: platformMatch
          ? platformMatch[1].replace(/\s+/g, " ").trim()
          : "",
      });
    }
  }
  return rows;
}

function priceChartingGameUrl(gamePath: string): string {
  if (/^https?:\/\//i.test(gamePath)) return gamePath;
  return `https://www.pricecharting.com${gamePath.startsWith("/") ? gamePath : `/${gamePath}`}`;
}

function pickBestRow(
  rows: { id: string; gamePath: string; title: string; platform: string }[],
  fallbackName: string,
  fallbackPlatform?: string,
  isPal?: boolean,
  isClassics?: boolean,
) {
  if (rows.length === 0) return null;

  const targetPlatformKey = fallbackPlatform
    ? detectPlatformKey(fallbackPlatform)
    : null;
  let matchingRows = rows;

  if (targetPlatformKey) {
    const platformRows = rows.filter(
      (row) => detectPlatformKey(row.platform) === targetPlatformKey,
    );
    if (platformRows.length === 0) return null;
    matchingRows = platformRows;
  }

  if (isPal) {
    const palRows = matchingRows.filter(
      (row) =>
        row.title.toLowerCase().includes("pal") ||
        row.platform.toLowerCase().includes("pal"),
    );
    if (palRows.length > 0) matchingRows = palRows;
  } else {
    const ntscRows = matchingRows.filter(
      (row) =>
        !row.title.toLowerCase().includes("pal") &&
        !row.platform.toLowerCase().includes("pal") &&
        !row.title.toLowerCase().includes("jp") &&
        !row.platform.toLowerCase().includes("jp"),
    );
    if (ntscRows.length > 0) matchingRows = ntscRows;
  }

  if (isClassics) {
    const classicsRows = matchingRows.filter((row) =>
      containsGameClassicsKeyword(row.title),
    );
    if (classicsRows.length > 0) matchingRows = classicsRows;
  } else {
    const standardRows = matchingRows.filter(
      (row) => !containsGameClassicsKeyword(row.title),
    );
    if (standardRows.length > 0) matchingRows = standardRows;
  }

  const alignedRows = matchingRows.filter(
    (row) => !franchiseSequelNumbersConflict([fallbackName], row.title),
  );
  if (alignedRows.length > 0) matchingRows = alignedRows;

  const best = matchingRows.reduce((currentBest, row) => {
    const score =
      titleSimilarityScore(fallbackName, row.title) +
      priceChartingEditionKeywordBonus(fallbackName, row.title);
    const bestScore =
      titleSimilarityScore(fallbackName, currentBest.title) +
      priceChartingEditionKeywordBonus(fallbackName, currentBest.title);
    return score > bestScore ? row : currentBest;
  }, matchingRows[0]);

  return titleSimilarityScore(fallbackName, best.title) >= 0.62 ? best : null;
}

/** Barcode search hit a results page with no title hint — pick one NTSC/PAL row. */
function pickBarcodeSearchRow(
  rows: { id: string; gamePath: string; title: string; platform: string }[],
  options?: { fallbackPlatform?: string; isPal?: boolean },
): { id: string; gamePath: string; title: string; platform: string } | null {
  if (rows.length === 0) return null;

  let matching = rows;
  const targetPlatformKey = options?.fallbackPlatform
    ? detectPlatformKey(options.fallbackPlatform)
    : null;
  if (targetPlatformKey) {
    const platformRows = matching.filter(
      (row) => detectPlatformKey(row.platform) === targetPlatformKey,
    );
    if (platformRows.length > 0) matching = platformRows;
  }

  if (options?.isPal) {
    const palRows = matching.filter(
      (row) =>
        row.title.toLowerCase().includes("pal") ||
        row.platform.toLowerCase().includes("pal"),
    );
    if (palRows.length > 0) matching = palRows;
  } else {
    const ntscRows = matching.filter(
      (row) =>
        !row.title.toLowerCase().includes("pal") &&
        !row.platform.toLowerCase().includes("pal") &&
        !row.title.toLowerCase().includes("jp") &&
        !row.platform.toLowerCase().includes("jp"),
    );
    if (ntscRows.length > 0) matching = ntscRows;
  }

  const standardRows = matching.filter(
    (row) => !containsGameClassicsKeyword(row.title),
  );
  if (standardRows.length > 0) matching = standardRows;

  return matching[0] ?? null;
}

async function fetchDetailHtmlFromBarcodeSearchResults(
  searchHtml: string,
  headers: Record<string, string>,
  fallbackPlatform?: string,
  isPal?: boolean,
): Promise<string | null> {
  const bestRow = pickBarcodeSearchRow(parseSearchRows(searchHtml), {
    fallbackPlatform,
    isPal,
  });
  if (!bestRow) return null;

  const gameUrl = priceChartingGameUrl(bestRow.gamePath);
  const detailRes = await axios.get(gameUrl, { headers, maxRedirects: 5 });
  const detailFinalUrl = detailRes.request.res.responseUrl || gameUrl;
  if (
    !isAcceptedPriceChartingDetailHtml(
      detailRes.data,
      detailFinalUrl,
      bestRow.title,
      fallbackPlatform,
    )
  ) {
    return null;
  }
  return detailRes.data;
}

async function fetchDirectDetailHtmlFromNameFallback(
  fallbackNames: string[],
  headers: Record<string, string>,
  fallbackPlatform?: string,
  isPal?: boolean,
): Promise<string | null> {
  const seen = new Set<string>();
  for (const fallbackName of fallbackNames) {
    for (const directUrl of buildDirectDetailUrls(
      fallbackName,
      fallbackPlatform,
      isPal,
    )) {
      if (seen.has(directUrl)) continue;
      seen.add(directUrl);

      try {
        const detailRes = await axios.get(directUrl, {
          headers,
          maxRedirects: 5,
        });
        const finalUrl = detailRes.request.res.responseUrl || directUrl;
        if (
          !isSearchUrl(finalUrl) &&
          isDetailUrlForPlatform(finalUrl, fallbackPlatform)
        ) {
          return detailRes.data;
        }
      } catch (error) {
        if (!axios.isAxiosError(error) || error.response?.status !== 404) {
          console.warn(
            `[PriceCharting] Direct detail lookup failed for ${directUrl}:`,
            error instanceof Error ? error.message : error,
          );
        }
      }
    }
  }

  return null;
}

function isAcceptedPriceChartingDetailHtml(
  html: string,
  finalUrl: string,
  fallbackName: string | undefined,
  fallbackPlatform?: string,
): boolean {
  if (!fallbackPlatform) return true;

  const parsed = parsePriceChartingDetailHtml(html, fallbackName);
  if (parsed?.title && fallbackName) {
    if (franchiseSequelNumbersConflict([fallbackName], parsed.title)) {
      return false;
    }
  }
  if (parsed?.platform) {
    return priceChartingPlatformMatchesTarget(
      parsed.platform,
      fallbackPlatform,
    );
  }

  if (
    finalUrl.includes("/game/") &&
    !isDetailUrlForPlatform(finalUrl, fallbackPlatform)
  ) {
    return false;
  }

  return true;
}

async function fetchDetailHtmlFromNameFallback(
  fallbackNames: string[],
  headers: Record<string, string>,
  fallbackPlatform?: string,
  isPal?: boolean,
  isClassics?: boolean,
): Promise<string | null> {
  const directHtml = await fetchDirectDetailHtmlFromNameFallback(
    fallbackNames,
    headers,
    fallbackPlatform,
    isPal,
  );
  if (directHtml) return directHtml;

  const seen = new Set<string>();
  for (const fallbackName of fallbackNames) {
    const normalized = fallbackName.toLowerCase().trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);

    const nameSearchUrl = `https://www.pricecharting.com/search-products?q=${encodeURIComponent(fallbackName)}`;
    const nameRes = await axios.get(nameSearchUrl, {
      headers,
      maxRedirects: 5,
    });
    const html = nameRes.data;
    const nameFinalUrl = nameRes.request.res.responseUrl || "";

    if (
      nameFinalUrl.includes("/search-products") ||
      html.includes("Buy & Sell Search Results")
    ) {
      const bestRow = pickBestRow(
        parseSearchRows(html),
        fallbackName,
        fallbackPlatform,
        isPal,
        isClassics,
      );
      if (!bestRow) continue;

      const gameUrl = priceChartingGameUrl(bestRow.gamePath);
      const detailRes = await axios.get(gameUrl, { headers });
      const detailFinalUrl = detailRes.request.res.responseUrl || gameUrl;
      if (
        !isAcceptedPriceChartingDetailHtml(
          detailRes.data,
          detailFinalUrl,
          fallbackName,
          fallbackPlatform,
        )
      ) {
        continue;
      }
      return detailRes.data;
    }

    if (
      !isAcceptedPriceChartingDetailHtml(
        html,
        nameFinalUrl,
        fallbackName,
        fallbackPlatform,
      )
    ) {
      continue;
    }

    return html;
  }

  return null;
}

const PRICECHARTING_IMAGE_SIZE_SUFFIX = /\/(\d+)\.(jpe?g|png|webp)$/i;

/** Upgrade PriceCharting CDN thumbnails (240px, etc.) to the max served size. */
export function upgradePriceChartingImageUrl(url: string): string {
  if (!url) return url;
  if (url.includes("images.pricecharting.com")) {
    return url.replace(PRICECHARTING_IMAGE_SIZE_SUFFIX, "/1600.$2");
  }
  if (url.includes("cdn.pji.nu") || url.includes("prisjakt.nu")) {
    return url.replace(/\.(jpe?g|png|webp|gif|svg)\?.*$/i, ".$1");
  }
  return url;
}

/** Parse full-resolution product photos from the #images gallery section. */
export function parsePriceChartingGalleryImages(
  html: string,
): Array<{ url: string; label?: string }> {
  const section = html.match(
    /<div id="extra-images">([\s\S]*?)<div id="full-prices">/i,
  )?.[1];
  if (!section) return [];

  const images: Array<{ url: string; label?: string }> = [];
  const seen = new Set<string>();
  const extraRegex = /<div class="extra">([\s\S]*?)<\/div>\s*<p>([^<]*)<\/p>/gi;

  for (const match of section.matchAll(extraRegex)) {
    const block = match[1];
    const label = match[2]?.replace(/\s+/g, " ").trim();
    const hrefMatch = block.match(
      /href="(https:\/\/storage\.googleapis\.com\/images\.pricecharting\.com\/[^"]+)"/i,
    );
    if (!hrefMatch) continue;
    const url = upgradePriceChartingImageUrl(hrefMatch[1]);
    if (seen.has(url)) continue;
    seen.add(url);
    images.push({ url, label: label || undefined });
  }

  return images;
}

function parsePriceChartingCoverUrl(html: string): string | undefined {
  const gallery = parsePriceChartingGalleryImages(html);
  const primary = pickPriceChartingPrimaryCoverUrl(gallery);
  if (primary) return primary;

  const dialogMatch = html.match(
    /<div id="js-dialog-large-image"[^>]*>[\s\S]*?<img[^>]+src=['"]([^'"]+)['"]/i,
  );
  if (dialogMatch?.[1]) {
    return upgradePriceChartingImageUrl(dialogMatch[1]);
  }

  const coverDivMatch = html.match(
    /<div[^>]*class="cover"[^>]*>([\s\S]*?)<\/div>/i,
  );
  if (!coverDivMatch) return undefined;

  const imgMatch =
    coverDivMatch[1].match(/src='([^']*)'/i) ||
    coverDivMatch[1].match(/src="([^"]*)"/i);
  if (!imgMatch?.[1]) return undefined;
  return upgradePriceChartingImageUrl(imgMatch[1]);
}

export function parsePriceChartingDetailHtml(
  html: string,
  fallbackName?: string,
): PriceChartingMetadata | null {
  const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (!h1Match) return null;

  const h1Content = h1Match[1];
  const titleMatch = h1Content.match(/^([\s\S]*?)(?:<a|<span|$)/i);
  const rawTitle = titleMatch ? titleMatch[1].replace(/\s+/g, " ").trim() : "";
  const title = decodePriceChartingHtmlEntities(
    preferSpecificFallbackTitle(rawTitle, fallbackName),
  );

  const platformMatch = h1Content.match(/<a[^>]*>([\s\S]*?)<\/a>/i);
  const platform = platformMatch
    ? platformMatch[1].replace(/\s+/g, " ").trim()
    : undefined;

  const images = parsePriceChartingGalleryImages(html).filter((image) =>
    priceChartingGalleryLabelIsRecognized(image.label),
  );
  const coverUrl = parsePriceChartingCoverUrl(html);

  const ageRatingMatch = html.match(
    /\b(PEGI|ESRB|USK|CERO)\b[^<\n\r]{0,40}?(?:\b(\d{1,2})\+?\b|\b(E|E10\+|T|M|AO|RP)\b|\b([A-DZ])\b)/i,
  );
  const ageRating = ageRatingMatch
    ? [
        ageRatingMatch[1]?.toUpperCase(),
        ageRatingMatch[2] || ageRatingMatch[3] || ageRatingMatch[4],
      ]
        .filter(Boolean)
        .join(" ")
    : undefined;

  const barcode = parsePriceChartingBarcode(html);

  return {
    title,
    platform,
    coverUrl,
    ...(images.length > 0 ? { images } : {}),
    ageRating,
    ...(barcode ? { barcode } : {}),
  };
}

/**
 * Parse loose / CIB / new prices from an already-fetched PriceCharting detail
 * page. Shared by the price fetch and the metadata fetch so a single HTML
 * request serves both identification and pricing.
 */
export function parsePriceChartingPricesFromHtml(
  html: string,
): PriceChartingPrices | null {
  let eurRate = 1.0;
  const forexMatch = html.match(/VGPC\.forex_rates\s*=\s*({[^}]+})/);
  if (forexMatch) {
    try {
      const rates = JSON.parse(forexMatch[1]);
      if (typeof rates.EUR === "number") {
        eurRate = rates.EUR;
      }
    } catch (e) {
      console.warn(`[PriceCharting Prices] Failed to parse forex rates:`, e);
    }
  }

  const parsePrice = (id: string): number | undefined => {
    const regex = new RegExp(
      `id="${id}"[^>]*>[\\s\\S]*?class="price js-price"[^>]*>([\\s\\S]*?)<\/span>`,
      "i",
    );
    const match = html.match(regex);
    if (match) {
      const priceStr = match[1].replace(/[^0-9.]/g, "").trim();
      const priceUSD = parseFloat(priceStr);
      if (!isNaN(priceUSD)) {
        return Math.round(priceUSD * eurRate * 100);
      }
    }
    return undefined;
  };

  const result: PriceChartingPrices = {};
  const used = parsePrice("used_price");
  const cib = parsePrice("complete_price");
  const priceNew = parsePrice("new_price");

  if (used !== undefined) result.priceUsed = used;
  if (cib !== undefined) result.priceUsedCIB = cib;
  if (priceNew !== undefined) result.priceNew = priceNew;

  return Object.keys(result).length > 0 ? result : null;
}

export async function fetchMetadataFromPriceChartingByName(
  name: string,
  fallbackPlatform?: string,
  isPal?: boolean,
  isClassics?: boolean,
): Promise<PriceChartingMetadata | null> {
  const cleanedName = name.replace(/\s+/g, " ").trim();
  if (!cleanedName) return null;

  try {
    const html = await fetchDetailHtmlFromNameFallback(
      [cleanedName],
      PRICECHARTING_HEADERS,
      fallbackPlatform,
      isPal,
      isClassics,
    );
    if (!html) return null;
    return rejectMismatchedPriceChartingMetadata(
      parsePriceChartingDetailHtml(html, cleanedName),
      cleanedName,
      fallbackPlatform,
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(
      `[PriceCharting Metadata] Error fetching by name "${cleanedName}":`,
      message,
    );
    return null;
  }
}

export async function fetchPricesFromPriceCharting(
  barcode: string,
  fallbackName?: string | string[],
  fallbackPlatform?: string,
  isPal?: boolean,
  isClassics?: boolean,
): Promise<PriceChartingPrices | null> {
  const cleanedBarcode = barcode.replace(/[^\d]/g, "").trim();
  const fallbackNames = Array.isArray(fallbackName)
    ? fallbackName.filter(Boolean)
    : fallbackName
      ? [fallbackName]
      : [];

  if (!cleanedBarcode) {
    if (fallbackNames.length === 0) return null;
    try {
      console.log(
        `[PriceCharting Prices] Querying by name: ${fallbackNames.join(" | ")}`,
      );
      const fallbackHtml = await fetchDetailHtmlFromNameFallback(
        fallbackNames,
        PRICECHARTING_HEADERS,
        fallbackPlatform,
        isPal,
        isClassics,
      );
      if (!fallbackHtml) return null;
      const priceFallbackName = fallbackNames[0];
      if (
        fallbackPlatform &&
        !isAcceptedPriceChartingDetailHtml(
          fallbackHtml,
          "",
          priceFallbackName,
          fallbackPlatform,
        )
      ) {
        return null;
      }
      return parsePriceChartingPricesFromHtml(fallbackHtml);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(
        `[PriceCharting Prices] Error fetching by name "${fallbackNames[0]}":`,
        message,
      );
      return null;
    }
  }

  const searchUrl = `https://www.pricecharting.com/search-products?q=${cleanedBarcode}`;

  try {
    console.log(`[PriceCharting Prices] Querying barcode: ${cleanedBarcode}`);
    const res = await axios.get(searchUrl, {
      headers: PRICECHARTING_HEADERS,
      maxRedirects: 5,
    });

    let html = res.data;
    const finalUrl = res.request.res.responseUrl || "";

    if (
      finalUrl.includes("/search-products") ||
      html.includes("Buy & Sell Search Results")
    ) {
      const fallbackNames = Array.isArray(fallbackName)
        ? fallbackName
        : fallbackName
          ? [fallbackName]
          : [];

      if (fallbackNames.length > 0) {
        console.log(
          `[PriceCharting Prices] Barcode ${cleanedBarcode} returned ambiguous results, trying ${fallbackNames.length} name fallback(s)`,
        );
        const fallbackHtml = await fetchDetailHtmlFromNameFallback(
          fallbackNames,
          PRICECHARTING_HEADERS,
          fallbackPlatform,
          isPal,
          isClassics,
        );
        if (!fallbackHtml) return null;
        html = fallbackHtml;
      } else {
        return null;
      }
    } else if (
      fallbackPlatform &&
      !isAcceptedPriceChartingDetailHtml(
        html,
        finalUrl,
        Array.isArray(fallbackName) ? fallbackName[0] : fallbackName,
        fallbackPlatform,
      )
    ) {
      const fallbackNames = Array.isArray(fallbackName)
        ? fallbackName
        : fallbackName
          ? [fallbackName]
          : [];
      if (fallbackNames.length === 0) return null;
      console.log(
        `[PriceCharting Prices] Barcode ${cleanedBarcode} resolved to a different platform, trying name fallback(s)`,
      );
      const fallbackHtml = await fetchDetailHtmlFromNameFallback(
        fallbackNames,
        PRICECHARTING_HEADERS,
        fallbackPlatform,
        isPal,
        isClassics,
      );
      if (!fallbackHtml) return null;
      html = fallbackHtml;
    }

    const priceFallbackName = Array.isArray(fallbackName)
      ? fallbackName[0]
      : fallbackName;
    if (
      fallbackPlatform &&
      !isAcceptedPriceChartingDetailHtml(
        html,
        finalUrl,
        priceFallbackName,
        fallbackPlatform,
      )
    ) {
      return null;
    }

    return parsePriceChartingPricesFromHtml(html);
  } catch (error: any) {
    console.error(
      `[PriceCharting Prices] Error fetching for barcode ${cleanedBarcode}:`,
      error.message,
    );
    return null;
  }
}

export async function fetchMetadataFromPriceCharting(
  barcode: string,
  fallbackName?: string,
  fallbackPlatform?: string,
  isPal?: boolean,
  isClassics?: boolean,
): Promise<PriceChartingMetadata | null> {
  const cleanedBarcode = barcode.replace(/[^\d]/g, "").trim();
  if (!cleanedBarcode) return null;

  const searchUrl = `https://www.pricecharting.com/search-products?q=${cleanedBarcode}`;

  try {
    console.log(`[PriceCharting Metadata] Querying barcode: ${cleanedBarcode}`);
    const res = await axios.get(searchUrl, {
      headers: PRICECHARTING_HEADERS,
      maxRedirects: 5,
    });

    let html = res.data;
    const finalUrl = res.request.res.responseUrl || "";

    if (
      finalUrl.includes("/search-products") ||
      html.includes("Buy & Sell Search Results")
    ) {
      if (fallbackName) {
        console.log(
          `[PriceCharting Metadata] Barcode ${cleanedBarcode} returned ambiguous results, searching by name fallback: ${fallbackName}`,
        );
        const fallbackHtml = await fetchDetailHtmlFromNameFallback(
          [fallbackName],
          PRICECHARTING_HEADERS,
          fallbackPlatform,
          isPal,
          isClassics,
        );
        if (!fallbackHtml) return null;
        html = fallbackHtml;
      } else {
        const detailHtml = await fetchDetailHtmlFromBarcodeSearchResults(
          html,
          PRICECHARTING_HEADERS,
          fallbackPlatform,
          isPal,
        );
        if (!detailHtml) return null;
        html = detailHtml;
      }
    } else if (
      fallbackPlatform &&
      !isAcceptedPriceChartingDetailHtml(
        html,
        finalUrl,
        fallbackName,
        fallbackPlatform,
      )
    ) {
      if (!fallbackName) return null;
      console.log(
        `[PriceCharting Metadata] Barcode ${cleanedBarcode} resolved to a different platform, searching by name fallback: ${fallbackName}`,
      );
      const fallbackHtml = await fetchDetailHtmlFromNameFallback(
        [fallbackName],
        PRICECHARTING_HEADERS,
        fallbackPlatform,
        isPal,
        isClassics,
      );
      if (!fallbackHtml) return null;
      html = fallbackHtml;
    }

    const parsed = rejectMismatchedPriceChartingMetadata(
      parsePriceChartingDetailHtml(html, fallbackName),
      fallbackName,
      fallbackPlatform,
    );
    if (!parsed) return null;

    const prices = parsePriceChartingPricesFromHtml(html);

    return {
      ...parsed,
      barcode: parsed.barcode || cleanedBarcode,
      ...(prices ? { prices } : {}),
    };
  } catch (error: any) {
    console.error(
      `[PriceCharting Metadata] Error fetching barcode ${cleanedBarcode}:`,
      error.message,
    );
    return null;
  }
}
