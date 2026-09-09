import levenshtein from "fast-levenshtein";

import { isAxiosError } from "@/lib/http/httpClient";
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
import {
  hardwareProductTitlesAlign,
  residualIdentityMatch,
} from "@/core/enrich/titles/residualIdentity";
import {
  expandHardwareFinishFrontTitles,
  hardwareFinishEnSlugTokens,
  hardwareRequestImpliesCatalogSlimChrome,
  IDENTITY_FUNCTION_WORDS,
} from "@/core/enrich/titles/identityNoise";
import { titleSeasonYearsConflict } from "@/core/enrich/titles/intentYear";
import { parseRomanToken } from "@/core/enrich/titles/romanNumeral";
import { listingIsDistinctProductSpinoff } from "@/core/identify/titleUtils";
import { slugify } from "@/lib/routing/slugs";
import {
  expandPriceChartingLookupTitles,
  expandPriceChartingHardwareCapacityBeforeFormFactorTitles,
} from "./lookupTitles";
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
import { pickPriceChartingPrimaryCoverUrl } from "./imageLabels";
import {
  isPriceChartingQuotaBlocked,
  markPriceChartingQuotaHit,
  PriceChartingRateLimitedError,
} from "./quota";
import {
  getPriceChartingFetchStore,
  runWithPriceChartingFetchStore,
  type PriceChartingHttpResponse,
} from "./fetchStore";
import {
  promotePriceChartingPriceEvidence,
  promotePriceChartingSearchEvidence,
  readPriceChartingPriceEvidence,
  readPriceChartingSearchEvidence,
  type PriceChartingSearchRow,
} from "./durableEvidence";
import { resolveRequestAbortSignal } from "@/lib/http/jobAbort";

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

function isPriceChartingSearchHtml(html: string): boolean {
  return (
    /Buy\s*&\s*Sell\s*Search\s*Results/i.test(html) ||
    /Items\s+matching\s+your\s+search/i.test(html)
  );
}

async function priceChartingGetRaw(
  url: string,
  headers: Record<string, string>,
): Promise<PriceChartingHttpResponse> {
  if (isPriceChartingQuotaBlocked()) {
    throw new PriceChartingRateLimitedError();
  }

  const signal = resolveRequestAbortSignal();
  if (signal?.aborted) {
    const reason = signal.reason;
    if (reason instanceof Error) throw reason;
    const error = new Error("Aborted");
    error.name = "AbortError";
    throw error;
  }

  const response = await fetchGetWithFlareFallback(url, {
    headers,
    maxRedirects: 5,
    signal,
  });
  if (response.status === 429) {
    markPriceChartingQuotaHit();
    throw new PriceChartingRateLimitedError();
  }
  return {
    status: response.status,
    data: response.data as string,
    request: { res: { responseUrl: response.responseUrl ?? url } },
  };
}

async function priceChartingGet(
  url: string,
  headers: Record<string, string> = PRICECHARTING_HEADERS,
): Promise<PriceChartingHttpResponse> {
  const store = getPriceChartingFetchStore();
  if (store) {
    return store.getOrFetch(url, (u) => priceChartingGetRaw(u, headers));
  }
  return priceChartingGetRaw(url, headers);
}

/**
 * SearchYield: durable rows first, else GET + parse + promote.
 * Callers that still need HTML when the response is a fiche redirect receive
 * `html` / `finalUrl` from the network path only.
 */
async function loadPriceChartingSearchRows(
  searchUrl: string,
  headers: Record<string, string> = PRICECHARTING_HEADERS,
  options?: { evidenceOnly?: boolean },
): Promise<{
  rows: PriceChartingSearchRow[];
  html: string | null;
  finalUrl: string;
  fromEvidence: boolean;
}> {
  const cached = await readPriceChartingSearchEvidence(searchUrl);
  if (cached) {
    console.info(`[PriceCharting] Search evidence hit for ${searchUrl}`);
    return {
      rows: cached,
      html: null,
      finalUrl: searchUrl,
      fromEvidence: true,
    };
  }
  if (options?.evidenceOnly) {
    return {
      rows: [],
      html: null,
      finalUrl: searchUrl,
      fromEvidence: false,
    };
  }

  const res = await priceChartingGet(searchUrl, headers);
  const finalUrl = res.request.res.responseUrl || searchUrl;
  const html = String(res.data ?? "");
  const onSearch =
    isSearchUrl(finalUrl) || html.includes("Buy & Sell Search Results");
  const rows = onSearch ? parseSearchRows(html) : [];
  if (onSearch) {
    const evidenceUrl = isSearchUrl(finalUrl) ? finalUrl : searchUrl;
    await promotePriceChartingSearchEvidence(evidenceUrl, rows);
  }
  return { rows, html, finalUrl, fromEvidence: false };
}

function isRateLimitedError(error: unknown): boolean {
  return (
    error instanceof PriceChartingRateLimitedError ||
    (error instanceof Error && error.name === "PriceChartingRateLimitedError")
  );
}

