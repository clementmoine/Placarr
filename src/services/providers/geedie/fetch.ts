import axios from "axios";

import {
  extractBaseTitleVariant,
  gameProductIdentityMismatch,
  isMetadataTitleAligned,
  metadataTitleMatchScore,
} from "@/lib/metadata/titleMatching";
import { detectVideoGamePlatformKey } from "@/lib/games/platforms";

const GEEDIE_BASE_URL = "https://geedie.lt";
const MAX_GEEDIE_GALLERY_FETCHES = 6;
const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9,fr;q=0.8",
};

export interface GeedieSearchHit {
  title: string;
  productUrl: string;
  thumbnailUrl: string;
}

export interface GeedieProduct {
  title: string;
  productUrl: string;
  coverUrl?: string | null;
  barcode?: string | null;
  productId?: string;
}

export interface GeedieGalleryItem {
  title: string;
  productUrl: string;
  coverUrl: string;
  role: string;
  barcode?: string | null;
}

export interface GeedieGalleryResult {
  title: string;
  productUrl: string;
  coverUrl?: string | null;
  barcode?: string | null;
  productId?: string;
  items: GeedieGalleryItem[];
}

function cleanQuery(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function uniqueQueries(queryOrQueries: string | string[]) {
  const queries = Array.isArray(queryOrQueries)
    ? queryOrQueries
    : [queryOrQueries];
  const seen = new Set<string>();
  return queries
    .map(cleanQuery)
    .filter((query) => {
      const key = query.toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 6);
}

function marketplaceCategory(platform?: string | null): string {
  const key = detectVideoGamePlatformKey(platform || "");
  if (
    key &&
    ["ps5", "ps4", "ps3", "ps2", "ps1", "psp", "psvita"].includes(key)
  ) {
    return "playstation";
  }
  if (key && key.startsWith("xbox")) return "xbox";
  if (
    key &&
    [
      "switch",
      "switch2",
      "wii",
      "wiiu",
      "nes",
      "snes",
      "n64",
      "gamecube",
      "ds",
      "3ds",
      "gb",
      "gbc",
      "gba",
    ].includes(key)
  ) {
    return "nintendo";
  }
  return "playstation";
}

export function upgradeGeedieImageUrl(url?: string | null): string | undefined {
  if (!url?.trim()) return undefined;
  const trimmed = url.trim();
  if (trimmed.startsWith("/")) {
    return `${GEEDIE_BASE_URL}${trimmed}`;
  }
  return trimmed.replace(/\/thumbnail$/, "/public");
}

function cleanGeedieSearchTitle(title: string): string {
  return title
    .replace(/&#039;/g, "'")
    .replace(/\s+cover$/i, "")
    .trim();
}

export function parseGeedieSearchResults(html: string): GeedieSearchHit[] {
  const hits: GeedieSearchHit[] = [];
  const seen = new Set<string>();

  const push = (thumbnailUrl: string, rawTitle: string, productUrl: string) => {
    const title = cleanGeedieSearchTitle(rawTitle);
    if (!title || !productUrl.includes("/en/")) return;
    const key = productUrl.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    hits.push({
      title,
      productUrl,
      thumbnailUrl: upgradeGeedieImageUrl(thumbnailUrl) || thumbnailUrl,
    });
  };

  for (const match of html.matchAll(
    /<img src="(https:\/\/imagedelivery\.net\/[^"]+)" alt="([^"]+)"[\s\S]*?<a href="(https:\/\/geedie\.lt\/en\/[^"#]+)" class="text-gray-700">/g,
  )) {
    push(match[1], match[2], match[3]);
  }

  for (const match of html.matchAll(
    /<img[^>]+src="([^"]+)"[^>]*alt="([^"]+)"[\s\S]{0,700}?<a href="(https:\/\/geedie\.lt\/en\/[^"#]+)" class="text-gray-700">/gi,
  )) {
    push(match[1], match[2], match[3]);
  }

  for (const match of html.matchAll(
    /<a href="(https:\/\/geedie\.lt\/en\/[^"#]+)" class="text-gray-700">[\s\S]*?>\s*([^<]+?)\s*<\/a>/gi,
  )) {
    const productUrl = match[1];
    const title = cleanGeedieSearchTitle(match[2]);
    if (!title || title.length < 4) continue;
    const blockStart = Math.max(0, (match.index ?? 0) - 900);
    const block = html.slice(blockStart, (match.index ?? 0) + match[0].length);
    const imageMatch = block.match(/<img[^>]+src="([^"]+)"[^>]*alt="([^"]*)"/i);
    push(imageMatch?.[1] || "", imageMatch?.[2] || title, productUrl);
  }

  return hits;
}

function platformSlugPrefix(platform?: string | null): string | null {
  const key = detectVideoGamePlatformKey(platform || "");
  if (!key) return null;
  if (key === "switch2") return "switch";
  return key;
}

const GEEDIE_SEARCH_TITLE_MIN_SCORE = 0.58;

function isGeedieHitPlatformCompatible(
  platform: string | undefined,
  hit: GeedieSearchHit,
): boolean {
  const requested = platformSlugPrefix(platform);
  if (!requested) return true;

  const slug = hit.productUrl.split("/").pop()?.toLowerCase() || "";
  const detected = detectVideoGamePlatformKey(`${hit.title} ${slug}`);
  if (!detected) return true;
  if (requested === detected) return true;
  if (
    (requested === "switch" || requested === "switch2") &&
    (detected === "switch" || detected === "switch2")
  ) {
    return true;
  }
  return false;
}

function geedieSearchHitMatchesRequestedTitle(
  alignmentNames: string[],
  hit: GeedieSearchHit,
): boolean {
  return isMetadataTitleAligned(
    { title: hit.title },
    alignmentNames,
    GEEDIE_SEARCH_TITLE_MIN_SCORE,
  );
}

function isGeedieHitAligned(
  alignmentNames: string[],
  platform: string | undefined,
  hit: GeedieSearchHit,
): boolean {
  if (!isGeedieHitPlatformCompatible(platform, hit)) return false;
  return (
    scoreSearchHit(alignmentNames, platform, hit) >= 0.52 &&
    geedieSearchHitMatchesRequestedTitle(alignmentNames, hit)
  );
}

function buildGeedieAlignmentNames(
  query: string,
  alignmentQueries: string[] = [],
): string[] {
  const names = uniqueQueries([query, ...alignmentQueries]);
  const expanded: string[] = [];
  for (const name of names) {
    expanded.push(name);
    const base = extractBaseTitleVariant(name);
    if (base) expanded.push(base);
  }
  return uniqueQueries(expanded);
}

function scoreSearchHit(
  alignmentNames: string[],
  platform: string | undefined,
  hit: GeedieSearchHit,
): number {
  if (
    alignmentNames.some((name) =>
      gameProductIdentityMismatch([name], hit.title),
    )
  ) {
    return -1;
  }

  let titleScore = 0;
  for (const name of alignmentNames) {
    titleScore = Math.max(
      titleScore,
      metadataTitleMatchScore({ title: hit.title }, [name]),
    );
  }

  const slug = hit.productUrl.split("/").pop()?.toLowerCase() || "";
  let score = titleScore;

  const prefix = platformSlugPrefix(platform);
  if (prefix) {
    const hitPlatform = detectVideoGamePlatformKey(`${hit.title} ${slug}`);
    if (slug.startsWith(`${prefix}-`) || slug.includes(`-${prefix}-`)) {
      score += 0.12;
    } else if (
      slug.startsWith("switch-") &&
      (prefix === "switch" || prefix === "switch2")
    ) {
      score += 0.08;
    } else if (hitPlatform && hitPlatform !== prefix) {
      score -= 0.35;
    } else if (/^(ps\d|xbox|switch|wii|3ds|ds)-/.test(slug)) {
      score -= 0.2;
    }
  }

  return score;
}

export function pickBestGeedieSearchHit(
  query: string,
  platform: string | undefined,
  hits: GeedieSearchHit[],
  alignmentQueries: string[] = [],
): GeedieSearchHit | null {
  const aligned = pickAlignedGeedieSearchHits(
    query,
    platform,
    hits,
    alignmentQueries,
    1,
  );
  return aligned[0] ?? null;
}

export function pickAlignedGeedieSearchHits(
  query: string,
  platform: string | undefined,
  hits: GeedieSearchHit[],
  alignmentQueries: string[] = [],
  limit = MAX_GEEDIE_GALLERY_FETCHES,
): GeedieSearchHit[] {
  if (hits.length === 0) return [];

  const alignmentNames = buildGeedieAlignmentNames(query, alignmentQueries);
  const ranked = hits
    .map((hit) => ({
      hit,
      score: scoreSearchHit(alignmentNames, platform, hit),
    }))
    .filter(
      (entry) =>
        entry.score >= 0.52 &&
        isGeedieHitPlatformCompatible(platform, entry.hit) &&
        geedieSearchHitMatchesRequestedTitle(alignmentNames, entry.hit),
    )
    .sort((a, b) => b.score - a.score);

  const selected: GeedieSearchHit[] = [];
  const seenUrls = new Set<string>();

  for (const entry of ranked) {
    const key = entry.hit.productUrl.toLowerCase();
    if (seenUrls.has(key)) continue;
    seenUrls.add(key);
    selected.push(entry.hit);
    if (selected.length >= limit) break;
  }

  return selected;
}

function pickBestSearchHit(
  query: string,
  platform: string | undefined,
  hits: GeedieSearchHit[],
  alignmentQueries: string[] = [],
): GeedieSearchHit | null {
  return pickBestGeedieSearchHit(query, platform, hits, alignmentQueries);
}

function slugifyGeedieTitle(title: string): string {
  return title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function buildGeedieBarcodeProductUrls(
  queries: string[],
  platform?: string,
  barcode?: string | null,
): string[] {
  const cleaned = (barcode || "").replace(/\D/g, "");
  if (cleaned.length < 12) return [];

  const prefix = platformSlugPrefix(platform);
  if (!prefix) return [];

  const urls = new Set<string>();
  for (const query of queries) {
    const slug = slugifyGeedieTitle(query);
    if (!slug) continue;
    urls.add(`${GEEDIE_BASE_URL}/en/${prefix}-${slug}-${cleaned}`);
    if (!slug.startsWith(`${prefix}-`)) {
      urls.add(`${GEEDIE_BASE_URL}/en/${prefix}-${slug}`);
    }
  }
  return [...urls];
}

function inferGeedieAttachmentRole(
  hit: GeedieSearchHit,
  product: GeedieProduct,
): string {
  const hay = `${hit.title} ${product.title} ${hit.productUrl}`;
  if (/\b(japan|japanese|jpn|asia)\b/i.test(hay)) return "jp";
  if (/\b(usa|us version|ntsc-u)\b/i.test(hay)) return "us";
  if (/\b(uk|united kingdom)\b/i.test(hay)) return "uk";
  if (/\b(french|france|\bfr\b)\b/i.test(hay)) return "fr";
  if (/\b(europe|european|pal|\beu\b)\b/i.test(hay)) return "eu";
  return "eu";
}

function dedupeGeedieSearchHits(hits: GeedieSearchHit[]): GeedieSearchHit[] {
  const seen = new Set<string>();
  const unique: GeedieSearchHit[] = [];
  for (const hit of hits) {
    const key = hit.productUrl.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(hit);
  }
  return unique;
}

async function resolveGeedieGalleryItem(
  hit: GeedieSearchHit,
  alignmentNames: string[],
  platform?: string,
): Promise<GeedieGalleryItem | null> {
  const detailed = await fetchGeedieProduct(hit.productUrl);
  const coverUrl =
    detailed?.coverUrl || upgradeGeedieImageUrl(hit.thumbnailUrl) || null;
  if (!coverUrl) return null;

  const product = detailed ?? {
    title: hit.title,
    productUrl: hit.productUrl,
    coverUrl,
  };

  const verificationHit: GeedieSearchHit = {
    title: product.title,
    productUrl: product.productUrl,
    thumbnailUrl: coverUrl,
  };
  if (!isGeedieHitAligned(alignmentNames, platform, verificationHit)) {
    return null;
  }

  return {
    title: product.title,
    productUrl: product.productUrl,
    coverUrl,
    role: inferGeedieAttachmentRole(hit, product),
    barcode: product.barcode ?? null,
  };
}

export function parseGeedieProductPage(html: string, productUrl: string): GeedieProduct | null {
  const jsonLdMatch = html.match(
    /<script type="application\/ld\+json">\s*(\{[\s\S]*?\})\s*<\/script>/,
  );
  if (!jsonLdMatch) return null;

  try {
    const payload = JSON.parse(jsonLdMatch[1]) as {
      name?: string;
      image?: string;
      gtin13?: string;
    };
    const title = payload.name?.trim();
    if (!title) return null;

    const imageFromJson = upgradeGeedieImageUrl(payload.image);
    const imageFromGallery = html.match(
      /currentImage:\s*'(https:\/\/imagedelivery\.net\/[^']+)'/,
    )?.[1];
    const collectableImage = html.match(
      /https:\/\/geedie\.lt\/storage\/collectables\/\d+\/[^"'\\]+/,
    )?.[0];

    return {
      title,
      productUrl,
      coverUrl:
        collectableImage ||
        upgradeGeedieImageUrl(imageFromGallery) ||
        imageFromJson ||
        null,
      barcode: payload.gtin13 || null,
      productId: productUrl.split("/").pop() || undefined,
    };
  } catch {
    return null;
  }
}

export async function searchGeedieProducts(
  query: string,
  platform?: string,
): Promise<GeedieSearchHit[]> {
  const category = marketplaceCategory(platform);
  const url = `${GEEDIE_BASE_URL}/en/marketplace/${category}?search=${encodeURIComponent(query)}`;
  const response = await axios.get<string>(url, {
    headers: HEADERS,
    timeout: 12_000,
    validateStatus: (status) => status < 500,
  });
  if (response.status >= 400 || !response.data) return [];
  return parseGeedieSearchResults(response.data);
}

export async function fetchGeedieProduct(
  productUrl: string,
): Promise<GeedieProduct | null> {
  const response = await axios.get<string>(productUrl, {
    headers: HEADERS,
    timeout: 12_000,
    validateStatus: (status) => status < 500,
  });
  if (response.status >= 400 || !response.data) return null;
  return parseGeedieProductPage(response.data, productUrl);
}

export async function fetchGeedieGallery(
  queryOrQueries: string | string[],
  platform?: string,
  barcode?: string | null,
): Promise<GeedieGalleryResult | null> {
  const queries = uniqueQueries(queryOrQueries);
  if (queries.length === 0) return null;

  const alignmentNames = buildGeedieAlignmentNames(queries[0], queries.slice(1));
  const items: GeedieGalleryItem[] = [];
  const seenCovers = new Set<string>();

  const pushItem = (item: GeedieGalleryItem) => {
    const coverKey = item.coverUrl.trim().toLowerCase();
    if (!coverKey || seenCovers.has(coverKey)) return;
    seenCovers.add(coverKey);
    items.push(item);
  };

  for (const productUrl of buildGeedieBarcodeProductUrls(
    queries,
    platform,
    barcode,
  )) {
    const product = await fetchGeedieProduct(productUrl);
    if (!product?.coverUrl) continue;
    const hit: GeedieSearchHit = {
      title: product.title,
      productUrl: product.productUrl,
      thumbnailUrl: product.coverUrl,
    };
    if (!isGeedieHitAligned(alignmentNames, platform, hit)) continue;
    pushItem({
      title: product.title,
      productUrl: product.productUrl,
      coverUrl: product.coverUrl,
      role: inferGeedieAttachmentRole(hit, product),
      barcode: product.barcode ?? null,
    });
  }

  const searchHits: GeedieSearchHit[] = [];
  for (const query of queries) {
    const hits = await searchGeedieProducts(query, platform);
    searchHits.push(...hits);
  }

  const alignedHits = pickAlignedGeedieSearchHits(
    queries[0],
    platform,
    dedupeGeedieSearchHits(searchHits),
    queries,
  );

  for (const hit of alignedHits) {
    if (items.length >= MAX_GEEDIE_GALLERY_FETCHES) break;
    const item = await resolveGeedieGalleryItem(hit, alignmentNames, platform);
    if (item) pushItem(item);
  }

  if (items.length === 0) return null;

  const primary = items[0];
  return {
    title: primary.title,
    productUrl: primary.productUrl,
    coverUrl: primary.coverUrl,
    barcode: primary.barcode ?? undefined,
    productId: primary.productUrl.split("/").pop(),
    items,
  };
}

export async function fetchFromGeedie(
  queryOrQueries: string | string[],
  platform?: string,
  barcode?: string | null,
): Promise<GeedieProduct | null> {
  const gallery = await fetchGeedieGallery(queryOrQueries, platform, barcode);
  if (!gallery) return null;

  return {
    title: gallery.title,
    productUrl: gallery.productUrl,
    coverUrl: gallery.coverUrl,
    barcode: gallery.barcode,
    productId: gallery.productId,
  };
}

export async function pingGeedie(): Promise<boolean> {
  try {
    const response = await axios.get(`${GEEDIE_BASE_URL}/en/marketplace/playstation`, {
      headers: HEADERS,
      timeout: 8_000,
      validateStatus: (status) => status < 500,
    });
    return response.status < 400;
  } catch {
    return false;
  }
}
