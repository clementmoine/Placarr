import axios from "axios";
import { decode as decodeHTMLEntities } from "html-entities";

import type { AttachmentType } from "@prisma/client";

import {
  metadataTitleMatchScore,
  extractBaseTitleVariant,
  gameProductIdentityMismatch,
  franchiseSequelNumbersConflict,
  isMetadataTitleAligned,
} from "@/lib/metadata/titleMatching";
import { resolveGameMetadataPlatform } from "@/lib/metadata/platform";
import { detectVideoGamePlatformKey } from "@/lib/games/platforms";

const ALGOLIA_APP_ID = "MQTBESKZQM";
const ALGOLIA_SEARCH_KEY = "b8aee761e824091520134191a14d5adc";
const ALGOLIA_INDEX = "prod_DEALS";
const ALGOLIA_URL = `https://${ALGOLIA_APP_ID}-dsn.algolia.net/1/indexes/${ALGOLIA_INDEX}/query`;

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
};

export interface ChocoBonPlanDealHit {
  title: string;
  url: string;
  image: string;
  objectID: string;
}

export interface ChocoBonPlanImage {
  url: string;
  type: AttachmentType;
  title?: string;
}

export interface ChocoBonPlanProduct {
  title: string;
  productUrl: string;
  coverUrl?: string | null;
  backgroundImageUrl?: string | null;
  description?: string | null;
  priceNew?: number;
  objectId?: string;
  attachments?: ChocoBonPlanImage[];
}

export interface ChocoBonPlanPrices {
  priceNew?: number;
  sourceUrl?: string;
  productName?: string;
  coverUrl?: string | null;
  matchedQuery?: string;
}

function cleanQuery(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function uniqueQueries(queryOrQueries: string | string[], limit = 8) {
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
    .slice(0, limit);
}

function euroToCents(value: string): number | null {
  const amount = Number(value.replace(/\s/g, "").replace(",", "."));
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return Math.round(amount * 100);
}

function stripHtml(value: string): string {
  return decodeHTMLEntities(
    value
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n\n")
      .replace(/<\/h\d>/gi, "\n\n")
      .replace(/<li>/gi, "• ")
      .replace(/<\/li>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/\n{3,}/g, "\n\n")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n[ \t]+/g, "\n")
      .trim(),
  );
}

function upgradeImageUrl(url?: string | null): string | undefined {
  if (!url?.trim()) return undefined;
  return url.replace(/-\d+x\d+(?=\.\w+$)/i, "");
}

function isChocoBonPlanProductImage(url: string): boolean {
  const lower = url.toLowerCase();
  if (!lower.includes("/wp-content/uploads/")) return false;
  if (lower.includes("header-mea")) return false;
  if (lower.includes("/assets/img/")) return false;
  if (lower.includes("badge-medaille")) return false;
  if (lower.includes("/medailles/")) return false;
  if (lower.includes("amazon-adsystem")) return false;
  if (lower.includes("google-play-badge") || lower.includes("apple-store-badge")) {
    return false;
  }
  if (lower.includes("logo") || lower.includes("favicon")) return false;
  return true;
}

function isChocoBonPlanProductImageAlt(alt: string): boolean {
  const lower = alt.toLowerCase().trim();
  if (!lower) return true;
  if (lower === "choco" || lower === "chocobonplan") return false;
  if (/^(ps\d|xbox|switch|jeux vidéo|participant|capitaine)$/i.test(lower)) {
    return false;
  }
  return true;
}

function isChocoBonPlanAuthorAvatar(url: string, alt: string): boolean {
  const trimmedAlt = alt.trim().replace(/\s+cover$/i, "").trim();
  if (!trimmedAlt) return false;
  const fileStem =
    url
      .split("/")
      .pop()
      ?.replace(/\.[a-z0-9]+$/i, "") ?? "";
  return fileStem.toLowerCase() === trimmedAlt.toLowerCase();
}

