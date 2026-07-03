import { cleanSearchQuery, stripLegalMarkSymbols } from "@/lib/search/query";
import {
  buildBundleMetadataSearchQueries,
  bundleTitlePartsMatchCatalogTitle,
  isBoardGameBundleTitle,
  isBundleTitle,
} from "@/lib/metadata/bundleTitle";

export {
  bundleTitlePartsMatchCatalogTitle,
  isBoardGameBundleTitle,
  isBundleTitle,
};

export function formatBoardGamePlayerCount(
  min?: string | number | null,
  max?: string | number | null,
): string | undefined {
  const minValue =
    min != null && String(min).trim() !== "" ? String(min).trim() : undefined;
  const maxValue =
    max != null && String(max).trim() !== "" ? String(max).trim() : undefined;

  if (!minValue && !maxValue) return undefined;
  if (minValue && maxValue && minValue !== maxValue) {
    return `${minValue} à ${maxValue}`;
  }
  return minValue || maxValue;
}

export function normalizeBoardGamePlayerCount(value: string): string {
  const trimmed = value.trim();
  const rangeMatch = trimmed.match(/^(\d+)\s*(?:[-–—]|à|a)\s*(\d+)$/i);
  if (rangeMatch) {
    return `${rangeMatch[1]} à ${rangeMatch[2]}`;
  }
  return trimmed;
}

/**
 * Ordered retailer search queries for board-game metadata. The raw item name
 * stays first; shelf-aware expansions follow for bundle titles whose catalog
 * listing uses a different shape (e.g. "A/B" instead of "A + B").
 *
 * Queries are composed only from the item title and shelf name — never from
 * fixed product-line hints. See retailerMetadataLookup.ts for acceptance policy.
 */
export function buildBoardGameMetadataSearchQueries(
  name: string,
  shelfName?: string | null,
): string[] {
  const trimmed = name.trim();
  if (!trimmed) return [];

  const seen = new Set<string>();
  const ordered: string[] = [];

  const push = (value: string) => {
    const candidate =
      stripLegalMarkSymbols(value.replace(/\s+/g, " ").trim()) ||
      value.replace(/\s+/g, " ").trim();
    if (!candidate) return;
    const key = cleanSearchQuery(candidate).toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    ordered.push(candidate);
  };

  push(stripLegalMarkSymbols(trimmed) || trimmed);

  if (isBundleTitle(trimmed) || shelfName?.trim()) {
    for (const query of buildBundleMetadataSearchQueries(trimmed, shelfName)) {
      push(query);
    }
  }

  return ordered;
}
