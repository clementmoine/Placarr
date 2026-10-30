/**
 * Distinctive / catalog-label token helpers for title matching.
 */
import { normalizeDisplayTitle } from "@/core/enrich/titles/displayScore";
import { titleTokenPresentInSet } from "@/core/enrich/titles/tokenEquivalents";
import { parseRomanToken } from "@/core/enrich/titles/romanNumeral";
import { IDENTITY_FUNCTION_WORDS } from "@/core/enrich/titles/identityNoise";

const CATALOG_LABEL_STOP_WORDS = IDENTITY_FUNCTION_WORDS;

export function catalogMatchTokenSet(value: string): Set<string> {
  const tokens = new Set(
    normalizeDisplayTitle(value).filter(
      (token) => token.length >= 3 && !CATALOG_LABEL_STOP_WORDS.has(token),
    ),
  );
  for (const match of value.matchAll(/\b(\d{1,2})\b/g)) {
    tokens.add(match[1]!);
  }
  for (const match of value.matchAll(/\b([IVXLCDM]{1,4})\b/gi)) {
    const roman = parseRomanToken(match[1]!);
    if (roman != null) tokens.add(String(roman));
    tokens.add(match[1]!.toLowerCase());
  }
  return tokens;
}

/** Distinctive tokens for catalog label overlap (articles stripped). */
export function distinctiveTitleTokens(value: string): string[] {
  return normalizeDisplayTitle(value).filter(
    (token) => token.length >= 3 && !CATALOG_LABEL_STOP_WORDS.has(token),
  );
}

/**
 * Share of query distinctive tokens found in a catalog label (series name,
 * parenthetical segment, album title). Rewards embedded sub-series labels
 * without product-specific literals.
 */
export function distinctiveTokenCoverage(
  query: string,
  candidate: string,
): number {
  const queryTokens = distinctiveTitleTokens(query);
  if (queryTokens.length === 0) return 0;
  const candidateTokens = catalogMatchTokenSet(candidate);
  const matched = queryTokens.filter((token) =>
    titleTokenPresentInSet(token, candidateTokens),
  ).length;
  return matched / queryTokens.length;
}

/**
 * Similarity for ranking catalog labels (series search, album pick) when the
 * query is a short series stem inside a longer provider label.
 */