function isChocoBonPlanAuthorImageTag(tag: string): boolean {
  return /author__thumbnail|author__photo|class="avatar\b|class='avatar\b/i.test(
    tag,
  );
}

function stripChocoBonPlanAuthorBlocks(html: string): string {
  return html.replace(/<address class="author">[\s\S]*?<\/address>/gi, "");
}

function classifyChocoBonPlanImage(
  url: string,
  alt = "",
): AttachmentType {
  const hint = `${url} ${alt}`.toLowerCase();
  if (
    hint.includes("visuel-produit") ||
    hint.includes("visuel produit") ||
    /(?:^|[\s_-])produit(?:[\s_-]|$)/i.test(hint)
  ) {
    return "cover";
  }
  if (/-produit\.(?:png|jpe?g|webp)$/i.test(url)) {
    return "cover";
  }
  if (hint.includes("bon-plan-") || hint.includes("bon plan")) {
    return "cover";
  }
  if (hint.includes("pas-cher") && /\.(jpe?g|png|webp)$/i.test(url)) {
    return "cover";
  }
  if (
    /\bscreen-\d+\b/.test(hint) ||
    /\bscreenshot\b/.test(hint) ||
    /\bgameplay\b/.test(hint) ||
    /\bcapture\b/.test(hint)
  ) {
    return "screenshot";
  }
  if (hint.includes("visuel-slider") || hint.includes("slider")) {
    return "background";
  }
  if (/\/[\w-]+-(?:ps\d|xbox(?:-one)?|switch)\.(?:png|jpe?g|webp)$/i.test(url)) {
    return "cover";
  }
  if (hint.includes("poster") || hint.includes("artwork")) {
    return "artwork";
  }
  return "screenshot";
}

function pickLargestFromSrcset(srcset: string): string | undefined {
  let bestUrl: string | undefined;
  let bestWidth = 0;
  for (const entry of srcset.split(",")) {
    const match = entry.trim().match(/^(\S+)\s+(\d+)w$/);
    if (!match) continue;
    const width = Number(match[2]);
    if (width >= bestWidth) {
      bestWidth = width;
      bestUrl = match[1];
    }
  }
  return bestUrl;
}

function extractChocoBonPlanProductSection(html: string): string {
  return (
    html.match(
      /<article class="box-corner[^"]*box-bp"[\s\S]*?<!-- START_DESCRIPTION -->/i,
    )?.[0] ??
    html.match(
      /<article class="box-corner[^"]*box-bp"[\s\S]*?<\/article>/i,
    )?.[0] ??
    html.match(
      /<article class="box-corner[\s\S]*?<!-- START_DESCRIPTION -->/i,
    )?.[0] ??
    html.match(
      /<h1 class="box-corner__title"[\s\S]*?<!-- START_DESCRIPTION -->/i,
    )?.[0] ??
    ""
  );
}

export function filterChocoBonPlanImagesForProduct(
  images: ChocoBonPlanImage[],
  productTitle?: string,
): ChocoBonPlanImage[] {
  if (!productTitle?.trim()) return images;

  let filtered = images.filter((image) => {
    if (!image.title?.trim()) return true;
    if (gameProductIdentityMismatch([productTitle], image.title)) return false;
    if (franchiseSequelNumbersConflict([productTitle], image.title)) {
      return false;
    }
    return true;
  });
  if (filtered.length === 0) return [];

  const wantedKey = detectVideoGamePlatformKey(productTitle);
  if (!wantedKey) return filtered;

  const matching = filtered.filter((image) => {
    const imageKey = detectVideoGamePlatformKey(image.title || "");
    return !imageKey || imageKey === wantedKey;
  });
  return matching.length > 0 ? matching : filtered;
}

