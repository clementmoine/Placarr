import {
  cleanSearchQuery,
  stripLegalMarkSymbols,
} from "@/core/enrich/search/query";
import { normalizeDisplayTitle } from "@/core/enrich/titles/displayScore";
import { titleTokenPresentInSet } from "@/core/enrich/titles/tokenEquivalents";

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

/** Splits user bundle labels on +, &, "and", or /. */
const BUNDLE_PART_SEPARATOR = /\s*(?:\+|&|\band\b)\s*|\s*\/\s*/i;

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

export function splitBundleTitle(name: string): string[] {
  const trimmed = name.trim();
  if (!trimmed) return [];
  const parts = trimmed
    .split(BUNDLE_PART_SEPARATOR)
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length >= 2 ? parts : [];
}

export function isBundleTitle(name: string): boolean {
  return splitBundleTitle(name).length >= 2;
}

/** @deprecated Prefer {@link isBundleTitle}. */
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
    return parts.every((part) => bundlePartMatchesCatalog(part, titleTokenSet));
  });
}

function bundlePartMatchesCatalog(
  part: string,
  titleTokenSet: Set<string>,
): boolean {
  const partTokens = distinctiveTokens(part);
  if (partTokens.length === 0) return true;

  const hits = partTokens.filter((token) =>
    titleTokenPresentInSet(token, titleTokenSet),
  );
  if (hits.length === 0) return false;
  if (partTokens.length <= 2) {
    return hits.length === partTokens.length;
  }
  return hits.length >= 2 || hits.length / partTokens.length >= 0.5;
}

function bundleSearchQueries(
  name: string,
  shelfName?: string | null,
  platformLabel?: string | null,
): string[] {
  const parts = splitBundleTitle(name);
  if (parts.length < 2) {
    const shelf = shelfName?.trim();
    if (!shelf || shelfAlreadyInTitle(shelf, name)) return [];
    return [`${shelf} ${name.trim()}`];
  }

  const joinedSpace = parts.join(" ");
  const joinedPlus = parts.join(" + ");
  const joinedSlash = parts.join("/");
  const queries = [joinedSpace, joinedPlus, joinedSlash];

  const platform = platformLabel?.trim();
  if (platform) {
    queries.push(
      `${joinedPlus} Dual Pack`,
      `Pack : ${joinedPlus} / ${platform}`,
      `${joinedPlus} / ${platform}`,
    );
  }

  const shelf = shelfName?.trim();
  if (shelf && !shelfAlreadyInTitle(shelf, name)) {
    queries.push(
      `${shelf} ${name.trim()}`,
      `${shelf} ${joinedSpace}`,
      `${shelf} ${joinedPlus}`,
      `${shelf} ${joinedSlash}`,
      shelf,
    );
  }

  return queries;
}

/**
 * Ordered search queries for bundle titles whose catalog listing uses a
 * different shape (e.g. "A/B" or "Pack : A + B / platform").
 */
export function buildBundleMetadataSearchQueries(
  name: string,
  shelfName?: string | null,
  platformLabel?: string | null,
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

  if (isBundleTitle(trimmed)) {
    for (const query of bundleSearchQueries(
      trimmed,
      shelfName,
      platformLabel,
    )) {
      push(query);
    }
  } else if (shelfName?.trim()) {
    for (const query of bundleSearchQueries(
      trimmed,
      shelfName,
      platformLabel,
    )) {
      push(query);
    }
  }

  return ordered;
}
