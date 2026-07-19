import axios from "axios";
import levenshtein from "fast-levenshtein";

import { fetchGetWithFlareFallback } from "@/lib/http/scrapeFetch";
import type {
  PriceChartingMetadata,
  PriceChartingPrices,
} from "@/core/identify/lookup/providerTypes";
import { parsePriceChartingBarcode } from "@/core/identify/lookup/priceChartingParse";
import { detectPlatformKey } from "@/core/identify/query";
import { containsGameClassicsKeyword } from "@/core/identify/listingTerms";
import {
  getPriceChartingPlatformSlugs,
  priceChartingNeoGeoVariantMatchesShelf,
  resolvePriceChartingPlatformSlug,
} from "./platformSlugs";
import { franchiseSequelNumbersConflict } from "@/core/enrich/titleMatching";
import { titleSeasonYearsConflict } from "@/core/enrich/titles/intentYear";
import { parseRomanToken } from "@/core/enrich/titles/romanNumeral";
import { listingIsDistinctProductSpinoff } from "@/core/identify/titleUtils";
import { slugify } from "@/lib/routing/slugs";
import { expandPriceChartingLookupTitles } from "./lookupTitles";
import {
  priceChartingAcceptanceTitleBag,
  priceChartingSeekTitleSpecificity,
  rankPriceChartingSeekTitles,
  catalogIsLeadingFranchiseStem,
  catalogIsTokenSubsetOfTitle,
} from "./seekTitles";
import {
  priceChartingAmpersandTitleSlug,
  priceChartingTitleSlug,
} from "./titleSlug";
import { productNameFromPriceChartingGameUrl } from "./offerProductName";
import {
  pickPriceChartingPrimaryCoverUrl,
  priceChartingGalleryLabelIsRecognized,
} from "./imageLabels";
import {
  isPriceChartingQuotaBlocked,
  markPriceChartingQuotaHit,
  PriceChartingRateLimitedError,
} from "./quota";

export type {
  PriceChartingMetadata,
  PriceChartingPrices,
} from "@/core/identify/lookup/providerTypes";
export { parsePriceChartingBarcode } from "@/core/identify/lookup/priceChartingParse";

const PRICECHARTING_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
  "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
};

async function priceChartingGet(
  url: string,
  headers: Record<string, string> = PRICECHARTING_HEADERS,
) {
  if (isPriceChartingQuotaBlocked()) {
    throw new PriceChartingRateLimitedError();
  }

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetchGetWithFlareFallback(url, {
        headers,
        maxRedirects: 5,
      });
      if (response.status === 429) {
        markPriceChartingQuotaHit();
        if (attempt < 2) {
          await new Promise((resolve) =>
            setTimeout(resolve, 1500 * (attempt + 1)),
          );
          continue;
        }
      }
      return {
        status: response.status,
        data: response.data as string,
        request: { res: { responseUrl: response.responseUrl ?? url } },
      };
    } catch (error) {
      throw error;
    }
  }
  throw new Error(`PriceCharting GET failed for ${url}`);
}

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