export function extractChocoBonPlanImages(html: string): ChocoBonPlanImage[] {
  const productGallerySection = stripChocoBonPlanAuthorBlocks(
    extractChocoBonPlanProductSection(html),
  );
  const descriptionBlock =
    html.match(
      /<!-- START_DESCRIPTION -->([\s\S]*?)<!-- END_DESCRIPTION -->/i,
    )?.[1] ?? "";

  const seen = new Set<string>();
  const images: ChocoBonPlanImage[] = [];

  const push = (rawUrl: string, alt = "") => {
    if (!isChocoBonPlanProductImageAlt(alt)) return;
    if (isChocoBonPlanAuthorAvatar(rawUrl, alt)) return;
    const url = upgradeImageUrl(rawUrl);
    if (!url || !isChocoBonPlanProductImage(url)) return;
    const key = url.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    images.push({
      url,
      type: classifyChocoBonPlanImage(url, alt),
      title: alt.trim() || undefined,
    });
  };

  for (const match of productGallerySection.matchAll(/<img\b[^>]*>/gi)) {
    const tag = match[0];
    if (isChocoBonPlanAuthorImageTag(tag)) continue;
    const lazySrc = tag.match(/data-lazy-src="([^"]+)"/i)?.[1];
    const alt = tag.match(/alt="([^"]*)"/i)?.[1] ?? "";
    if (lazySrc) push(lazySrc, alt);
    const srcset = tag.match(/data-lazy-srcset="([^"]+)"/i)?.[1];
    if (srcset) {
      const largest = pickLargestFromSrcset(srcset);
      if (largest) push(largest, alt);
    }
  }

  for (const match of productGallerySection.matchAll(
    /class="img-popin"\s+href="([^"]+)"/gi,
  )) {
    push(match[1]);
  }

  for (const match of productGallerySection.matchAll(
    /<a class="img-popin" href="([^"]+)"[\s\S]*?alt="([^"]*)"/gi,
  )) {
    push(match[1], match[2]);
  }

  for (const match of productGallerySection.matchAll(
    /<noscript><img[^>]+src="([^"]+)"[^>]*alt="([^"]*)"/gi,
  )) {
    push(match[1], match[2]);
  }

  for (const match of descriptionBlock.matchAll(
    /<a class="img-popin" href="([^"]+)"[\s\S]*?alt="([^"]*)"/gi,
  )) {
    push(match[1], match[2]);
  }

  const ogImage = html.match(/property="og:image" content="([^"]+)"/i)?.[1];
  if (ogImage && !images.some((image) => image.type === "cover")) {
    push(ogImage);
  }

  const cover = images.find((image) => image.type === "cover");
  const background = images.find((image) => image.type === "background");
  const ordered: ChocoBonPlanImage[] = [];
  if (cover) ordered.push(cover);
  if (background && background.url !== cover?.url) ordered.push(background);
  for (const image of images) {
    if (ordered.some((entry) => entry.url === image.url)) continue;
    ordered.push(image);
  }

  return ordered.slice(0, 16);
}

export async function searchChocoBonPlanDeals(
  query: string,
  hitsPerPage = 8,
): Promise<ChocoBonPlanDealHit[]> {
  const cleaned = cleanQuery(query);
  if (!cleaned) return [];

  const response = await axios.post<{ hits?: ChocoBonPlanDealHit[] }>(
    ALGOLIA_URL,
    { query: cleaned, hitsPerPage },
    {
      headers: {
        "Content-Type": "application/json",
        "X-Algolia-Application-Id": ALGOLIA_APP_ID,
        "X-Algolia-API-Key": ALGOLIA_SEARCH_KEY,
      },
      timeout: 6000,
      validateStatus: (status) => status >= 200 && status < 500,
    },
  );

  if (response.status >= 400) {
    console.warn(
      `[ChocoBonPlan] Algolia returned ${response.status} for query "${cleaned}"`,
    );
    return [];
  }

  return (response.data?.hits ?? []).filter(
    (hit) => hit.title?.trim() && hit.url?.trim(),
  );
}

function normalizeChocoBonPlanDealTitle(title: string): string {
  return title
    .replace(
      /\s+sur\s+(?:PS\d+|Xbox(?:\s+One|\s+Series)?|Switch|PC|Nintendo\s+Switch)\s*$/i,
      "",
    )
    .trim();
}

