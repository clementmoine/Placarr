import { metadataTitleSimilarity } from "@/core/enrich/titleMatching";
import {
  hasExplicitVolumeMarker,
  normalizeVolumeTitleText,
} from "@/core/enrich/titles/volumeNumber";

function titleNumbers(value: string): string[] {
  return Array.from(
    new Set(normalizeVolumeTitleText(value).match(/\d+/g) || []),
  );
}

/** True when a catalog title plausibly refers to the same product as the item name. */
export function catalogTitleAlignedWithItem(
  query: string,
  title: string,
): boolean {
  const cleanQuery = query.trim();
  const cleanTitle = title.trim();
  if (!cleanQuery || !cleanTitle) return true;

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
    const suffixTokens = suffix
      .split(/\s+/)
      .filter((token) => token.length > 2);
    if (suffixTokens.length === 1) {
      return false;
    }
  }
  return (
    q.includes(t) || t.includes(q) || metadataTitleSimilarity(q, t) >= 0.45
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

export function catalogTitleFromProductUrl(url: string): string | null {
  try {
    const pathname = new URL(url.trim()).pathname;
    const slug = pathname.split("/").filter(Boolean).pop();
    if (!slug || /^\d+$/.test(slug)) return null;
    // PriceCharting catalog chips use /fr/search-products?q=… — the last path
    // segment is "search-products", not a game title. Treating it as one made
    // purgeContradictedProviderExternalLinks drop the honest search link.
    if (NON_PRODUCT_PATH_SEGMENTS.has(slug.toLowerCase())) return null;
    return slug
      .replace(/^\d+-/, "")
      .replace(/\.[a-z0-9]+$/i, "")
      .replace(/\d{8,14}/g, " ")
      .replace(/[-_]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
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
}): boolean {
  const itemTitle = input.itemTitle?.trim();
  const catalogTitle =
    input.productTitle?.trim() ||
    (input.productUrl ? catalogTitleFromProductUrl(input.productUrl) : null);
  if (!itemTitle || !catalogTitle) return false;

  if (itemTitleEditionBeyondCatalog(itemTitle, catalogTitle)) return true;
  if (distinctEditionAfterSharedPrefix(itemTitle, catalogTitle)) return true;

  const meaningfulTokens = catalogTitle
    .split(/\s+/)
    .filter((token) => token.length > 2 && /[a-z]/i.test(token));
  if (meaningfulTokens.length < 2) return false;

  return !catalogTitleAlignedWithItem(itemTitle, catalogTitle);
}