/** Prefer a verified `/game/…` URL from HTML (canonical) or the final request URL. */
export function resolvePriceChartingGamePageUrl(
  html: string,
  finalUrl?: string | null,
): string | undefined {
  const candidates = [
    finalUrl,
    html.match(
      /rel=["']canonical["'][^>]*href=["']([^"']+)["']/i,
    )?.[1],
    html.match(
      /href=["']([^"']+)["'][^>]*rel=["']canonical["']/i,
    )?.[1],
    html.match(
      /property=["']og:url["'][^>]*content=["']([^"']+)["']/i,
    )?.[1],
  ];

  for (const raw of candidates) {
    if (!raw?.trim()) continue;
    const url = decodePriceChartingHtmlEntities(raw.trim()).replace(
      /&amp;/g,
      "&",
    );
    if (!url.includes("/game/") || isSearchUrl(url)) continue;
    return url.split(/[?#]/)[0];
  }
  return undefined;
}

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
    .replace(/\s*\/\s*/g, " and ")
    .replace(/\s*&\s*/g, " and ")
    .replace(/\s*\|\s*/g, " and ")
    // Keep franchise compounds aligned: Spider-Man ↔ Spiderman.
    .replace(/-/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function titleTokens(value: string): string[] {
  return normalizeTitleForComparison(value)
    .split(/\s+/)
    .map((token) => {
      const roman = parseRomanToken(token);
      return roman != null ? String(roman) : token;
    })
    .filter(
      (token) =>
        token &&
        !TITLE_STOP_WORDS.has(token) &&
        // Keep sequel numbers ("2") but drop stray single letters ("d").
        (token.length > 1 || /^\d+$/.test(token)),
    );
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
    .replace(/\b\d{1,2}\s*[-–—]?\s*(?=game of the year|goty)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  const titleVariants = expandPriceChartingLookupTitles(cleanedTitle);
  const slugSourceTitles = Array.from(
    new Set([
      cleanedTitle,
      withoutArticles,
      withoutSequelBeforeEdition,
      ...titleVariants,
    ]),
  );

  const compactSlugs = slugSourceTitles
    .map((value) =>
      value
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ""),
    )
    .filter(Boolean);

  const hyphenSlugs = slugSourceTitles
    .flatMap((value) => [
      priceChartingAmpersandTitleSlug(value),
      priceChartingTitleSlug(value),
      slugify(value),
    ])
    .filter(Boolean);

  const slugPriority = (slug: string) => {
    let score = 0;
    if (slug.includes("double-pack")) score += 40;
    if (slug.includes("&")) score += 20;
    if (/\d/.test(slug)) score += 10;
    return score;
  };

  return Array.from(new Set([...hyphenSlugs, ...compactSlugs])).sort(
    (left, right) => slugPriority(right) - slugPriority(left),
  );
}

function getPlatformSlug(
  platform?: string,
  isPal?: boolean,
  barcode?: string,
): string | null {
  if (!platform) return null;
  const resolved = resolvePriceChartingPlatformSlug(platform, {
    barcode,
    isPal,
  });
  if (resolved) return resolved;

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
  if (
    !priceChartingNeoGeoVariantMatchesShelf(parsedPlatform, fallbackPlatform)
  ) {
    return false;
  }
  const targetKey = detectPlatformKey(fallbackPlatform);
  if (!targetKey) return true;
  const parsedKey = detectPlatformKey(parsedPlatform || "");
  if (!parsedKey) return true;
  return parsedKey === targetKey;
}

function priceChartingTitleIdentityConflicts(
  requestedNames: readonly string[],
  catalogTitle: string,
): boolean {
  return (
    franchiseSequelNumbersConflict([...requestedNames], catalogTitle) ||
    titleSeasonYearsConflict(requestedNames, catalogTitle)
  );
}

function priceChartingTitleScore(
  requestedName: string,
  catalogTitle: string,
): number {
  return (
    titleSimilarityScore(requestedName, catalogTitle) +
    priceChartingEditionKeywordBonus(requestedName, catalogTitle)
  );
}

/**
 * Accept a PriceCharting catalog title only when it aligns with the MatchContext
 * title bag (primary + in-family aliases) — not merely the single query that
 * surfaced the search row.
 *
 * `allowFranchiseStem` is for search/slug-confirmed hits: PriceCharting often
 * stores only the franchise stem ("Baten Kaitos") while the bag carries the
 * regional subtitle. Unit tests that guard bare-franchise false friends leave
 * this off.
 */
export function priceChartingCatalogAlignsWithTitles(
  catalogTitle: string,
  titleBag: readonly string[],
  options?: { allowFranchiseStem?: boolean },
): boolean {
  const cleanedCatalog = catalogTitle.replace(/\s+/g, " ").trim();
  if (!cleanedCatalog) return false;

  const acceptance = priceChartingAcceptanceTitleBag(titleBag);
  if (acceptance.length === 0) return false;
  if (priceChartingTitleIdentityConflicts(acceptance, cleanedCatalog)) {
    return false;
  }

  const scored = acceptance.map((name) => ({
    name,
    score: priceChartingTitleScore(name, cleanedCatalog),
    specificity: priceChartingSeekTitleSpecificity(name),
  }));
  const bestEntry = scored.reduce((best, entry) =>
    entry.score > best.score ? entry : best,
  );
  if (bestEntry.score < 0.62) return false;

  // Reject longer catalog spinoffs that share a leading title even when the
  // similarity score is high ("FIFA 2002" vs "FIFA 2002: Road to FIFA World Cup").
  if (
    acceptance.some((name) =>
      listingIsDistinctProductSpinoff(name, cleanedCatalog),
    )
  ) {
    return false;
  }

  const specific = scored.filter((entry) => entry.specificity >= 4);
  if (specific.length > 0) {
    const bestSpecific = specific.reduce((best, entry) =>
      entry.score > best.score ? entry : best,
    );
    if (bestSpecific.score < 0.55) return false;

    // A short catalog title must not win via a partial franchise match when we
    // already know a more specific edition name in the bag.
    const catalogSpecificity =
      priceChartingSeekTitleSpecificity(cleanedCatalog);
    if (catalogSpecificity + 1 < bestSpecific.specificity) {
      const stemAllowed =
        options?.allowFranchiseStem === true &&
        bestSpecific.score >= 0.9 &&
        catalogIsLeadingFranchiseStem(cleanedCatalog, bestSpecific.name);
      // Non-leading short forms that still carry the product tokens
      // ("007 Nightfire" for "James Bond 007 Nightfire") — not bare franchise stems.
      const subsetShortForm =
        bestSpecific.score >= 0.9 &&
        catalogIsTokenSubsetOfTitle(cleanedCatalog, bestSpecific.name) &&
        !catalogIsLeadingFranchiseStem(cleanedCatalog, bestSpecific.name);
      if (!stemAllowed && !subsetShortForm) return false;
    }
  }

  return true;
}

function rejectMismatchedPriceChartingMetadata(
  metadata: PriceChartingMetadata | null,
  fallbackNames?: string | string[] | null,
  fallbackPlatform?: string,
  options?: { allowFranchiseStem?: boolean },
): PriceChartingMetadata | null {
  if (!metadata) return null;
  if (
    !priceChartingPlatformMatchesTarget(metadata.platform, fallbackPlatform)
  ) {
    return null;
  }
  const names = Array.isArray(fallbackNames)
    ? fallbackNames.filter(Boolean)
    : fallbackNames
      ? [fallbackNames]
      : [];
  if (
    names.length > 0 &&
    !priceChartingCatalogAlignsWithTitles(metadata.title || "", names, {
      allowFranchiseStem: options?.allowFranchiseStem,
    })
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
  barcode?: string,
): string[] {
  const platformSlug = getPlatformSlug(fallbackPlatform, isPal, barcode);
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
  barcode?: string,
): boolean {
  if (!url.includes("/game/")) return false;
  const platformSlug = getPlatformSlug(
    fallbackPlatform,
    url.includes("/pal-"),
    barcode,
  );
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

/** @internal exported for unit tests */
export function parsePriceChartingSearchRowsForTests(html: string) {
  return parseSearchRows(html);
}

/** @internal exported for unit tests */
export function pickBestPriceChartingSearchRowForTests(
  rows: { id: string; gamePath: string; title: string; platform: string }[],
  fallbackName: string,
  fallbackPlatform?: string,
  isPal?: boolean,
  isClassics?: boolean,
  additionalQueryNames: readonly string[] = [],
) {
  return pickBestRow(
    rows,
    fallbackName,
    fallbackPlatform,
    isPal,
    isClassics,
    additionalQueryNames,
  );
}

function parseSearchRows(
  html: string,
): { id: string; gamePath: string; title: string; platform: string }[] {
  const rows: {
    id: string;
    gamePath: string;
    title: string;
    platform: string;
  }[] = [];
  // Legacy: <tr class="offer" id="product-N">…</tr>
  // Current: <tr id="product-N" data-product="N">…</tr>
  const rowRegex = /<tr\b[^>]*\bid=["']product-(\d+)["'][^>]*>([\s\S]*?)<\/tr>/gi;
  let rMatch;
  while ((rMatch = rowRegex.exec(html)) !== null) {
    const id = rMatch[1];
    const content = rMatch[2];

    const legacyTitleMatch = content.match(
      /class=["']product_name["'][\s\S]*?<a[^>]*href=["']([^"']+)["'][^>]*>\s*([\s\S]*?)\s*<\/a>/i,
    );
    const modernTitleMatch = content.match(
      /<td\b[^>]*class=["'][^"']*\btitle\b[^"']*["'][^>]*>[\s\S]*?<a[^>]*href=["']([^"']*\/game\/[^"']+)["'][^>]*>\s*([\s\S]*?)\s*<\/a>/i,
    );
    const titleMatch = legacyTitleMatch ?? modernTitleMatch;
    const title = titleMatch?.[2]
      ? decodePriceChartingHtmlEntities(titleMatch[2])
          .replace(/\s+/g, " ")
          .trim()
      : "";
    if (!title) continue;

    const legacyPlatformMatch = content.match(/<br>\s*([\s\S]*?)\s*<\/h2>/i);
    const modernPlatformMatch =
      content.match(
        /class=["']console-in-title["'][\s\S]*?<a[^>]*>\s*([\s\S]*?)\s*<\/a>/i,
      ) ||
      content.match(
        /<td\b[^>]*class=["'][^"']*\bconsole\b[^"']*["'][^>]*>[\s\S]*?<a[^>]*>\s*([\s\S]*?)\s*<\/a>/i,
      );
    const platformRaw =
      legacyPlatformMatch?.[1] ?? modernPlatformMatch?.[1] ?? "";
    const platform = decodePriceChartingHtmlEntities(platformRaw)
      .replace(/\s+/g, " ")
      .trim();

    const href = titleMatch?.[1]?.trim();
    rows.push({
      id,
      gamePath: href || `/game/${id}`,
      title,
      platform,
    });
  }
  return rows;
}

function priceChartingGameUrl(gamePath: string): string {
  if (/^https?:\/\//i.test(gamePath)) return gamePath;
  return `https://www.pricecharting.com${gamePath.startsWith("/") ? gamePath : `/${gamePath}`}`;
}

/**
 * Search rows often link to `/offers?product=N` instead of `/game/…`.
 * The offers page has the cover/title but not the price table — follow to the
 * real game URL when present.
 */
async function resolvePriceChartingGamePath(
  gamePath: string,
  headers: Record<string, string>,
): Promise<string> {
  if (!/\/offers\?/i.test(gamePath)) return gamePath;
  try {
    const offersRes = await priceChartingGet(
      priceChartingGameUrl(gamePath),
      headers,
    );
    const gameLink = String(offersRes.data).match(
      /href=["'](\/game\/[^"'#?]+)/i,
    )?.[1];
    return gameLink?.trim() || gamePath;
  } catch {
    return gamePath;
  }
}

function priceChartingQueryTitleVariants(
  fallbackName: string,
  additionalNames: readonly string[] = [],
): string[] {
  return Array.from(
    new Set(
      [fallbackName, ...additionalNames]
        .filter((name) => name.trim().length > 0)
        .flatMap((name) => expandPriceChartingLookupTitles(name)),
    ),
  );
}

function priceChartingRowTitleScore(
  queryVariants: readonly string[],
  rowTitle: string,
): number {
  if (queryVariants.length === 0) return 0;
  return Math.max(
    ...queryVariants.map(
      (variant) =>
        titleSimilarityScore(variant, rowTitle) +
        priceChartingEditionKeywordBonus(variant, rowTitle),
    ),
  );
}

function priceChartingRowLooksLikeNonGameCatalog(row: {
  title: string;
  platform: string;
}): boolean {
  const platform = row.platform.toLowerCase();
  const title = row.title.toLowerCase();
  if (
    /\bstrategy\s*guide\b/.test(platform) ||
    /\bnintendo\s*power\b/.test(platform)
  ) {
    return true;
  }
  if (
    /\[(?:prima|bradygames|perfect\s*guide|player'?s?\s*guide)\]/i.test(
      row.title,
    )
  ) {
    return true;
  }
  return (
    /\bperfect\s+guide\b/.test(title) ||
    /\btrainer'?s?\s+guide\b/.test(title) ||
    /\bstrategy\s+guide\b/.test(title)
  );
}

function pickBestRow(
  rows: { id: string; gamePath: string; title: string; platform: string }[],
  fallbackName: string,
  fallbackPlatform?: string,
  isPal?: boolean,
  isClassics?: boolean,
  additionalQueryNames: readonly string[] = [],
) {
  if (rows.length === 0) return null;

  const queryVariants = priceChartingQueryTitleVariants(
    fallbackName,
    additionalQueryNames,
  );
  const targetPlatformKey = fallbackPlatform
    ? detectPlatformKey(fallbackPlatform)
    : null;
  let matchingRows = rows.filter(
    (row) => !priceChartingRowLooksLikeNonGameCatalog(row),
  );
  if (matchingRows.length === 0) return null;

  if (targetPlatformKey) {
    const platformRows = matchingRows.filter(
      (row) => detectPlatformKey(row.platform) === targetPlatformKey,
    );
    if (platformRows.length === 0) return null;
    matchingRows = platformRows;
  }

  if (fallbackPlatform) {
    matchingRows = matchingRows.filter((row) =>
      priceChartingNeoGeoVariantMatchesShelf(row.platform, fallbackPlatform),
    );
    if (matchingRows.length === 0) return null;
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
    (row) => !priceChartingTitleIdentityConflicts(queryVariants, row.title),
  );
  if (alignedRows.length > 0) {
    matchingRows = alignedRows;
  } else if (
    matchingRows.some((row) =>
      priceChartingTitleIdentityConflicts(queryVariants, row.title),
    )
  ) {
    // Every candidate conflicts on sequel/season year — do not fall through
    // to a known-wrong hit (e.g. Bundesliga Stars 2000 for a 2001 request).
    return null;
  }

  if (matchingRows.length === 0) return null;

  const best = matchingRows.reduce((currentBest, row) => {
    const score = priceChartingRowTitleScore(queryVariants, row.title);
    const bestScore = priceChartingRowTitleScore(
      queryVariants,
      currentBest.title,
    );
    if (score !== bestScore) return score > bestScore ? row : currentBest;
    // Prefer the shorter catalog title when scores tie ("Tony Hawk 4" over
    // "Tony Hawk 4 [Platinum]").
    return row.title.length < currentBest.title.length ? row : currentBest;
  }, matchingRows[0]);

  return priceChartingRowTitleScore(queryVariants, best.title) >= 0.62
    ? best
    : null;
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

  const gameUrl = priceChartingGameUrl(
    await resolvePriceChartingGamePath(bestRow.gamePath, headers),
  );
  const detailRes = await priceChartingGet(gameUrl, headers);
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
  barcode?: string,
): Promise<string | null> {
  const seen = new Set<string>();
  for (const fallbackName of fallbackNames) {
    for (const directUrl of buildDirectDetailUrls(
      fallbackName,
      fallbackPlatform,
      isPal,
      barcode,
    )) {
      if (seen.has(directUrl)) continue;
      seen.add(directUrl);

      try {
        const detailRes = await priceChartingGet(directUrl, headers);
        const finalUrl = detailRes.request.res.responseUrl || directUrl;
        if (
          !isSearchUrl(finalUrl) &&
          isDetailUrlForPlatform(finalUrl, fallbackPlatform, barcode)
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
  fallbackNames: string | string[] | undefined,
  fallbackPlatform?: string,
  options?: { allowFranchiseStem?: boolean },
): boolean {
  // Barcode-only seeks have no shelf platform — keep historic behaviour
  // (row pick already chose the product; do not invent title gates here).
  if (!fallbackPlatform) return true;

  const names = Array.isArray(fallbackNames)
    ? fallbackNames.filter(Boolean)
    : fallbackNames
      ? [fallbackNames]
      : [];

  const parsed = parsePriceChartingDetailHtml(html, names[0]);
  if (parsed?.title && names.length > 0) {
    if (
      !priceChartingCatalogAlignsWithTitles(parsed.title, names, {
        allowFranchiseStem: options?.allowFranchiseStem,
      })
    ) {
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
  barcode?: string,
): Promise<string | null> {
  const primaryTitle = fallbackNames[0] ?? "";
  const rankedNames = rankPriceChartingSeekTitles(fallbackNames, primaryTitle);
  // Cap expanded seeks — Nightfire-style alias bags otherwise explode into
  // dozens of sequential direct-URL + search GETs.
  const MAX_PRICECHARTING_NAME_SEEKS = 5;
  const expandedNames = rankPriceChartingSeekTitles(
    rankedNames.flatMap((name) => expandPriceChartingLookupTitles(name)),
    primaryTitle,
  ).slice(0, MAX_PRICECHARTING_NAME_SEEKS);
  const acceptanceNames = priceChartingAcceptanceTitleBag(fallbackNames);

  const directHtml = await fetchDirectDetailHtmlFromNameFallback(
    expandedNames,
    headers,
    fallbackPlatform,
    isPal,
    barcode,
  );
  if (directHtml) {
    if (
      isAcceptedPriceChartingDetailHtml(
        directHtml,
        "",
        acceptanceNames.length > 0 ? acceptanceNames : fallbackNames,
        fallbackPlatform,
        { allowFranchiseStem: true },
      )
    ) {
      return directHtml;
    }
  }

  const seen = new Set<string>();
  for (const fallbackName of expandedNames) {
    const normalized = fallbackName.toLowerCase().trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);

    const nameSearchUrl = `https://www.pricecharting.com/search-products?q=${encodeURIComponent(fallbackName)}`;
    const nameRes = await priceChartingGet(nameSearchUrl, headers);
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
        expandedNames,
      );
      if (!bestRow) continue;

      const gameUrl = priceChartingGameUrl(
        await resolvePriceChartingGamePath(bestRow.gamePath, headers),
      );
      const detailRes = await priceChartingGet(gameUrl, headers);
      const detailFinalUrl = detailRes.request.res.responseUrl || gameUrl;
      if (
        !isAcceptedPriceChartingDetailHtml(
          detailRes.data,
          detailFinalUrl,
          acceptanceNames.length > 0 ? acceptanceNames : fallbackNames,
          fallbackPlatform,
          { allowFranchiseStem: true },
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
        acceptanceNames.length > 0 ? acceptanceNames : fallbackNames,
        fallbackPlatform,
        { allowFranchiseStem: true },
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
  finalUrl?: string | null,
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

  if (Object.keys(result).length === 0) return null;
  const sourceUrl = resolvePriceChartingGamePageUrl(html, finalUrl);
  if (sourceUrl) result.sourceUrl = sourceUrl;

  const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const h1Content = h1Match?.[1] ?? "";
  const titleMatch = h1Content.match(/^([\s\S]*?)(?:<a|<span|$)/i);
  const rawTitle = titleMatch
    ? decodePriceChartingHtmlEntities(
        titleMatch[1].replace(/\s+/g, " ").trim(),
      )
    : "";
  const fromUrl = productNameFromPriceChartingGameUrl(sourceUrl);
  const productName = rawTitle || fromUrl || undefined;
  if (productName) result.productName = productName;

  return result;
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
    const lookupNames = expandPriceChartingLookupTitles(cleanedName);
    const html = await fetchDetailHtmlFromNameFallback(
      lookupNames,
      PRICECHARTING_HEADERS,
      fallbackPlatform,
      isPal,
      isClassics,
    );
    if (!html) return null;
    const parsed = rejectMismatchedPriceChartingMetadata(
      parsePriceChartingDetailHtml(html, cleanedName),
      cleanedName,
      fallbackPlatform,
      { allowFranchiseStem: true },
    );
    if (!parsed) return null;
    const url = resolvePriceChartingGamePageUrl(html);
    const prices = parsePriceChartingPricesFromHtml(html);
    return {
      ...parsed,
      ...(url ? { url } : {}),
      ...(prices ? { prices } : {}),
    };
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
      const loadPricedHtml = async (preferPal: boolean | undefined) => {
        const html = await fetchDetailHtmlFromNameFallback(
          fallbackNames,
          PRICECHARTING_HEADERS,
          fallbackPlatform,
          preferPal,
          isClassics,
          cleanedBarcode,
        );
        if (!html) return null;
        if (
          fallbackPlatform &&
          !isAcceptedPriceChartingDetailHtml(
            html,
            "",
            fallbackNames,
            fallbackPlatform,
            { allowFranchiseStem: true },
          )
        ) {
          return null;
        }
        return html;
      };

      let html = await loadPricedHtml(isPal);
      let prices = html ? parsePriceChartingPricesFromHtml(html) : null;
      // EU shelves default to PAL, but older catalogs (Atari 2600, …) often have
      // empty PAL market tables ("-") while NTSC siblings are priced.
      if (!prices && isPal) {
        console.log(
          `[PriceCharting Prices] PAL page has no market prices for "${fallbackNames[0]}", trying NTSC`,
        );
        html = await loadPricedHtml(false);
        prices = html ? parsePriceChartingPricesFromHtml(html) : null;
      }
      return prices;
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
    const res = await priceChartingGet(searchUrl);

    let html = res.data;
    const finalUrl = res.request.res.responseUrl || "";
    let resolvedViaNameFallback = false;

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
          cleanedBarcode,
        );
        if (!fallbackHtml) return null;
        html = fallbackHtml;
        resolvedViaNameFallback = true;
      } else {
        return null;
      }
    } else if (
      fallbackPlatform &&
      !isAcceptedPriceChartingDetailHtml(
        html,
        finalUrl,
        fallbackNames.length > 0
          ? fallbackNames
          : Array.isArray(fallbackName)
            ? fallbackName
            : fallbackName,
        fallbackPlatform,
      )
    ) {
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
        cleanedBarcode,
      );
      if (!fallbackHtml) return null;
      html = fallbackHtml;
      resolvedViaNameFallback = true;
    }

    if (
      fallbackPlatform &&
      !isAcceptedPriceChartingDetailHtml(
        html,
        finalUrl,
        fallbackNames.length > 0 ? fallbackNames : undefined,
        fallbackPlatform,
        resolvedViaNameFallback ? { allowFranchiseStem: true } : undefined,
      )
    ) {
      return null;
    }

    const sourceUrl = resolvePriceChartingGamePageUrl(
      html,
      finalUrl.includes("/game/") ? finalUrl : null,
    );
    let prices = parsePriceChartingPricesFromHtml(html, sourceUrl);
    if (!prices && isPal && fallbackNames.length > 0) {
      console.log(
        `[PriceCharting Prices] PAL page has no market prices for barcode ${cleanedBarcode}, trying NTSC name fallback`,
      );
      const ntscHtml = await fetchDetailHtmlFromNameFallback(
        fallbackNames,
        PRICECHARTING_HEADERS,
        fallbackPlatform,
        false,
        isClassics,
        cleanedBarcode,
      );
      if (
        ntscHtml &&
        (!fallbackPlatform ||
          isAcceptedPriceChartingDetailHtml(
            ntscHtml,
            "",
            fallbackNames,
            fallbackPlatform,
            { allowFranchiseStem: true },
          ))
      ) {
        prices = parsePriceChartingPricesFromHtml(ntscHtml);
      }
    }
    return prices;
  } catch (error) {
    console.error(
      `[PriceCharting Prices] Error fetching for barcode ${cleanedBarcode}:`,
      error instanceof Error ? error.message : error,
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
    const res = await priceChartingGet(searchUrl);

    let html = res.data;
    const finalUrl = res.request.res.responseUrl || "";
    let resolvedViaNameFallback = false;

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
          cleanedBarcode,
        );
        if (!fallbackHtml) return null;
        html = fallbackHtml;
        resolvedViaNameFallback = true;
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
        cleanedBarcode,
      );
      if (!fallbackHtml) return null;
      html = fallbackHtml;
      resolvedViaNameFallback = true;
    }

    const parsed = rejectMismatchedPriceChartingMetadata(
      parsePriceChartingDetailHtml(html, fallbackName),
      fallbackName,
      fallbackPlatform,
      resolvedViaNameFallback ? { allowFranchiseStem: true } : undefined,
    );
    if (!parsed) return null;

    const url = resolvePriceChartingGamePageUrl(
      html,
      finalUrl.includes("/game/") ? finalUrl : null,
    );
    const prices = parsePriceChartingPricesFromHtml(html, url);

    return {
      ...parsed,
      barcode: parsed.barcode || cleanedBarcode,
      ...(url ? { url } : {}),
      ...(prices ? { prices } : {}),
    };
  } catch (error) {
    console.error(
      `[PriceCharting Metadata] Error fetching barcode ${cleanedBarcode}:`,
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}