function expandChocoBonPlanAbbreviations(name: string): string[] {
  const extras: string[] = [];
  if (
    /\bdm\s*c\b|\bdmc\b/i.test(name) &&
    /devil may cry/i.test(name) &&
    /definitive/i.test(name)
  ) {
    extras.push("DMC Definitive Edition");
  }
  return extras;
}

function buildChocoBonPlanAlignmentNames(
  queries: string[],
  expectedNames: string[],
): string[] {
  const names = uniqueQueries([...queries, ...expectedNames]);
  const expanded: string[] = [];
  for (const name of names) {
    expanded.push(name);
    for (const alias of expandChocoBonPlanAbbreviations(name)) {
      expanded.push(alias);
    }
    const base = extractBaseTitleVariant(name);
    if (base) expanded.push(base);
  }
  return uniqueQueries(expanded);
}

function chocoBonPlanAbbreviatedListingMatch(
  hitTitle: string,
  alignmentNames: string[],
): boolean {
  if (!/\bdmc\b/i.test(hitTitle)) return false;
  return alignmentNames.some(
    (name) =>
      /\bdm\s*c\b|\bdmc\b/i.test(name) &&
      /devil may cry/i.test(name) &&
      /definitive/i.test(name),
  );
}

function chocoBonPlanHitIsEligible(
  hitTitle: string,
  alignmentNames: string[],
  titleScore: number,
  sequelPenalty: number,
): boolean {
  if (
    alignmentNames.some((name) =>
      gameProductIdentityMismatch([name], hitTitle),
    )
  ) {
    return false;
  }
  if (
    alignmentNames.some((name) =>
      franchiseSequelNumbersConflict([name], hitTitle),
    )
  ) {
    return false;
  }
  if (sequelPenalty <= -0.9) return false;
  if (
    isMetadataTitleAligned({ title: hitTitle }, alignmentNames, 0.58)
  ) {
    return true;
  }
  if (
    chocoBonPlanAbbreviatedListingMatch(hitTitle, alignmentNames) &&
    titleScore >= 0.42
  ) {
    return true;
  }
  if (sequelPenalty < 0) return false;
  return isMetadataTitleAligned({ title: hitTitle }, alignmentNames, 0.42);
}

function chocoBonPlanHitMatchesRequestedTitle(
  hitTitle: string,
  alignmentNames: string[],
): boolean {
  const titleScore = scoreChocoBonPlanHit(hitTitle, alignmentNames);
  const sequelPenalty = chocoBonPlanMainlineSequelPenalty(
    { title: hitTitle, url: "", image: "", objectID: "" },
    alignmentNames,
  );
  return chocoBonPlanHitIsEligible(
    hitTitle,
    alignmentNames,
    titleScore,
    sequelPenalty,
  );
}

function chocoBonPlanMinimumScore(
  hitTitle: string,
  alignmentNames: string[],
  titleScore: number,
): number {
  if (
    isMetadataTitleAligned({ title: hitTitle }, alignmentNames, 0.58)
  ) {
    return 0.42;
  }
  if (
    chocoBonPlanAbbreviatedListingMatch(hitTitle, alignmentNames) &&
    titleScore >= 0.42
  ) {
    return 0.42;
  }
  return 0.58;
}

function chocoBonPlanMainlineSequelPenalty(
  hit: ChocoBonPlanDealHit,
  alignmentNames: string[],
): number {
  const normalized = normalizeChocoBonPlanDealTitle(hit.title);
  const sequelMatch = normalized.match(/\bdevil may cry\s+(\d+)\b/i);
  if (!sequelMatch) return 0;

  const wantsDmCReboot = alignmentNames.some(
    (name) =>
      /\bdm\s*c\b|\bdmc\b/i.test(name) &&
      /devil may cry/i.test(name) &&
      !/\bdevil may cry\s+\d+\b/i.test(name),
  );
  if (wantsDmCReboot) return -1;

  if (chocoBonPlanHitMatchesRequestedTitle(hit.title, alignmentNames)) {
    return 0;
  }

  const sequel = sequelMatch[1];
  if (
    !alignmentNames.some((name) =>
      new RegExp(`\\bdevil may cry\\s+${sequel}\\b`, "i").test(name),
    )
  ) {
    return -0.5;
  }

  return 0;
}

