import type { Condition } from "@/generated/prisma/browser";

import { isItemCondition } from "@/core/collect/condition";
import {
  getItemValueEstimate,
  type ItemValueEstimate,
} from "@/core/collect/value";
import { getItemRatingScore10 } from "@/core/collect/rating";
import type { MetadataFact } from "@/types/metadataProvider";
import { compareTitlesForSort } from "@/core/enrich/titles/sort";
import { comparePrintKeys } from "@/core/identify/printKey";
import { usesPrintSearch } from "@/lib/printSearchTypes";
import type { ItemWithMetadata } from "@/types/items";

export type ItemCollectionSort =
  | "name_asc"
  | "name_desc"
  | "print_asc"
  | "print_desc"
  | "added_desc"
  | "added_asc"
  | "release_desc"
  | "release_asc"
  | "rating_desc"
  | "rating_asc"
  | "price_desc"
  | "price_asc";

export type ItemCollectionFilters = {
  condition: Condition | "all";
  ratingMin: number | null;
  pricedOnly: boolean;
};

export const DEFAULT_ITEM_COLLECTION_FILTERS: ItemCollectionFilters = {
  condition: "all",
  ratingMin: null,
  pricedOnly: false,
};

const BASE_ITEM_COLLECTION_SORT_OPTIONS: ItemCollectionSort[] = [
  "name_asc",
  "name_desc",
  "added_desc",
  "added_asc",
  "release_desc",
  "release_asc",
  "rating_desc",
  "rating_asc",
  "price_desc",
  "price_asc",
];

/** All known sort keys (including print binder order). */
export const ITEM_COLLECTION_SORT_OPTIONS: ItemCollectionSort[] = [
  "print_asc",
  "print_desc",
  ...BASE_ITEM_COLLECTION_SORT_OPTIONS,
];

/**
 * Sort menu for a shelf: binder order (set → number) only when the shelf
 * identifies by print, otherwise the usual media sorts.
 */
export function itemCollectionSortOptions(
  shelfType?: string | null,
): ItemCollectionSort[] {
  if (usesPrintSearch(shelfType)) {
    return ["print_asc", "print_desc", ...BASE_ITEM_COLLECTION_SORT_OPTIONS];
  }
  return BASE_ITEM_COLLECTION_SORT_OPTIONS;
}
export const ITEM_COLLECTION_RATING_MIN_OPTIONS = [6, 7, 8, 9] as const;

function metadataFacts(
  facts: string | MetadataFact[] | null | undefined,
): MetadataFact[] | null | undefined {
  if (facts == null || typeof facts !== "string") return facts;
  try {
    const parsed = JSON.parse(facts);
    return Array.isArray(parsed) ? (parsed as MetadataFact[]) : null;
  } catch {
    return null;
  }
}

function itemRatingScore(item: ItemWithMetadata): number | null {
  return getItemRatingScore10(metadataFacts(item.metadata?.facts));
}

function itemValueEstimate(
  item: ItemWithMetadata,
  shelfType?: string | null,
): ItemValueEstimate | null {
  return getItemValueEstimate({
    condition: item.condition,
    shelfType: shelfType ?? item.shelf?.type,
    variant: item.variant,
    priceNew: item.priceNew,
    priceFoil: item.priceFoil,
    priceUsed: item.priceUsed,
    priceUsedCIB: item.priceUsedCIB,
    priceEstimated: item.priceEstimated,
    priceEstimatedFoil: item.priceEstimatedFoil,
  });
}

function itemEstimatedPriceCents(
  item: ItemWithMetadata,
  shelfType?: string | null,
): number | null {
  return itemValueEstimate(item, shelfType)?.cents ?? null;
}

export function filterCollectionItems(
  items: ItemWithMetadata[],
  filters: ItemCollectionFilters,
  shelfType?: string | null,
): ItemWithMetadata[] {
  return items.filter((item) => {
    if (filters.condition !== "all" && item.condition !== filters.condition) {
      return false;
    }

    if (filters.ratingMin !== null) {
      const rating = itemRatingScore(item);
      if (rating === null || rating < filters.ratingMin) return false;
    }

    if (filters.pricedOnly) {
      const price = itemEstimatedPriceCents(item, shelfType);
      if (price === null || price <= 0) return false;
    }

    return true;
  });
}

