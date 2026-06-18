import axios from "axios";
import levenshtein from "fast-levenshtein";
import { detectPlatformKey } from "@/lib/barcodeQuery";
import { slugify } from "@/lib/slugs";

export interface PriceChartingPrices {
  priceUsed?: number; // "Loose" price in cents
  priceUsedCIB?: number; // "CIB" (Complete in Box) price in cents
  priceNew?: number; // "New" price in cents
}

export interface PriceChartingMetadata {
  title: string;
  platform?: string;
  coverUrl?: string;
  ageRating?: string;
}

const CLASSICS_KEYWORDS = [
  "classics",
  "platinum",
  "essential",
  "players choice",
  "player's choice",
  "greatest hits",
  "nintendo selects",
  "best of",
];

const PLATFORM_SLUGS: Record<string, { pal?: string; default: string }> = {
  xbox: { pal: "pal-xbox", default: "xbox" },
  xbox360: { pal: "pal-xbox-360", default: "xbox-360" },
  ps1: { pal: "pal-playstation", default: "playstation" },
  ps2: { pal: "pal-playstation-2", default: "playstation-2" },
  ps3: { pal: "pal-playstation-3", default: "playstation-3" },
  gamecube: { pal: "pal-gamecube", default: "gamecube" },
  wii: { pal: "pal-wii", default: "wii" },
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
    .replace(/\b(ps1|ps2|ps3|ps4|ps5|playstation\s*\d?|xbox\s*(360)?|wii)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  const withoutArticles = cleanedTitle
    .replace(/\b(the|a|an)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  return Array.from(
    new Set([cleanedTitle, withoutArticles].map((value) => slugify(value)).filter(Boolean)),
  );
}

function getPlatformSlug(platform?: string, isPal?: boolean): string | null {
  if (!platform) return null;
  const platformKey = detectPlatformKey(platform);
  const slugs = platformKey ? PLATFORM_SLUGS[platformKey] : null;
  if (!slugs) return null;
  return isPal && slugs.pal ? slugs.pal : slugs.default;
}

function buildDirectDetailUrls(
  title: string,
  fallbackPlatform?: string,
  isPal?: boolean,
): string[] {
  const platformSlug = getPlatformSlug(fallbackPlatform, isPal);
  if (!platformSlug) return [];
  return buildTitleSlugCandidates(title).map(
    (titleSlug) => `https://www.pricecharting.com/game/${platformSlug}/${titleSlug}`,
  );
}

function isSearchUrl(url: string): boolean {
  return url.includes("/search-products");
}

function isDetailUrlForPlatform(url: string, fallbackPlatform?: string): boolean {
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
    normalizedFallback.split(/\s+/).length <= normalizedTitle.split(/\s+/).length + 2
  ) {
    return cleanFallback;
  }

  return title;
}

function parseSearchRows(
  html: string,
): { id: string; title: string; platform: string }[] {
  const rows: { id: string; title: string; platform: string }[] = [];
  const rowRegex = /<tr class=\"offer\" id=\"product-(\d+)\">([\s\S]*?)<\/tr>/gi;
  let rMatch;
  while ((rMatch = rowRegex.exec(html)) !== null) {
    const id = rMatch[1];
    const content = rMatch[2];
    const titleMatch = content.match(
      /class=\"product_name\">[\s\S]*?<a[^>]*>\s*([\s\S]*?)\s*<\/a>/i,
    );
    const platformMatch = content.match(/<br>\s*([\s\S]*?)\s*<\/h2>/i);
    if (titleMatch) {
      rows.push({
        id,
        title: titleMatch[1].replace(/\s+/g, " ").trim(),
        platform: platformMatch
          ? platformMatch[1].replace(/\s+/g, " ").trim()
          : "",
      });
    }
  }
  return rows;
}

function pickBestRow(
  rows: { id: string; title: string; platform: string }[],
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
      CLASSICS_KEYWORDS.some((kw) => row.title.toLowerCase().includes(kw)),
    );
    if (classicsRows.length > 0) matchingRows = classicsRows;
  } else {
    const standardRows = matchingRows.filter(
      (row) =>
        !CLASSICS_KEYWORDS.some((kw) => row.title.toLowerCase().includes(kw)),
    );
    if (standardRows.length > 0) matchingRows = standardRows;
  }

  const best = matchingRows.reduce((currentBest, row) => {
    const score = titleSimilarityScore(fallbackName, row.title);
    const bestScore = titleSimilarityScore(fallbackName, currentBest.title);
    return score > bestScore ? row : currentBest;
  }, matchingRows[0]);

  return titleSimilarityScore(fallbackName, best.title) >= 0.62 ? best : null;
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

      const gameUrl = `https://www.pricecharting.com/game/${bestRow.id}`;
      const detailRes = await axios.get(gameUrl, { headers });
      return detailRes.data;
    }

    return html;
  }

  return null;
}