function scoreChocoBonPlanHit(
  hitTitle: string,
  alignmentNames: string[],
): number {
  const normalized = normalizeChocoBonPlanDealTitle(hitTitle);
  let best = 0;
  for (const name of alignmentNames) {
    best = Math.max(
      best,
      metadataTitleMatchScore({ title: hitTitle }, [name]),
      metadataTitleMatchScore({ title: normalized }, [name]),
    );
    const base = extractBaseTitleVariant(name) || name;
    best = Math.max(
      best,
      metadataTitleMatchScore({ title: normalized }, [base]),
    );
  }
  return best;
}

function wantedPlatformFromAlignmentNames(
  alignmentNames: string[],
): string | undefined {
  for (const name of alignmentNames) {
    const key = detectVideoGamePlatformKey(name);
    if (key) return key;
    const sur = name.match(/\bsur\s+(.+)$/i)?.[1]?.trim();
    if (sur) {
      const surKey = detectVideoGamePlatformKey(sur);
      if (surKey) return surKey;
    }
  }
  return undefined;
}

function hitPlatformKeys(hit: ChocoBonPlanDealHit): Set<string> {
  const keys = new Set<string>();
  for (const value of [hit.title, hit.url.replace(/-/g, " ")]) {
    const key = detectVideoGamePlatformKey(value);
    if (key) keys.add(key);
  }
  return keys;
}

function chocoBonPlanPlatformBoost(
  hit: ChocoBonPlanDealHit,
  alignmentNames: string[],
): number {
  const wantedPlatform = wantedPlatformFromAlignmentNames(alignmentNames);
  if (!wantedPlatform) return 0;

  const hitPlatforms = hitPlatformKeys(hit);
  const hay = `${hit.title} ${hit.url}`.toLowerCase();
  const mentionsWantedPlatform =
    hitPlatforms.has(wantedPlatform) ||
    (wantedPlatform === "ps4" && /\bps4\b/i.test(hay)) ||
    (wantedPlatform === "ps5" && /\bps5\b/i.test(hay)) ||
    (wantedPlatform === "ps3" && /\bps3\b/i.test(hay)) ||
    (wantedPlatform.startsWith("xbox") && /\bxbox\b/i.test(hay)) ||
    (wantedPlatform.startsWith("switch") && /\bswitch\b/i.test(hay));

  if (mentionsWantedPlatform) {
    if (wantedPlatform === "ps4" && /\bxbox\b/.test(hay) && !/\bps4\b/.test(hay)) {
      return -0.25;
    }
    if (wantedPlatform === "ps4" && /\bpc\b/.test(hay) && !/\bps4\b/.test(hay)) {
      return -0.25;
    }
    return 0.12;
  }

  if (hitPlatforms.size > 0) {
    return -0.35;
  }

  return 0;
}

function chocoBonPlanProductIdentityPenalty(
  hit: ChocoBonPlanDealHit,
  alignmentNames: string[],
): number {
  if (
    alignmentNames.some((name) =>
      gameProductIdentityMismatch([name], hit.title),
    )
  ) {
    return -1;
  }
  return 0;
}

function chocoBonPlanEditionPenalty(
  hit: ChocoBonPlanDealHit,
  alignmentNames: string[],
): number {
  const hay = `${hit.title} ${hit.url}`.toLowerCase();
  const wantsDeluxe = alignmentNames.some((name) => /\bdeluxe\b/i.test(name));
  const wantsCollector = alignmentNames.some((name) => /\bcollector\b/i.test(name));
  if (wantsDeluxe && /\bcollector\b/i.test(hay) && !/\bdeluxe\b/i.test(hay)) {
    return -0.2;
  }
  if (wantsCollector && /\bdeluxe\b/i.test(hay) && !/\bcollector\b/i.test(hay)) {
    return -0.2;
  }
  return 0;
}