/** Prefer a verified `/game/…` URL from HTML (canonical) or the final request URL. */
export function resolvePriceChartingGamePageUrl(
  html: string,
  finalUrl?: string | null,
): string | undefined {
  const candidates = [
    finalUrl,
    html.match(/rel=["']canonical["'][^>]*href=["']([^"']+)["']/i)?.[1],
    html.match(/href=["']([^"']+)["'][^>]*rel=["']canonical["']/i)?.[1],
    html.match(/property=["']og:url["'][^>]*content=["']([^"']+)["']/i)?.[1],
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

/**
 * PAL ↔ NTSC sibling fiche for the same catalog slug
 * (`/game/pal-playstation-vita/playstation-tv` ↔ `/game/playstation-vita/playstation-tv`).
 */
export function priceChartingSiblingRegionUrl(
  detailUrl: string,
): string | null {
  try {
    const url = new URL(detailUrl.trim());
    const match = url.pathname.match(/^\/game\/([^/]+)\/([^/]+)\/?$/i);
    if (!match) return null;
    const platform = match[1]!;
    const slug = match[2]!;
    const siblingPlatform = /^pal-/i.test(platform)
      ? platform.replace(/^pal-/i, "")
      : `pal-${platform}`;
    if (siblingPlatform.toLowerCase() === platform.toLowerCase()) return null;
    return `${url.origin}/game/${siblingPlatform}/${slug}`;
  } catch {
    return null;
  }
}

/**
 * Hardware catalog slugs often differ by region (`…-500gb-super-slim` PAL vs
 * `…-500gb-super-slim-system` NTSC, or finish-rear `nintendo-ds-lite-white` vs
 * finish-front `white-nintendo-ds-lite`). When the same-slug sibling soft-404s,
 * try these product-slug variants before falling back to a full title search.
 */
export function expandPriceChartingHardwareSiblingProductSlugs(
  productSlug: string,
): string[] {
  const cleaned = productSlug
    .replace(/^\/+|\/+$/g, "")
    .toLowerCase()
    .trim();
  if (!cleaned) return [];
  const out = new Set<string>([cleaned]);

  const addChromeVariants = (slug: string) => {
    out.add(slug);
    if (!/-(?:system|console)$/i.test(slug)) {
      out.add(`${slug}-system`);
      out.add(`${slug}-console`);
    } else {
      out.add(slug.replace(/-(?:system|console)$/i, ""));
    }
  };

  addChromeVariants(cleaned);

  const parts = cleaned.split("-").filter(Boolean);
  const withoutChrome = parts.filter(
    (part) => part !== "system" && part !== "console",
  );
  for (let index = 0; index < withoutChrome.length; index += 1) {
    const finishes = hardwareFinishEnSlugTokens(withoutChrome[index]!);
    if (finishes.length === 0) continue;
    const rest = withoutChrome.filter((_, i) => i !== index);
    if (rest.length === 0) continue;
    // PAL often ends with the finish; NTSC leads with it (and the reverse).
    // Synonym families (gray↔silver) try every EN slug token.
    for (const finish of finishes) {
      addChromeVariants([finish, ...rest].join("-"));
      addChromeVariants([...rest, finish].join("-"));
    }
  }

  return [...out];
}

function priceChartingGamePartsFromUrl(
  detailUrl: string,
): { origin: string; platform: string; productSlug: string } | null {
  try {
    const url = new URL(detailUrl.trim());
    const match = url.pathname.match(/^\/game\/([^/]+)\/([^/]+)\/?$/i);
    if (!match?.[1] || !match[2]) return null;
    return {
      origin: url.origin,
      platform: match[1],
      productSlug: match[2],
    };
  } catch {
    return null;
  }
}

function priceChartingGalleryImageCount(
  metadata: PriceChartingMetadata | null | undefined,
): number {
  return metadata?.images?.length ?? 0;
}

function preferRicherPriceChartingSibling(
  current: PriceChartingMetadata | null,
  candidate: PriceChartingMetadata | null,
): PriceChartingMetadata | null {
  if (!candidate) return current;
  if (!current) return candidate;
  const currentCount = priceChartingGalleryImageCount(current);
  const candidateCount = priceChartingGalleryImageCount(candidate);
  if (candidateCount > currentCount) return candidate;
  if (candidateCount < currentCount) return current;
  // Prefer a concrete /game/ sibling URL when image counts tie.
  if (candidate.url && !current.url) return candidate;
  return current;
}

export function priceChartingUrlIsPal(detailUrl?: string | null): boolean {
  if (!detailUrl) return false;
  return /\/game\/pal-/i.test(detailUrl);
}

function tagPriceChartingImagesRegion(
  images: PriceChartingMetadata["images"],
  isPal: boolean,
): NonNullable<PriceChartingMetadata["images"]> {
  return (images || []).map((image) => ({
    ...image,
    isPal: image.isPal ?? isPal,
  }));
}

function withTaggedPriceChartingImages(
  metadata: PriceChartingMetadata,
  isPal: boolean,
): PriceChartingMetadata {
  const images = tagPriceChartingImagesRegion(metadata.images, isPal);
  if (images.length === 0) {
    const { images: _drop, ...rest } = metadata;
    return rest;
  }
  return { ...metadata, images };
}

function mergePriceChartingRegionImages(
  primary: PriceChartingMetadata,
  sibling: PriceChartingMetadata | null,
  primaryIsPal: boolean,
): PriceChartingMetadata {
  const primaryImages = tagPriceChartingImagesRegion(
    primary.images,
    primaryIsPal,
  );
  const siblingImages = sibling
    ? tagPriceChartingImagesRegion(sibling.images, !primaryIsPal)
    : [];

  const seen = new Set<string>();
  const images: NonNullable<PriceChartingMetadata["images"]> = [];
  for (const image of [...primaryImages, ...siblingImages]) {
    if (!image.url || seen.has(image.url)) continue;
    seen.add(image.url);
    images.push(image);
  }

  const palCover = primaryIsPal ? primary.coverUrl : sibling?.coverUrl;
  const ntscCover = primaryIsPal ? sibling?.coverUrl : primary.coverUrl;
  const palUrl = primaryIsPal ? primary.url : sibling?.url;
  const ntscUrl = primaryIsPal ? sibling?.url : primary.url;
  const preferredUrl = palUrl || ntscUrl || primary.url;
  const otherUrl =
    palUrl && ntscUrl && palUrl !== ntscUrl
      ? preferredUrl === palUrl
        ? ntscUrl
        : palUrl
      : undefined;
  const { images: _drop, siblingUrl: _dropSibling, ...primaryRest } = primary;

  return {
    ...primaryRest,
    coverUrl: palCover || ntscCover || primary.coverUrl,
    ...(preferredUrl ? { url: preferredUrl } : {}),
    ...(otherUrl ? { siblingUrl: otherUrl } : {}),
    ...(images.length > 0 ? { images } : {}),
  };
}

/**
 * Fetch one sibling detail URL. Soft-404 search redirects return null so the
 * caller can try hardware slug variants / title search.
 */
async function fetchPriceChartingSiblingDetailFromUrl(
  siblingUrl: string,
  requestTitle: string | undefined,
): Promise<PriceChartingMetadata | null> {
  console.log(
    `[PriceCharting Metadata] Fetching sibling region fiche: ${siblingUrl}`,
  );
  const res = await priceChartingGet(siblingUrl);
  const finalUrl =
    (res.request as { res?: { responseUrl?: string } } | undefined)?.res
      ?.responseUrl || siblingUrl;
  if (isSearchUrl(finalUrl) || !String(finalUrl).includes("/game/")) {
    return null;
  }
  const siblingParsed = parsePriceChartingDetailHtml(res.data, requestTitle);
  if (!siblingParsed) return null;
  const siblingUrlResolved =
    resolvePriceChartingGamePageUrl(res.data, finalUrl) || siblingUrl;
  return {
    ...siblingParsed,
    url: siblingUrlResolved,
  };
}

/**
 * Fetch the PAL/NTSC sibling fiche when present, merge gallery photos with
 * per-image region tags, prefer the PAL (EUR) cover + primary URL, and keep
 * the other region on `siblingUrl` for dual catalog links.
 *
 * Same-slug siblings often soft-404 when PC uses a different title slug per
 * region (PAL `playstation-3-500gb-super-slim` ↔ NTSC
 * `playstation-3-500gb-super-slim-system`). Try hardware slug variants, then
 * rescue via title search, and keep the richer gallery.
 *
 * Barcode-confirmed fiches skip title-search rescue and hardware slug variants:
 * searching a franchise title ("Super Mario Bros") on the sibling platform is
 * slow and often exceeds the barcode lookup deadline.
 */
export async function enrichPriceChartingMetadataWithSiblingRegion(
  metadata: PriceChartingMetadata,
  options?: {
    allowTitleSearchRescue?: boolean;
    allowHardwareSlugVariants?: boolean;
  },
): Promise<PriceChartingMetadata> {
  const primaryUrl = metadata.url;
  if (!primaryUrl) {
    return withTaggedPriceChartingImages(metadata, true);
  }

  const primaryIsPal = priceChartingUrlIsPal(primaryUrl);
  const taggedPrimary = withTaggedPriceChartingImages(metadata, primaryIsPal);

  const siblingUrl = priceChartingSiblingRegionUrl(primaryUrl);
  if (!siblingUrl) return taggedPrimary;

  const primaryParts = priceChartingGamePartsFromUrl(primaryUrl);
  const siblingParts = priceChartingGamePartsFromUrl(siblingUrl);
  const allowTitleSearchRescue = options?.allowTitleSearchRescue !== false;
  const allowHardwareSlugVariants =
    options?.allowHardwareSlugVariants !== false;

  try {
    let siblingMeta: PriceChartingMetadata | null = null;

    try {
      siblingMeta = await fetchPriceChartingSiblingDetailFromUrl(
        siblingUrl,
        metadata.title,
      );
    } catch (error: unknown) {
      if (isRateLimitedError(error)) throw error;
      console.warn(
        `[PriceCharting Metadata] Sibling region fetch failed for ${siblingUrl}:`,
        error instanceof Error ? error.message : error,
      );
    }

    // Hardware: same-slug often soft-404s while `…-system` holds the box gallery
    // (PAL `…-500gb-super-slim` ↔ NTSC `…-500gb-super-slim-system`).
    if (
      !siblingMeta &&
      allowHardwareSlugVariants &&
      primaryParts &&
      siblingParts
    ) {
      const variantSlugs = expandPriceChartingHardwareSiblingProductSlugs(
        primaryParts.productSlug,
      ).filter(
        (slug) => slug.toLowerCase() !== siblingParts.productSlug.toLowerCase(),
      );
      for (const slug of variantSlugs) {
        const variantUrl = `${siblingParts.origin}/game/${siblingParts.platform}/${slug}`;
        try {
          const variantMeta = await fetchPriceChartingSiblingDetailFromUrl(
            variantUrl,
            metadata.title,
          );
          siblingMeta = preferRicherPriceChartingSibling(
            siblingMeta,
            variantMeta,
          );
          if (priceChartingGalleryImageCount(siblingMeta) > 0) break;
        } catch (error: unknown) {
          if (isRateLimitedError(error)) throw error;
          console.warn(
            `[PriceCharting Metadata] Sibling slug variant failed for ${variantUrl}:`,
            error instanceof Error ? error.message : error,
          );
        }
      }
    }

    if (!siblingMeta && allowTitleSearchRescue) {
      siblingMeta = await fetchPriceChartingSiblingViaTitleSearch(
        metadata,
        primaryUrl,
        !primaryIsPal,
      );
    }

    if (!siblingMeta) return taggedPrimary;

    return mergePriceChartingRegionImages(
      taggedPrimary,
      siblingMeta,
      primaryIsPal,
    );
  } catch (error: unknown) {
    if (isRateLimitedError(error)) throw error;
    console.warn(
      `[PriceCharting Metadata] Sibling region enrich failed for ${siblingUrl}:`,
      error instanceof Error ? error.message : error,
    );
    return taggedPrimary;
  }
}

function priceChartingPlatformSlugFromGameUrl(
  detailUrl: string,
): string | null {
  try {
    const match = new URL(detailUrl.trim()).pathname.match(
      /^\/game\/(?:pal-|jp-)?([^/]+)\//i,
    );
    return match?.[1]?.toLowerCase() || null;
  } catch {
    return null;
  }
}

function priceChartingRowMatchesPlatformSlug(
  gamePath: string,
  platformSlug: string,
  wantPal: boolean,
): boolean {
  try {
    const pathname = new URL(priceChartingGameUrl(gamePath)).pathname;
    const match = pathname.match(/^\/game\/([^/]+)\//i);
    if (!match?.[1]) return false;
    const platform = match[1].toLowerCase();
    const slug = platformSlug.toLowerCase();
    if (wantPal) return platform === `pal-${slug}`;
    return platform === slug;
  } catch {
    return false;
  }
}

/**
 * When the same-slug sibling soft-404s, search the sibling platform by title
 * (including finish-front variants) and fetch the best matching fiche.
 */
async function fetchPriceChartingSiblingViaTitleSearch(
  metadata: PriceChartingMetadata,
  primaryUrl: string,
  wantPal: boolean,
): Promise<PriceChartingMetadata | null> {
  const platformSlug = priceChartingPlatformSlugFromGameUrl(primaryUrl);
  const title = metadata.title?.trim();
  if (!platformSlug || !title) return null;

  const seekTitles = Array.from(
    new Set([
      ...expandHardwareFinishFrontTitles(title),
      ...expandPriceChartingLookupTitles(title),
      title,
    ]),
  ).slice(0, 4);

  for (const seekTitle of seekTitles) {
    const searchUrl = `https://www.pricecharting.com/search-products?q=${encodeURIComponent(seekTitle)}&type=prices`;
    try {
      console.log(
        `[PriceCharting Metadata] Sibling region title search: ${seekTitle}`,
      );
      const { rows: allRows } = await loadPriceChartingSearchRows(searchUrl);
      const rows = allRows.filter((row) =>
        priceChartingRowMatchesPlatformSlug(
          row.gamePath,
          platformSlug,
          wantPal,
        ),
      );
      if (rows.length === 0) continue;

      const best = pickBestRow(
        rows,
        title,
        platformSlug.replace(/-/g, " "),
        wantPal,
        false,
        seekTitles,
        { mediaType: "hardware" },
      );
      if (!best) continue;

      const gameUrl = priceChartingGameUrl(
        await resolvePriceChartingGamePath(
          best.gamePath,
          PRICECHARTING_HEADERS,
        ),
      );
      const detailRes = await priceChartingGet(gameUrl);
      const detailFinalUrl = detailRes.request.res.responseUrl || gameUrl;
      if (
        isSearchUrl(detailFinalUrl) ||
        !String(detailFinalUrl).includes("/game/")
      ) {
        continue;
      }
      const parsed = parsePriceChartingDetailHtml(detailRes.data, title);
      if (!parsed) continue;

      const resolved =
        resolvePriceChartingGamePageUrl(detailRes.data, detailFinalUrl) ||
        gameUrl;
      if (resolved === primaryUrl) continue;

      return {
        ...parsed,
        url: resolved,
      };
    } catch (error: unknown) {
      if (isRateLimitedError(error)) throw error;
      console.warn(
        `[PriceCharting Metadata] Sibling title search failed for "${seekTitle}":`,
        error instanceof Error ? error.message : error,
      );
    }
  }

  return null;
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
  return (
    value
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
      .trim()
  );
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
        !IDENTITY_FUNCTION_WORDS.has(token) &&
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

function buildTitleSlugCandidates(
  title: string,
  options?: { keepPlatformInSlug?: boolean },
): string[] {
  // Games: slug under /wii/mario-kart (platform lives in the path). Hardware:
  // the console name IS the product ("playstation-3-500gb-super-slim") — keep it.
  const cleanedTitle = title
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .replace(
      options?.keepPlatformInSlug
        ? /$a/
        : /\b(ps1|ps2|ps3|ps4|ps5|playstation\s*\d?|xbox\s*(360)?|wii)\b/gi,
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
    // Prefer hyphenated catalog slugs (`psone-system`) over compact 404s
    // (`psonesystem`).
    if (slug.includes("-")) score += 5;
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
  options?: { allowFranchiseStem?: boolean; mediaType?: string | null },
): boolean {
  const cleanedCatalog = catalogTitle.replace(/\s+/g, " ").trim();
  if (!cleanedCatalog) return false;

  const acceptance = priceChartingAcceptanceTitleBag(titleBag);
  if (acceptance.length === 0) return false;
  if (priceChartingTitleIdentityConflicts(acceptance, cleanedCatalog)) {
    return false;
  }

  const shelfType = options?.mediaType === "hardware" ? "hardware" : undefined;

  // Drop trailing request lines the catalog omits ("Slim Rose" vs bare "Slim")
  // and reject sibling compact markers ("Rose" vs "Pink") without inventing
  // FR↔EN aliases. Broader residual rejects still allow synonym insertions
  // ("FIFA Football 2002") and franchise-stem rescues.
  if (shelfType === "hardware") {
    // Same gate as price listings + gallery titles (no soft fallthrough).
    return acceptance.some((name) =>
      hardwareProductTitlesAlign(name, cleanedCatalog),
    );
  }

  const residual = residualIdentityMatch({
    requestTitles: acceptance,
    candidateTitles: [cleanedCatalog],
  });
  if (
    residual.decision === "reject" &&
    (residual.reasons.includes("request_series_line_unexplained") ||
      residual.reasons.includes("series_suffix_mismatch"))
  ) {
    const stemRescue =
      options?.allowFranchiseStem === true &&
      acceptance.some(
        (name) =>
          priceChartingTitleScore(name, cleanedCatalog) >= 0.9 &&
          catalogIsLeadingFranchiseStem(cleanedCatalog, name),
      );
    if (!stemRescue) return false;
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
      // Still blocked when residual identity already rejected above.
      const subsetShortForm =
        bestSpecific.score >= 0.9 &&
        catalogIsTokenSubsetOfTitle(cleanedCatalog, bestSpecific.name) &&
        !catalogIsLeadingFranchiseStem(cleanedCatalog, bestSpecific.name);
      if (!stemAllowed && !subsetShortForm) return false;
    }
  }

  return true;
}

function priceChartingDropsRequestSeriesLine(
  requestTitles: readonly string[],
  catalogTitle: string,
  options?: { mediaType?: string | null },
): boolean {
  const residual = residualIdentityMatch({
    requestTitles: [...requestTitles],
    candidateTitles: [catalogTitle],
    shelfType: options?.mediaType === "hardware" ? "hardware" : undefined,
  });
  return (
    residual.decision === "reject" &&
    (residual.reasons.includes("request_series_line_unexplained") ||
      residual.reasons.includes("series_suffix_mismatch"))
  );
}

function rejectMismatchedPriceChartingMetadata(
  metadata: PriceChartingMetadata | null,
  fallbackNames?: string | string[] | null,
  fallbackPlatform?: string,
  options?: { allowFranchiseStem?: boolean; mediaType?: string | null },
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
      mediaType: options?.mediaType,
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
  options?: { mediaType?: string | null },
): string[] {
  // Hardware shelves omit shelfName as platform; infer from the title when it
  // names a console ("Nintendo 64" → pal-nintendo-64/nintendo-64-system).
  const platformHint =
    fallbackPlatform || (detectPlatformKey(title) ? title : undefined);
  if (!platformHint) return [];

  const titleSlugs = buildTitleSlugCandidates(title, {
    keepPlatformInSlug: options?.mediaType === "hardware",
  });
  const urls: string[] = [];
  const regionFlags =
    isPal === undefined ? [true, false] : isPal ? [true, false] : [false, true];
  for (const preferPal of regionFlags) {
    const platformSlug = getPlatformSlug(platformHint, preferPal, barcode);
    if (!platformSlug) continue;
    for (const titleSlug of titleSlugs) {
      urls.push(
        `https://www.pricecharting.com/game/${platformSlug}/${titleSlug}`,
      );
    }
  }
  return Array.from(new Set(urls));
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
export async function resolvePriceChartingGamePathForTests(
  gamePath: string,
  headers: Record<string, string>,
): Promise<string> {
  return resolvePriceChartingGamePath(gamePath, headers);
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
  options?: { mediaType?: string | null },
) {
  return pickBestRow(
    rows,
    fallbackName,
    fallbackPlatform,
    isPal,
    isClassics,
    additionalQueryNames,
    options,
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
  const rowRegex =
    /<tr\b[^>]*\bid=["']product-(\d+)["'][^>]*>([\s\S]*?)<\/tr>/gi;
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
    // Paths may contain literal `&` (Game & Watch → `/game/game-&-watch/…`).
    // Do not stop the capture at `&` — strip query/hash after the match.
    const gameLink = String(offersRes.data).match(
      /href=["'](\/game\/[^"']+)/i,
    )?.[1];
    const cleaned = gameLink?.trim().split(/[?#]/)[0];
    return cleaned || gamePath;
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
  options?: { mediaType?: string | null },
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

  const seriesAligned = matchingRows.filter(
    (row) =>
      !priceChartingDropsRequestSeriesLine(queryVariants, row.title, {
        mediaType: options?.mediaType,
      }),
  );
  if (seriesAligned.length > 0) {
    matchingRows = seriesAligned;
  } else if (
    matchingRows.some((row) =>
      priceChartingDropsRequestSeriesLine(queryVariants, row.title, {
        mediaType: options?.mediaType,
      }),
    )
  ) {
    // Every candidate omits a trailing request line (e.g. Slim Rose → bare Slim).
    return null;
  }

  // Hardware: drop residual rejects (game hits, Slim for bare Vita, etc.) and
  // prefer System/Console SKU titles when present.
  if (options?.mediaType === "hardware") {
    const hardwareAligned = matchingRows.filter((row) => {
      const residual = residualIdentityMatch({
        requestTitles: queryVariants,
        candidateTitles: [row.title],
        shelfType: "hardware",
      });
      return residual.decision !== "reject";
    });
    if (hardwareAligned.length > 0) {
      matchingRows = hardwareAligned;
    } else if (matchingRows.length > 0) {
      return null;
    }
    const systemRows = matchingRows.filter((row) =>
      /\b(?:system|console)\b/i.test(row.title),
    );
    if (systemRows.length > 0) {
      matchingRows = systemRows;
    }
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

  // Hardware edition titles ("Switch OLED Édition Zelda") score just under the
  // game floor against bare console SKUs — residual already validated identity.
  const minScore = options?.mediaType === "hardware" ? 0.55 : 0.62;
  return priceChartingRowTitleScore(queryVariants, best.title) >= minScore
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

function priceChartingDetailHtmlHasMarketPrices(html: string): boolean {
  return (
    /id=["']used_price["'][\s\S]{0,500}?\$\s*[0-9]/.test(html) ||
    /id=["']complete_price["'][\s\S]{0,500}?\$\s*[0-9]/.test(html) ||
    /id=["']new_price["'][\s\S]{0,500}?\$\s*[0-9]/.test(html)
  );
}

async function fetchDirectDetailHtmlFromNameFallback(
  fallbackNames: string[],
  headers: Record<string, string>,
  fallbackPlatform?: string,
  isPal?: boolean,
  barcode?: string,
  options?: {
    acceptHtml?: (html: string, finalUrl: string) => boolean;
    preferMarketPrices?: boolean;
    mediaType?: string | null;
    isClassics?: boolean;
    /** All seek titles for soft-404 search row picking. */
    seekTitles?: readonly string[];
  },
): Promise<string | null> {
  const seen = new Set<string>();
  let acceptedWithoutPrices: string | null = null;
  // Hard cap: never spray dozens of invented slugs (soft-404 search is mined once).
  const maxDirectUrls = options?.mediaType === "hardware" ? 2 : 3;
  let urlsTried = 0;
  const seekTitles = options?.seekTitles?.length
    ? options.seekTitles
    : fallbackNames;

  for (const fallbackName of fallbackNames) {
    for (const directUrl of buildDirectDetailUrls(
      fallbackName,
      fallbackPlatform,
      isPal,
      barcode,
      { mediaType: options?.mediaType },
    )) {
      if (seen.has(directUrl)) continue;
      seen.add(directUrl);
      if (urlsTried >= maxDirectUrls) {
        return acceptedWithoutPrices;
      }
      urlsTried += 1;

      try {
        const detailRes = await priceChartingGet(directUrl, headers);
        const finalUrl = detailRes.request.res.responseUrl || directUrl;

        // Soft-404 → search page: that HTML is SearchYield — mine it, stop spraying.
        if (
          isSearchUrl(finalUrl) ||
          isPriceChartingSearchHtml(detailRes.data)
        ) {
          getPriceChartingFetchStore()?.seed(directUrl, detailRes);
          const fromSearch = await detailHtmlFromParsedSearchRows(
            detailRes.data,
            fallbackName,
            headers,
            fallbackPlatform,
            isPal,
            options?.isClassics,
            seekTitles,
            {
              mediaType: options?.mediaType,
              acceptHtml: options?.acceptHtml,
              preferMarketPrices: options?.preferMarketPrices,
            },
          );
          return fromSearch ?? acceptedWithoutPrices;
        }

        if (!isDetailUrlForPlatform(finalUrl, fallbackPlatform, barcode)) {
          continue;
        }
        if (
          options?.acceptHtml &&
          !options.acceptHtml(detailRes.data, finalUrl)
        ) {
          continue;
        }
        if (
          options?.preferMarketPrices &&
          !priceChartingDetailHtmlHasMarketPrices(detailRes.data)
        ) {
          acceptedWithoutPrices ??= detailRes.data;
          continue;
        }
        return detailRes.data;
      } catch (error) {
        if (isRateLimitedError(error)) throw error;
        if (!isAxiosError(error) || error.response?.status !== 404) {
          console.warn(
            `[PriceCharting] Direct detail lookup failed for ${directUrl}:`,
            error instanceof Error ? error.message : error,
          );
        }
      }
    }
  }

  return acceptedWithoutPrices;
}

async function detailHtmlFromParsedSearchRows(
  searchHtml: string,
  queryName: string,
  headers: Record<string, string>,
  fallbackPlatform: string | undefined,
  isPal: boolean | undefined,
  isClassics: boolean | undefined,
  seekTitles: readonly string[],
  options?: {
    mediaType?: string | null;
    acceptHtml?: (html: string, finalUrl: string) => boolean;
    preferMarketPrices?: boolean;
  },
): Promise<string | null> {
  return detailHtmlFromSearchRows(
    parseSearchRows(searchHtml),
    queryName,
    headers,
    fallbackPlatform,
    isPal,
    isClassics,
    seekTitles,
    options,
  );
}

async function detailHtmlFromSearchRows(
  rows: PriceChartingSearchRow[],
  queryName: string,
  headers: Record<string, string>,
  fallbackPlatform: string | undefined,
  isPal: boolean | undefined,
  isClassics: boolean | undefined,
  seekTitles: readonly string[],
  options?: {
    mediaType?: string | null;
    acceptHtml?: (html: string, finalUrl: string) => boolean;
    preferMarketPrices?: boolean;
  },
): Promise<string | null> {
  const bestRow = pickBestRow(
    rows,
    queryName,
    fallbackPlatform,
    isPal,
    isClassics,
    seekTitles,
    { mediaType: options?.mediaType },
  );
  if (!bestRow) return null;

  const gameUrl = priceChartingGameUrl(
    await resolvePriceChartingGamePath(bestRow.gamePath, headers),
  );
  const detailRes = await priceChartingGet(gameUrl, headers);
  const detailFinalUrl = detailRes.request.res.responseUrl || gameUrl;
  if (
    isSearchUrl(detailFinalUrl) ||
    isPriceChartingSearchHtml(detailRes.data)
  ) {
    return null;
  }
  if (
    options?.acceptHtml &&
    !options.acceptHtml(detailRes.data, detailFinalUrl)
  ) {
    return null;
  }
  if (
    options?.preferMarketPrices &&
    !priceChartingDetailHtmlHasMarketPrices(detailRes.data)
  ) {
    return detailRes.data;
  }
  return detailRes.data;
}

function isAcceptedPriceChartingDetailHtml(
  html: string,
  finalUrl: string,
  fallbackNames: string | string[] | undefined,
  fallbackPlatform?: string,
  options?: { allowFranchiseStem?: boolean; mediaType?: string | null },
): boolean {
  // Barcode-only seeks have no shelf platform — keep historic behaviour
  // (row pick already chose the product; do not invent title gates here).
  if (!fallbackPlatform && options?.mediaType !== "hardware") return true;

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
        mediaType: options?.mediaType,
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
    fallbackPlatform &&
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
  options?: { mediaType?: string | null },
): Promise<string | null> {
  const primaryTitle = fallbackNames[0] ?? "";
  const rankedNames = rankPriceChartingSeekTitles(fallbackNames, primaryTitle);
  // Cap expanded seeks — Nightfire-style alias bags otherwise explode into
  // dozens of sequential GETs.
  const MAX_PRICECHARTING_NAME_SEEKS =
    options?.mediaType === "hardware" ? 4 : 3;
  const expandedNames = rankPriceChartingSeekTitles(
    [
      ...expandPriceChartingHardwareCapacityBeforeFormFactorTitles(
        primaryTitle,
      ),
      ...rankedNames.flatMap((name) => expandPriceChartingLookupTitles(name)),
    ],
    primaryTitle,
  ).slice(0, MAX_PRICECHARTING_NAME_SEEKS);
  const acceptanceNames = priceChartingAcceptanceTitleBag(fallbackNames);
  const acceptOpts = {
    allowFranchiseStem: true as const,
    mediaType: options?.mediaType,
  };
  const acceptNames =
    acceptanceNames.length > 0 ? acceptanceNames : fallbackNames;

  const trySearchNames = async (): Promise<string | null> => {
    const seen = new Set<string>();
    for (const fallbackName of expandedNames) {
      const normalized = fallbackName.toLowerCase().trim();
      if (!normalized || seen.has(normalized)) continue;
      seen.add(normalized);

      const nameSearchUrl = `https://www.pricecharting.com/search-products?q=${encodeURIComponent(fallbackName)}&type=prices`;
      const loaded = await loadPriceChartingSearchRows(nameSearchUrl, headers);
      const html = loaded.html ?? "";
      const nameFinalUrl = loaded.finalUrl;

      if (
        loaded.rows.length > 0 ||
        loaded.fromEvidence ||
        isSearchUrl(nameFinalUrl) ||
        (html && isPriceChartingSearchHtml(html))
      ) {
        const fromRows = await detailHtmlFromSearchRows(
          loaded.rows.length > 0 ? loaded.rows : parseSearchRows(html),
          fallbackName,
          headers,
          fallbackPlatform,
          isPal,
          isClassics,
          expandedNames,
          {
            mediaType: options?.mediaType,
            acceptHtml: (body, finalUrl) =>
              isAcceptedPriceChartingDetailHtml(
                body,
                finalUrl,
                acceptNames,
                fallbackPlatform,
                acceptOpts,
              ),
          },
        );
        if (fromRows) return fromRows;
        continue;
      }

      if (
        !html ||
        !isAcceptedPriceChartingDetailHtml(
          html,
          nameFinalUrl,
          acceptNames,
          fallbackPlatform,
          acceptOpts,
        )
      ) {
        continue;
      }
      return html;
    }
    return null;
  };

  const tryDirectNames = async (): Promise<string | null> => {
    // Tiny last-resort slug guesses only — search is the primary path.
    const capacityBeforeForm = expandedNames.filter((name) =>
      /\b\d+\s*(?:tb|to|gb|go|mb|mo)\s+(?:super\s+)?(?:slim|lite)\b/i.test(
        name,
      ),
    );
    const psoneSlimSystem = expandedNames.filter(
      (name) => /\bslim\b/i.test(name) && /\b(?:system|console)\b/i.test(name),
    );
    const directPool =
      options?.mediaType === "hardware"
        ? [
            ...capacityBeforeForm,
            ...(hardwareRequestImpliesCatalogSlimChrome(primaryTitle)
              ? psoneSlimSystem
              : []),
            ...expandedNames.filter(
              (name) =>
                !capacityBeforeForm.includes(name) &&
                !psoneSlimSystem.includes(name),
            ),
          ]
        : expandedNames;
    const directNames = [...new Set(directPool)].slice(
      0,
      options?.mediaType === "hardware" ? 2 : 2,
    );
    return fetchDirectDetailHtmlFromNameFallback(
      directNames,
      headers,
      fallbackPlatform,
      isPal,
      barcode,
      {
        preferMarketPrices: options?.mediaType === "hardware",
        mediaType: options?.mediaType,
        isClassics,
        seekTitles: expandedNames,
        acceptHtml: (html, finalUrl) =>
          isAcceptedPriceChartingDetailHtml(
            html,
            finalUrl,
            acceptNames,
            fallbackPlatform,
            acceptOpts,
          ),
      },
    );
  };

  // Search-first (games + hardware): real slugs live on the results page.
  try {
    const fromSearch = await trySearchNames();
    if (fromSearch) return fromSearch;
    return tryDirectNames();
  } catch (error) {
    if (isRateLimitedError(error)) return null;
    throw error;
  }
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
    const label = decodePriceChartingHtmlEntities(
      match[2]?.replace(/\s+/g, " ").trim() || "",
    );
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

function stripPriceChartingH1TitleChrome(title: string): string {
  return (
    title
      .replace(/\s+/g, " ")
      .trim()
      // Some hardware h1s omit the platform <a> and append "Prices"
      // ("Psone System Prices") — drop that page chrome before identity match.
      .replace(/\s+prices\s*$/i, "")
      .trim()
  );
}

export function parsePriceChartingDetailHtml(
  html: string,
  fallbackName?: string,
): PriceChartingMetadata | null {
  // Search-result chrome is not a product fiche (barcode misses without
  // type=prices used to land here with "Items matching your search: …").
  if (
    /Buy\s*&\s*Sell\s*Search\s*Results/i.test(html) ||
    /Items\s+matching\s+your\s+search/i.test(html)
  ) {
    return null;
  }

  const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (!h1Match) return null;

  const h1Content = h1Match[1];
  const titleMatch = h1Content.match(/^([\s\S]*?)(?:<a|<span|$)/i);
  const rawTitle = titleMatch
    ? stripPriceChartingH1TitleChrome(titleMatch[1])
    : "";
  const title = decodePriceChartingHtmlEntities(
    preferSpecificFallbackTitle(rawTitle, fallbackName),
  );
  if (!title || /^items\s+matching\s+your\s+search/i.test(title)) {
    return null;
  }

  const platformMatch = h1Content.match(/<a[^>]*>([\s\S]*?)<\/a>/i);
  const platform = platformMatch
    ? decodePriceChartingHtmlEntities(
        platformMatch[1].replace(/\s+/g, " ").trim(),
      )
    : undefined;

  const images = parsePriceChartingGalleryImages(html);
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
    ? stripPriceChartingH1TitleChrome(
        decodePriceChartingHtmlEntities(titleMatch[1]),
      )
    : "";
  const fromUrl = productNameFromPriceChartingGameUrl(sourceUrl);
  const productName = rawTitle || fromUrl || undefined;
  if (productName) result.productName = productName;

  return result;
}

async function parsePriceChartingPricesFromHtmlAndPromote(
  html: string,
  finalUrl?: string | null,
): Promise<PriceChartingPrices | null> {
  const prices = parsePriceChartingPricesFromHtml(html, finalUrl);
  if (prices) await promotePriceChartingPriceEvidence(prices);
  return prices;
}

export async function fetchMetadataFromPriceChartingByName(
  name: string,
  fallbackPlatform?: string,
  isPal?: boolean,
  isClassics?: boolean,
  options?: { mediaType?: string | null },
): Promise<PriceChartingMetadata | null> {
  return runWithPriceChartingFetchStore(() =>
    fetchMetadataFromPriceChartingByNameUncached(
      name,
      fallbackPlatform,
      isPal,
      isClassics,
      options,
    ),
  );
}

async function fetchMetadataFromPriceChartingByNameUncached(
  name: string,
  fallbackPlatform?: string,
  isPal?: boolean,
  isClassics?: boolean,
  options?: { mediaType?: string | null },
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
      undefined,
      { mediaType: options?.mediaType },
    );
    if (!html) return null;
    const parsed = rejectMismatchedPriceChartingMetadata(
      parsePriceChartingDetailHtml(html, cleanedName),
      cleanedName,
      fallbackPlatform,
      {
        allowFranchiseStem: true,
        mediaType: options?.mediaType,
      },
    );
    if (!parsed) return null;
    const url = resolvePriceChartingGamePageUrl(html);
    // Same HTML serves metadata + prices (stage reuse via store for sibling GETs).
    const prices = await parsePriceChartingPricesFromHtmlAndPromote(html);
    const base: PriceChartingMetadata = {
      ...parsed,
      ...(url ? { url } : {}),
      ...(prices ? { prices } : {}),
    };
    const primaryRich =
      Boolean(base.coverUrl || (base.images && base.images.length > 0)) &&
      Boolean(prices);
    return enrichPriceChartingMetadataWithSiblingRegion(base, {
      allowTitleSearchRescue: !primaryRich,
    });
  } catch (error: unknown) {
    if (isRateLimitedError(error)) return null;
    const message = error instanceof Error ? error.message : String(error);
    console.error(
      `[PriceCharting Metadata] Error fetching by name "${cleanedName}":`,
      message,
    );
    return null;
  }
}

/**
 * Refresh metadata from an already-known `/game/…` fiche (pinned external-link),
 * then merge the PAL/NTSC sibling gallery like barcode/name seeks.
 */
export async function fetchMetadataFromPriceChartingGameUrl(
  gameUrl: string,
  options?: {
    fallbackName?: string;
    mediaType?: string | null;
    allowTitleSearchRescue?: boolean;
    allowHardwareSlugVariants?: boolean;
  },
): Promise<PriceChartingMetadata | null> {
  return runWithPriceChartingFetchStore(() =>
    fetchMetadataFromPriceChartingGameUrlUncached(gameUrl, options),
  );
}

async function fetchMetadataFromPriceChartingGameUrlUncached(
  gameUrl: string,
  options?: {
    fallbackName?: string;
    mediaType?: string | null;
    allowTitleSearchRescue?: boolean;
    allowHardwareSlugVariants?: boolean;
  },
): Promise<PriceChartingMetadata | null> {
  const cleaned = gameUrl.trim();
  if (!cleaned.includes("/game/") || isSearchUrl(cleaned)) return null;

  try {
    console.log(`[PriceCharting Metadata] Fetching pinned fiche: ${cleaned}`);
    const res = await priceChartingGet(cleaned);
    const finalUrl =
      (res.request as { res?: { responseUrl?: string } } | undefined)?.res
        ?.responseUrl || cleaned;
    if (isSearchUrl(finalUrl) || !String(finalUrl).includes("/game/")) {
      return null;
    }
    const parsed = parsePriceChartingDetailHtml(
      res.data,
      options?.fallbackName,
    );
    if (!parsed) return null;
    const url = resolvePriceChartingGamePageUrl(res.data, finalUrl) || cleaned;
    const prices = await parsePriceChartingPricesFromHtmlAndPromote(
      res.data,
      url,
    );
    const base: PriceChartingMetadata = {
      ...parsed,
      url,
      ...(prices ? { prices } : {}),
    };
    const mediaType = options?.mediaType;
    const primaryRich =
      Boolean(base.coverUrl || (base.images && base.images.length > 0)) &&
      Boolean(prices);
    return enrichPriceChartingMetadataWithSiblingRegion(base, {
      // Pinned fiche is already trusted — keep sibling enrich cheap (same as
      // barcode-confirmed path) unless the caller opts into broader rescue.
      // Skip title-search when primary already has cover + market prices.
      allowTitleSearchRescue:
        options?.allowTitleSearchRescue === true && !primaryRich,
      allowHardwareSlugVariants:
        options?.allowHardwareSlugVariants ?? mediaType === "hardware",
    });
  } catch (error: unknown) {
    if (isRateLimitedError(error)) return null;
    const message = error instanceof Error ? error.message : String(error);
    console.error(
      `[PriceCharting Metadata] Error fetching pinned fiche "${cleaned}":`,
      message,
    );
    return null;
  }
}

export async function fetchPricesFromPriceChartingGameUrl(
  gameUrl: string,
  options?: { evidenceOnly?: boolean },
): Promise<PriceChartingPrices | null> {
  return runWithPriceChartingFetchStore(() =>
    fetchPricesFromPriceChartingGameUrlUncached(gameUrl, options),
  );
}

async function fetchPricesFromPriceChartingGameUrlUncached(
  gameUrl: string,
  options?: { evidenceOnly?: boolean },
): Promise<PriceChartingPrices | null> {
  const cleaned = gameUrl.trim();
  if (!cleaned.includes("/game/") || isSearchUrl(cleaned)) return null;

  const cached = await readPriceChartingPriceEvidence(cleaned);
  if (cached) {
    console.log(`[PriceCharting Prices] Reusing durable evidence: ${cleaned}`);
    return cached;
  }
  if (options?.evidenceOnly) return null;

  try {
    console.log(`[PriceCharting Prices] Fetching stored fiche: ${cleaned}`);
    const res = await priceChartingGet(cleaned);
    const finalUrl =
      (res.request as { res?: { responseUrl?: string } } | undefined)?.res
        ?.responseUrl || cleaned;
    if (isSearchUrl(finalUrl) || !String(finalUrl).includes("/game/")) {
      return null;
    }
    let prices = await parsePriceChartingPricesFromHtmlAndPromote(
      res.data,
      finalUrl,
    );
    // Empty PAL market tables — try the NTSC sibling when we started on PAL.
    if (!prices && priceChartingUrlIsPal(finalUrl)) {
      const sibling = priceChartingSiblingRegionUrl(finalUrl);
      if (sibling) {
        console.log(
          `[PriceCharting Prices] PAL fiche has no market prices, trying NTSC: ${sibling}`,
        );
        const siblingRes = await priceChartingGet(sibling);
        const siblingFinal =
          (siblingRes.request as { res?: { responseUrl?: string } } | undefined)
            ?.res?.responseUrl || sibling;
        prices = await parsePriceChartingPricesFromHtmlAndPromote(
          siblingRes.data,
          siblingFinal,
        );
      }
    }
    return prices;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(
      `[PriceCharting Prices] Error fetching stored fiche "${cleaned}":`,
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
  options?: { mediaType?: string | null },
): Promise<PriceChartingPrices | null> {
  return runWithPriceChartingFetchStore(() =>
    fetchPricesFromPriceChartingUncached(
      barcode,
      fallbackName,
      fallbackPlatform,
      isPal,
      isClassics,
      options,
    ),
  );
}

async function fetchPricesFromPriceChartingUncached(
  barcode: string,
  fallbackName?: string | string[],
  fallbackPlatform?: string,
  isPal?: boolean,
  isClassics?: boolean,
  options?: { mediaType?: string | null },
): Promise<PriceChartingPrices | null> {
  const cleanedBarcode = barcode.replace(/[^\d]/g, "").trim();
  const fallbackNames = Array.isArray(fallbackName)
    ? fallbackName.filter(Boolean)
    : fallbackName
      ? [fallbackName]
      : [];
  const acceptOpts = {
    allowFranchiseStem: true as const,
    mediaType: options?.mediaType,
  };

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
          { mediaType: options?.mediaType },
        );
        if (!html) return null;
        if (
          (fallbackPlatform || options?.mediaType === "hardware") &&
          !isAcceptedPriceChartingDetailHtml(
            html,
            "",
            fallbackNames,
            fallbackPlatform,
            acceptOpts,
          )
        ) {
          return null;
        }
        return html;
      };

      let html = await loadPricedHtml(isPal);
      let prices = html
        ? await parsePriceChartingPricesFromHtmlAndPromote(html)
        : null;
      // EU shelves default to PAL, but older catalogs (Atari 2600, …) often have
      // empty PAL market tables ("-") while NTSC siblings are priced.
      if (!prices && isPal) {
        console.log(
          `[PriceCharting Prices] PAL page has no market prices for "${fallbackNames[0]}", trying NTSC`,
        );
        html = await loadPricedHtml(false);
        prices = html
          ? await parsePriceChartingPricesFromHtmlAndPromote(html)
          : null;
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

  // `type=prices` makes UPC/EAN hits redirect to the catalog fiche; without it
  // many barcodes stay on a search-results page that only links `/offers?product=`.
  const searchUrl = `https://www.pricecharting.com/search-products?q=${cleanedBarcode}&type=prices`;

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
          { mediaType: options?.mediaType },
        );
        if (!fallbackHtml) return null;
        html = fallbackHtml;
        resolvedViaNameFallback = true;
      } else {
        return null;
      }
    } else if (
      (fallbackPlatform || options?.mediaType === "hardware") &&
      fallbackNames.length > 0 &&
      !isAcceptedPriceChartingDetailHtml(
        html,
        finalUrl,
        fallbackNames.length > 0
          ? fallbackNames
          : Array.isArray(fallbackName)
            ? fallbackName
            : fallbackName,
        fallbackPlatform,
        acceptOpts,
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
        { mediaType: options?.mediaType },
      );
      if (!fallbackHtml) return null;
      html = fallbackHtml;
      resolvedViaNameFallback = true;
    }

    if (
      (fallbackPlatform ||
        (options?.mediaType === "hardware" && fallbackNames.length > 0)) &&
      !isAcceptedPriceChartingDetailHtml(
        html,
        finalUrl,
        fallbackNames.length > 0 ? fallbackNames : undefined,
        fallbackPlatform,
        resolvedViaNameFallback
          ? acceptOpts
          : options?.mediaType === "hardware"
            ? acceptOpts
            : undefined,
      )
    ) {
      return null;
    }

    const sourceUrl = resolvePriceChartingGamePageUrl(
      html,
      finalUrl.includes("/game/") ? finalUrl : null,
    );
    let prices = await parsePriceChartingPricesFromHtmlAndPromote(
      html,
      sourceUrl,
    );
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
        { mediaType: options?.mediaType },
      );
      if (
        ntscHtml &&
        (!fallbackPlatform ||
          isAcceptedPriceChartingDetailHtml(
            ntscHtml,
            "",
            fallbackNames,
            fallbackPlatform,
            { allowFranchiseStem: true, mediaType: options?.mediaType },
          ))
      ) {
        prices = await parsePriceChartingPricesFromHtmlAndPromote(ntscHtml);
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
  options?: { mediaType?: string | null },
): Promise<PriceChartingMetadata | null> {
  return runWithPriceChartingFetchStore(() =>
    fetchMetadataFromPriceChartingUncached(
      barcode,
      fallbackName,
      fallbackPlatform,
      isPal,
      isClassics,
      options,
    ),
  );
}

async function fetchMetadataFromPriceChartingUncached(
  barcode: string,
  fallbackName?: string,
  fallbackPlatform?: string,
  isPal?: boolean,
  isClassics?: boolean,
  options?: { mediaType?: string | null },
): Promise<PriceChartingMetadata | null> {
  const cleanedBarcode = barcode.replace(/[^\d]/g, "").trim();
  if (!cleanedBarcode) return null;
  const acceptOpts = {
    allowFranchiseStem: true as const,
    mediaType: options?.mediaType,
  };

  // `type=prices` makes UPC/EAN hits redirect to the catalog fiche; without it
  // many barcodes stay on a search-results page that only links `/offers?product=`.
  const searchUrl = `https://www.pricecharting.com/search-products?q=${cleanedBarcode}&type=prices`;

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
          { mediaType: options?.mediaType },
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
      (fallbackPlatform || options?.mediaType === "hardware") &&
      fallbackName &&
      !isAcceptedPriceChartingDetailHtml(
        html,
        finalUrl,
        fallbackName,
        fallbackPlatform,
        acceptOpts,
      )
    ) {
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
        { mediaType: options?.mediaType },
      );
      if (!fallbackHtml) return null;
      html = fallbackHtml;
      resolvedViaNameFallback = true;
    }

    const parsed = rejectMismatchedPriceChartingMetadata(
      parsePriceChartingDetailHtml(html, fallbackName),
      fallbackName,
      fallbackPlatform,
      resolvedViaNameFallback || options?.mediaType === "hardware"
        ? acceptOpts
        : undefined,
    );
    if (!parsed) return null;

    const url = resolvePriceChartingGamePageUrl(
      html,
      finalUrl.includes("/game/") ? finalUrl : null,
    );
    const prices = await parsePriceChartingPricesFromHtmlAndPromote(html, url);

    const base: PriceChartingMetadata = {
      ...parsed,
      barcode: parsed.barcode || cleanedBarcode,
      ...(url ? { url } : {}),
      ...(prices ? { prices } : {}),
    };
    // Barcode already confirmed the fiche — skip title-search rescue (slow /
    // deadline), but still try cheap hardware slug variants so PAL finish-rear
    // rows reach NTSC finish-front siblings (DS Lite White → white-…-ds-lite).
    return enrichPriceChartingMetadataWithSiblingRegion(base, {
      allowTitleSearchRescue: false,
      allowHardwareSlugVariants: options?.mediaType === "hardware",
    });
  } catch (error) {
    console.error(
      `[PriceCharting Metadata] Error fetching barcode ${cleanedBarcode}:`,
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}