export async function fetchPricesFromPriceCharting(
  barcode: string,
  fallbackName?: string | string[],
  fallbackPlatform?: string,
  isPal?: boolean,
  isClassics?: boolean,
): Promise<PriceChartingPrices | null> {
  const cleanedBarcode = barcode.replace(/[^\d]/g, "").trim();
  if (!cleanedBarcode) return null;

  const searchUrl = `https://www.pricecharting.com/search-products?q=${cleanedBarcode}`;

  const headers = {
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
  };

  try {
    console.log(`[PriceCharting Prices] Querying barcode: ${cleanedBarcode}`);
    const res = await axios.get(searchUrl, { headers, maxRedirects: 5 });

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
          headers,
          fallbackPlatform,
          isPal,
          isClassics,
        );
        if (!fallbackHtml) return null;
        html = fallbackHtml;
      } else {
        return null;
      }
    }

    // Extract exchange rates
    let eurRate = 1.0;
    const forexMatch = html.match(/VGPC\.forex_rates\s*=\s*({[^}]+})/);
    if (forexMatch) {
      try {
        const rates = JSON.parse(forexMatch[1]);
        if (typeof rates.EUR === "number") {
          eurRate = rates.EUR;
        }
      } catch (e: any) {
        console.warn(
          `[PriceCharting Prices] Failed to parse forex rates:`,
          e.message,
        );
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
          const priceEUR = priceUSD * eurRate;
          return Math.round(priceEUR * 100);
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

  const headers = {
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
  };

  try {
    console.log(`[PriceCharting Metadata] Querying barcode: ${cleanedBarcode}`);
    const res = await axios.get(searchUrl, { headers, maxRedirects: 5 });

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
          headers,
          fallbackPlatform,
          isPal,
          isClassics,
        );
        if (!fallbackHtml) return null;
        html = fallbackHtml;
      } else {
        return null;
      }
    }

    // Parse Title & Platform from H1
    const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    if (!h1Match) return null;

    const h1Content = h1Match[1];
    const titleMatch = h1Content.match(/^([\s\S]*?)(?:<a|<span|$)/i);
    const rawTitle = titleMatch ? titleMatch[1].replace(/\s+/g, " ").trim() : "";
    const title = preferSpecificFallbackTitle(rawTitle, fallbackName);

    const platformMatch = h1Content.match(/<a[^>]*>([\s\S]*?)<\/a>/i);
    const platform = platformMatch
      ? platformMatch[1].replace(/\s+/g, " ").trim()
      : undefined;

    // Parse Cover Image
    const coverDivMatch = html.match(
      /<div[^>]*class="cover"[^>]*>([\s\S]*?)<\/div>/i,
    );
    let coverUrl: string | undefined;
    if (coverDivMatch) {
      const imgMatch =
        coverDivMatch[1].match(/src=\'([^\']*)\'/i) ||
        coverDivMatch[1].match(/src=\"([^\"]*)\"/i);
      if (imgMatch) {
        coverUrl = imgMatch[1];
      }
    }

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

    return { title, platform, coverUrl, ageRating };
  } catch (error: any) {
    console.error(
      `[PriceCharting Metadata] Error fetching barcode ${cleanedBarcode}:`,
      error.message,
    );
    return null;
  }
}