function orderChocoBonPlanSearchQueries(
  queries: string[],
  platform?: string,
): string[] {
  if (!platform) return queries;
  const platformKey = platform.toLowerCase();
  const prioritized: string[] = [];
  const rest: string[] = [];
  for (const query of queries) {
    const lower = query.toLowerCase();
    if (
      lower.includes(platformKey) ||
      lower.includes(`sur ${platformKey}`) ||
      lower.includes(`sur ${platform.toUpperCase()}`)
    ) {
      prioritized.push(query);
    } else {
      rest.push(query);
    }
  }
  return [...prioritized, ...rest];
}

export function pickRelevantChocoBonPlanHit(
  query: string,
  hits: ChocoBonPlanDealHit[],
  expectedNames: string[] = [],
): ChocoBonPlanDealHit | null {
  const alignmentNames = buildChocoBonPlanAlignmentNames(
    [query],
    expectedNames,
  );
  let best: ChocoBonPlanDealHit | null = null;
  let bestScore = 0;

  for (const hit of hits) {
    const sequelPenalty = chocoBonPlanMainlineSequelPenalty(hit, alignmentNames);
    const titleScore = scoreChocoBonPlanHit(hit.title, alignmentNames);
    const eligible = chocoBonPlanHitIsEligible(
      hit.title,
      alignmentNames,
      titleScore,
      sequelPenalty,
    );
    if (!eligible) {
      continue;
    }

    const score =
      titleScore +
      chocoBonPlanPlatformBoost(hit, alignmentNames) +
      chocoBonPlanEditionPenalty(hit, alignmentNames) +
      chocoBonPlanProductIdentityPenalty(hit, alignmentNames) +
      sequelPenalty;
    const minScore = chocoBonPlanMinimumScore(
      hit.title,
      alignmentNames,
      titleScore,
    );
    if (score < minScore || score <= bestScore) continue;
    best = hit;
    bestScore = score;
  }

  return best;
}

function isChocoBonPlanProductPlatformCompatible(
  productTitle: string | undefined,
  platform?: string | null,
): boolean {
  const requested = detectVideoGamePlatformKey(platform || "");
  if (!requested || !productTitle) return true;

  const detected = detectVideoGamePlatformKey(productTitle);
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

export function parseChocoBonPlanProductPage(html: string): {
  title?: string;
  description?: string;
  coverUrl?: string;
  backgroundImageUrl?: string;
  priceNew?: number;
  attachments?: ChocoBonPlanImage[];
} {
  const h1Match = html.match(
    /<h1 class="box-corner__title"[^>]*>\s*([\s\S]*?)\s*<\/h1>/i,
  );
  const title = h1Match
    ? stripHtml(h1Match[1]).replace(/\s+/g, " ").trim()
    : undefined;

  const descriptionBlock = html.match(
    /<!-- START_DESCRIPTION -->([\s\S]*?)<!-- END_DESCRIPTION -->/i,
  );
  const description = descriptionBlock
    ? stripHtml(descriptionBlock[1])
    : html.match(/property="og:description" content="([^"]+)"/i)?.[1]
      ? decodeHTMLEntities(
          html.match(/property="og:description" content="([^"]+)"/i)![1],
        )
      : undefined;

  const ogImage = html.match(/property="og:image" content="([^"]+)"/i)?.[1];
  const priceMatch = html.match(
    /class="price__promotion[^"]*">\s*([\d\s.,]+)\s*€/i,
  );
  const attachments = filterChocoBonPlanImagesForProduct(
    extractChocoBonPlanImages(html),
    title,
  );
  const coverFromAttachments = attachments.find((image) => image.type === "cover");
  const backgroundFromAttachments = attachments.find(
    (image) => image.type === "background",
  );

  return {
    title,
    description: description?.trim() || undefined,
    coverUrl: coverFromAttachments?.url || upgradeImageUrl(ogImage),
    backgroundImageUrl: backgroundFromAttachments?.url,
    priceNew: priceMatch ? (euroToCents(priceMatch[1]) ?? undefined) : undefined,
    attachments,
  };
}

