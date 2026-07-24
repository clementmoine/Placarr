import { metadataTitleSimilarity } from "@/core/enrich/titleMatching";
import { METADATA_TITLE_ALIGN_FLOOR } from "@/core/enrich/titles/identityThresholds";
import {
  hasExplicitVolumeMarker,
  normalizeVolumeTitleText,
} from "@/core/enrich/titles/volumeNumber";
import { hardwareProductTitlesAlign } from "@/core/enrich/titles/residualIdentity";

function titleNumbers(value: string): string[] {
  return Array.from(
    new Set(normalizeVolumeTitleText(value).match(/\d+/g) || []),
  );
}

export type CatalogTitleAlignmentOptions = {
  shelfType?: string | null;
};

/** True when a catalog title plausibly refers to the same product as the item name. */
export function catalogTitleAlignedWithItem(
  query: string,
  title: string,
  options?: CatalogTitleAlignmentOptions,
): boolean {
  const cleanQuery = query.trim();
  const cleanTitle = title.trim();
  if (!cleanQuery || !cleanTitle) return true;

  if (options?.shelfType === "hardware") {
    // Same residual gate as price listings + gallery titles.
    return hardwareProductTitlesAlign(cleanQuery, cleanTitle);
  }

  const queryNumbers = titleNumbers(cleanQuery);
  const titleNumberSet = new Set(titleNumbers(cleanTitle));
  if (
    queryNumbers.length > 0 &&
    queryNumbers.some((number) => !titleNumberSet.has(number))
  ) {
    return false;
  }

  if (
    queryNumbers.length === 0 &&
    !hasExplicitVolumeMarker(cleanQuery) &&
    hasExplicitVolumeMarker(cleanTitle)
  ) {
    return false;
  }

  const q = normalizeVolumeTitleText(cleanQuery);
  const t = normalizeVolumeTitleText(cleanTitle);
  if (t.includes(q) && t !== q) {
    const suffix = t.slice(t.indexOf(q) + q.length).trim();
    // Keep generation digits ("Switch 2", "PlayStation 5") — length>2 used to
    // drop them and accept any sequel of a bare console stem.
    const suffixTokens = suffix
      .split(/\s+/)
      .filter((token) => token.length > 2 || /^\d+$/.test(token));
    if (suffixTokens.length === 1) {
      return false;
    }
  }
  return (
    q.includes(t) ||
    t.includes(q) ||
    metadataTitleSimilarity(q, t) >= METADATA_TITLE_ALIGN_FLOOR
  );
}

/** Path segments that are search/list chrome, not a product title slug. */
const NON_PRODUCT_PATH_SEGMENTS = new Set([
  "search",
  "search-products",
  "search-results",
  "results",
  "query",
]);

const UUID_PATH_SEGMENT =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LOCALE_PATH_SEGMENT = /^[a-z]{2}(-[a-z]{2})?$/i;

function isNonTitlePathSegment(segment: string): boolean {
  const cleaned = segment.trim().toLowerCase();
  if (!cleaned) return true;
  if (/^\d+$/.test(cleaned)) return true;
  if (UUID_PATH_SEGMENT.test(cleaned)) return true;
  // `/fr/search-products` and `/fr-fr/p/…` — locale is routing chrome.
  if (LOCALE_PATH_SEGMENT.test(cleaned)) return true;
  // Back Market `/p/{slug}/{uuid}` — the lone `p` is routing chrome.
  if (cleaned.length <= 1) return true;
  if (NON_PRODUCT_PATH_SEGMENTS.has(cleaned)) return true;
  return false;
}

function humanizeProductPathSlug(slug: string): string {
  return slug
    .replace(/^\d+-/, "")
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/\d{8,14}/g, " ")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function catalogTitleFromProductUrl(url: string): string | null {
  try {
    const pathname = new URL(url.trim()).pathname;
    const segments = pathname.split("/").filter(Boolean);
    // Prefer the rightmost readable slug. Retail PDPs often end with a UUID
    // (`/p/console-nintendo-wii-bleu/{uuid}`) — treating the UUID as a title
    // made purge drop honest Back Market fiche links.
    for (let index = segments.length - 1; index >= 0; index -= 1) {
      const segment = segments[index]!;
      if (isNonTitlePathSegment(segment)) continue;
      const title = humanizeProductPathSlug(segment);
      if (title) return title;
    }
    return null;
  } catch {
    return null;
  }
}