export function sortCollectionItems(
  items: ItemWithMetadata[],
  sortBy: ItemCollectionSort,
  shelfType?: string | null,
): ItemWithMetadata[] {
  return [...items].sort((a, b) => {
    switch (sortBy) {
      case "name_desc":
        return compareTitlesForSort(a.name, b.name, "desc");
      case "print_asc": {
        const print = comparePrintKeys(a.printKey, b.printKey);
        return print || compareTitlesForSort(a.name, b.name);
      }
      case "print_desc": {
        const print = comparePrintKeys(b.printKey, a.printKey);
        return print || compareTitlesForSort(a.name, b.name, "desc");
      }
      case "added_desc":
        return (
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
      case "added_asc":
        return (
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        );
      case "release_desc": {
        const timeA = a.metadata?.releaseDate
          ? new Date(a.metadata.releaseDate).getTime()
          : 0;
        const timeB = b.metadata?.releaseDate
          ? new Date(b.metadata.releaseDate).getTime()
          : 0;
        return timeB - timeA;
      }
      case "release_asc": {
        const timeA = a.metadata?.releaseDate
          ? new Date(a.metadata.releaseDate).getTime()
          : 9999999999999;
        const timeB = b.metadata?.releaseDate
          ? new Date(b.metadata.releaseDate).getTime()
          : 9999999999999;
        return timeA - timeB;
      }
      case "rating_desc": {
        const ratingA = itemRatingScore(a) ?? -1;
        const ratingB = itemRatingScore(b) ?? -1;
        return ratingB - ratingA || compareTitlesForSort(a.name, b.name);
      }
      case "rating_asc": {
        const ratingA = itemRatingScore(a) ?? 999;
        const ratingB = itemRatingScore(b) ?? 999;
        return ratingA - ratingB || compareTitlesForSort(a.name, b.name);
      }
      case "price_desc": {
        const priceA = itemEstimatedPriceCents(a, shelfType) ?? -1;
        const priceB = itemEstimatedPriceCents(b, shelfType) ?? -1;
        return priceB - priceA || compareTitlesForSort(a.name, b.name);
      }
      case "price_asc": {
        const priceA = itemEstimatedPriceCents(a, shelfType) ?? 999999999;
        const priceB = itemEstimatedPriceCents(b, shelfType) ?? 999999999;
        return priceA - priceB || compareTitlesForSort(a.name, b.name);
      }
      case "name_asc":
      default:
        return compareTitlesForSort(a.name, b.name);
    }
  });
}

export function queryCollectionItems(
  items: ItemWithMetadata[],
  options: {
    sortBy: ItemCollectionSort;
    filters?: ItemCollectionFilters;
    shelfType?: string | null;
  },
): ItemWithMetadata[] {
  const filtered = filterCollectionItems(
    items,
    options.filters ?? DEFAULT_ITEM_COLLECTION_FILTERS,
    options.shelfType,
  );
  return sortCollectionItems(filtered, options.sortBy, options.shelfType);
}

export type CollectionValueSummary = {
  /** Total in euros (not cents), matching the historical return unit. */
  total: number;
  /** True when at least one item contributes through a catalog estimate (~). */
  includesEstimates: boolean;
};

export function summarizeCollectionEstimatedValue(
  items: ItemWithMetadata[],
  shelfType?: string | null,
): CollectionValueSummary {
  let totalCents = 0;
  let includesEstimates = false;
  for (const item of items) {
    const value = itemValueEstimate(item, shelfType);
    if (!value) continue;
    totalCents += value.cents;
    if (value.isEstimate) includesEstimates = true;
  }
  return { total: totalCents / 100, includesEstimates };
}

export function sumCollectionEstimatedValue(
  items: ItemWithMetadata[],
  shelfType?: string | null,
): number {
  return summarizeCollectionEstimatedValue(items, shelfType).total;
}

export function parseItemCollectionSort(
  value: string | null | undefined,
): ItemCollectionSort {
  if (
    value &&
    ITEM_COLLECTION_SORT_OPTIONS.includes(value as ItemCollectionSort)
  ) {
    return value as ItemCollectionSort;
  }
  return "name_asc";
}

export function parseItemCollectionFilters(searchParams: {
  get: (key: string) => string | null;
}): ItemCollectionFilters {
  const conditionParam = searchParams.get("condition");
  const condition: ItemCollectionFilters["condition"] = isItemCondition(
    conditionParam,
  )
    ? conditionParam
    : "all";

  const ratingParam = searchParams.get("ratingMin");
  const parsedRating = ratingParam ? Number(ratingParam) : NaN;
  const ratingMin = ITEM_COLLECTION_RATING_MIN_OPTIONS.includes(
    parsedRating as (typeof ITEM_COLLECTION_RATING_MIN_OPTIONS)[number],
  )
    ? parsedRating
    : null;

  const pricedParam = searchParams.get("priced");
  const pricedOnly = pricedParam === "1" || pricedParam === "true";

  return { condition, ratingMin, pricedOnly };
}

export function hasActiveCollectionFilters(
  filters: ItemCollectionFilters,
): boolean {
  return (
    filters.condition !== "all" ||
    filters.ratingMin !== null ||
    filters.pricedOnly
  );
}

export function collectionFiltersToSearchParams(
  filters: ItemCollectionFilters,
): Record<string, string | null> {
  return {
    condition: filters.condition === "all" ? null : filters.condition,
    ratingMin: filters.ratingMin === null ? null : String(filters.ratingMin),
    priced: filters.pricedOnly ? "1" : null,
  };
}