export async function fetchChocoBonPlanProductPage(
  url: string,
): Promise<ReturnType<typeof parseChocoBonPlanProductPage>> {
  const response = await axios.get(url, {
    headers: HEADERS,
    timeout: 8000,
    validateStatus: (status) => status >= 200 && status < 400,
  });
  return parseChocoBonPlanProductPage(String(response.data ?? ""));
}

export async function fetchFromChocoBonPlan(
  queryOrQueries: string | string[],
  expectedNames: string[] = [],
  options?: { platform?: string | null; shelfName?: string | null },
): Promise<ChocoBonPlanProduct | null> {
  const baseQueries = uniqueQueries(queryOrQueries);
  const platform = resolveGameMetadataPlatform(
    options?.platform,
    options?.shelfName,
    "games",
  );
  const expandedQueries = orderChocoBonPlanSearchQueries(
    uniqueQueries([
      ...baseQueries,
      ...baseQueries.flatMap((query) => {
        const variants = [query];
        const base = extractBaseTitleVariant(query);
        if (base) variants.push(base);
        if (platform) {
          variants.push(`${query} ${platform}`);
          if (base) variants.push(`${base} ${platform}`);
          variants.push(`${base || query} sur ${platform.toUpperCase()}`);
        }
        return variants;
      }),
    ]),
    platform,
  );
  if (expandedQueries.length === 0) return null;

  for (const query of expandedQueries) {
    try {
      const hits = await searchChocoBonPlanDeals(query);
      const hit = pickRelevantChocoBonPlanHit(query, hits, [
        ...expectedNames,
        ...expandedQueries,
      ]);
      if (!hit) continue;

      const page = await fetchChocoBonPlanProductPage(hit.url);
      const resolvedTitle = page.title || hit.title;
      if (
        !isChocoBonPlanProductPlatformCompatible(resolvedTitle, platform)
      ) {
        continue;
      }
      const attachments = page.attachments ?? [];
      const coverFromPage = attachments.find((image) => image.type === "cover");
      const coverUrl =
        coverFromPage?.url ||
        page.coverUrl ||
        upgradeImageUrl(hit.image) ||
        hit.image ||
        null;

      return {
        title: page.title || hit.title,
        productUrl: hit.url,
        coverUrl,
        backgroundImageUrl: page.backgroundImageUrl,
        description: page.description,
        priceNew: page.priceNew,
        objectId: hit.objectID,
        attachments,
      };
    } catch (error) {
      console.error(
        `[ChocoBonPlan] Error fetching "${query}": ${
          error instanceof Error ? error.message : error
        }`,
      );
    }
  }

  return null;
}

export async function fetchPricesFromChocoBonPlan(
  queryOrQueries: string | string[],
): Promise<ChocoBonPlanPrices | null> {
  const queries = uniqueQueries(queryOrQueries);
  if (queries.length === 0) return null;

  for (const query of queries) {
    const product = await fetchFromChocoBonPlan(query, queries);
    if (!product?.priceNew) continue;
    return {
      priceNew: product.priceNew,
      sourceUrl: product.productUrl,
      productName: product.title,
      coverUrl: product.coverUrl,
      matchedQuery: query,
    };
  }

  return null;
}

export async function pingChocoBonPlan(): Promise<{
  ok: boolean;
  latency: number | null;
  error: string | null;
}> {
  const start = Date.now();
  try {
    const hits = await searchChocoBonPlanDeals("mario", 1);
    return {
      ok: hits.length > 0,
      latency: Date.now() - start,
      error: hits.length > 0 ? null : "No Algolia hits",
    };
  } catch (error) {
    return {
      ok: false,
      latency: Date.now() - start,
      error: error instanceof Error ? error.message : "ChocoBonPlan unreachable",
    };
  }
}
