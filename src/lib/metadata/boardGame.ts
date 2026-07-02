import { cleanSearchQuery } from "@/lib/search/query";
import { normalizeDisplayTitle } from "@/lib/title/displayScore";
import { titleTokenPresentInSet } from "@/lib/title/tokenEquivalents";

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

const TITLE_STOP_WORDS = new Set([
  "le",
  "la",
  "les",
  "l",
  "du",
  "de",
  "des",
  "d",
  "un",
  "une",
  "au",
  "aux",
  "the",
  "and",
  "or",
  "a",
]);

function distinctiveTokens(value: string): string[] {
  return normalizeDisplayTitle(value).filter(
    (token) => token.length >= 3 && !TITLE_STOP_WORDS.has(token),
  );
}

function shelfAlreadyInTitle(shelfName: string, title: string): boolean {
  const shelfTokens = distinctiveTokens(shelfName);
  if (shelfTokens.length === 0) return false;
  const titleTokenSet = new Set(distinctiveTokens(title));
  return shelfTokens.every((token) =>
    titleTokenPresentInSet(token, titleTokenSet),
  );
}

function splitBundleTitle(name: string): string[] {
  return name
    .split(/\s*\+\s*/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function isBundleTitle(name: string): boolean {
  return splitBundleTitle(name).length >= 2;
}

export function isBoardGameBundleTitle(name: string): boolean {
  return isBundleTitle(name);
}

/** True when a user bundle title like "A + B" is reflected in a catalog listing. */
export function bundleTitlePartsMatchCatalogTitle(
  requestedName: string,
  catalogTitle: string,
  extraTexts: string[] = [],
): boolean {
  const candidates = [catalogTitle, ...extraTexts]
    .map((value) => value.trim())
    .filter(Boolean);
  if (candidates.length === 0) return false;

  const parts = splitBundleTitle(requestedName);
  if (parts.length < 2) return false;

  return candidates.some((candidate) => {
    const titleTokenSet = new Set(distinctiveTokens(candidate));
    return parts.every((part) => {
      const partTokens = distinctiveTokens(part);
      if (partTokens.length === 0) return true;
      return partTokens.every((token) =>
        titleTokenPresentInSet(token, titleTokenSet),
      );
    });
  });
}

function bundleSearchQueries(name: string, shelfName?: string | null): string[] {
  const parts = splitBundleTitle(name);
  if (parts.length < 2) {
    const shelf = shelfName?.trim();
    if (!shelf || shelfAlreadyInTitle(shelf, name)) return [];
    return [`${shelf} ${name.trim()}`];
  }

  const joinedSpace = parts.join(" ");
  const joinedSlash = parts.join("/");
  const queries = [joinedSpace, joinedSlash];

  const shelf = shelfName?.trim();
  if (shelf && !shelfAlreadyInTitle(shelf, name)) {
    queries.push(
      `${shelf} ${name.trim()}`,
      `${shelf} ${joinedSpace}`,
      `${shelf} ${joinedSlash}`,
      shelf,
    );
  }

  return queries;
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
    const candidate = value.replace(/\s+/g, " ").trim();
    if (!candidate) return;
    const key = cleanSearchQuery(candidate).toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    ordered.push(candidate);
  };

  push(trimmed);

  if (isBundleTitle(trimmed) || shelfName?.trim()) {
    for (const query of bundleSearchQueries(trimmed, shelfName)) {
      push(query);
    }
  }

  return ordered;
}
