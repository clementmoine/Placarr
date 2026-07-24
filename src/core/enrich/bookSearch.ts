/**
 * Book/manga metadata search query construction from title + shelf.
 */
import { normalizeDisplayTitle } from "@/core/enrich/titles/displayScore";
import { IDENTITY_FUNCTION_WORDS } from "@/core/enrich/titles/identityNoise";
import {
  cleanSearchQuery,
  stripLegalMarkSymbols,
} from "@/core/enrich/search/query";

function distinctiveTokens(value: string): string[] {
  return normalizeDisplayTitle(value).filter(
    (token) => token.length >= 3 && !IDENTITY_FUNCTION_WORDS.has(token),
  );
}

function shelfAlreadyInTitle(shelfName: string, title: string): boolean {
  const shelfTokens = distinctiveTokens(shelfName);
  if (shelfTokens.length === 0) return false;
  const titleTokenSet = new Set(distinctiveTokens(title));
  if (shelfTokens.every((token) => titleTokenSet.has(token))) {
    return true;
  }

  const normalizedShelf = shelfName.trim().toLowerCase();
  if (normalizedShelf.endsWith("s") && normalizedShelf.length > 4) {
    const singular = normalizedShelf.slice(0, -1);
    if (titleTokenSet.has(singular)) return true;
  }

  return false;
}

function shelfSearchVariants(shelfName: string): string[] {
  return [shelfName.trim()].filter(Boolean);
}

/**
 * Ordered book/manga metadata search queries. Keeps the raw item title first,
 * then prepends the shelf label when it adds context (e.g. « Mangas » + « Naruto
 * n°01 ») without injecting fixed product-line keywords.
 */
export function buildBookMetadataSearchQueries(
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

  const shelf = shelfName?.trim();
  if (shelf && !shelfAlreadyInTitle(shelf, trimmed)) {
    for (const variant of shelfSearchVariants(shelf)) {
      push(`${variant} ${trimmed}`);
    }
  }

  return ordered;
}