function sharedTitlePrefix(left: string, right: string): string {
  const leftTokens = normalizeVolumeTitleText(left)
    .split(/\s+/)
    .filter(Boolean);
  const rightTokens = normalizeVolumeTitleText(right)
    .split(/\s+/)
    .filter(Boolean);
  const shared: string[] = [];
  for (
    let index = 0;
    index < Math.min(leftTokens.length, rightTokens.length);
    index++
  ) {
    if (leftTokens[index] !== rightTokens[index]) break;
    shared.push(leftTokens[index]!);
  }
  return shared.join(" ");
}

function editionSuffixTokens(title: string, sharedPrefix: string): string[] {
  const normalized = normalizeVolumeTitleText(title);
  const prefix = normalizeVolumeTitleText(sharedPrefix);
  if (!prefix || !normalized.startsWith(prefix)) return [];
  return normalized
    .slice(prefix.length)
    .trim()
    .split(/\s+/)
    .filter((token) => token.length > 2 && !/^\d+$/.test(token));
}

function distinctEditionAfterSharedPrefix(
  itemTitle: string,
  catalogTitle: string,
): boolean {
  const sharedPrefix = sharedTitlePrefix(itemTitle, catalogTitle);
  if (
    !sharedPrefix ||
    normalizeVolumeTitleText(itemTitle) ===
      normalizeVolumeTitleText(catalogTitle)
  ) {
    return false;
  }

  const itemSuffix = editionSuffixTokens(itemTitle, sharedPrefix);
  const catalogSuffix = editionSuffixTokens(catalogTitle, sharedPrefix);
  if (itemSuffix.length === 0 || catalogSuffix.length === 0) return false;

  const catalogTokens = new Set(catalogSuffix);
  return !itemSuffix.some((token) => catalogTokens.has(token));
}

/** True when the item name denotes a more specific edition than the catalog entry. */
function itemTitleEditionBeyondCatalog(
  itemTitle: string,
  catalogTitle: string,
): boolean {
  const item = normalizeVolumeTitleText(itemTitle);
  const catalog = normalizeVolumeTitleText(catalogTitle);
  if (!item || !catalog || item === catalog) return false;
  if (!item.includes(catalog)) return false;

  const suffix = item.slice(item.indexOf(catalog) + catalog.length).trim();
  const suffixTokens = suffix
    .split(/\s+/)
    .filter((token) => token.length > 2 && /[a-z]/i.test(token));
  return suffixTokens.length > 0;
}

/** True when the catalog slug/title clearly denotes a different edition than the item. */
export function retailerCatalogTitleContradictsItem(input: {
  productUrl?: string | null;
  productTitle?: string | null;
  itemTitle?: string | null;
  shelfType?: string | null;
}): boolean {
  const itemTitle = input.itemTitle?.trim();
  const catalogTitle =
    input.productTitle?.trim() ||
    (input.productUrl ? catalogTitleFromProductUrl(input.productUrl) : null);
  if (!itemTitle || !catalogTitle) return false;

  // Hardware: residual already gates capacity/finish/form-factor (250Go ≡ 250GB,
  // Console chrome). Edition-suffix heuristics treat Go≠GB as distinct SKUs.
  if (input.shelfType === "hardware") {
    return !catalogTitleAlignedWithItem(itemTitle, catalogTitle, {
      shelfType: input.shelfType,
    });
  }

  if (itemTitleEditionBeyondCatalog(itemTitle, catalogTitle)) return true;
  if (distinctEditionAfterSharedPrefix(itemTitle, catalogTitle)) return true;

  const meaningfulTokens = catalogTitle
    .split(/\s+/)
    .filter((token) => token.length > 2 && /[a-z]/i.test(token));
  if (meaningfulTokens.length < 2) return false;

  return !catalogTitleAlignedWithItem(itemTitle, catalogTitle, {
    shelfType: input.shelfType,
  });
}
