/**
 * Pure corpus-frequency helpers for title tokens (IDF floor).
 * Unknown / low-DF tokens stay as signal — safe default for cold corpora.
 */
import { normalizeForTokens } from "@/core/enrich/titles/normalize";

export type CorpusTokenStats = {
  /** Distinct titles (documents) in the bag. */
  docCount: number;
  /** Token → number of titles that contain it at least once. */
  documentFrequency: ReadonlyMap<string, number>;
};

/** Tokenize a title the same way identity / evidence specificity does. */
export function corpusTitleTokens(title: string): string[] {
  return normalizeForTokens(title)
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 1);
}

/**
 * Build document-frequency stats from a bag of titles.
 * Each title is one document; repeated tokens within a title count once.
 */
export function buildTokenDocumentFrequency(
  titles: string[],
): CorpusTokenStats {
  const documentFrequency = new Map<string, number>();
  let docCount = 0;

  for (const title of titles) {
    const tokens = corpusTitleTokens(title);
    if (tokens.length === 0) continue;
    docCount += 1;
    for (const token of new Set(tokens)) {
      documentFrequency.set(token, (documentFrequency.get(token) ?? 0) + 1);
    }
  }

  return { docCount, documentFrequency };
}

/**
 * Classic smooth IDF: log((N + 1) / (df + 1)) + 1.
 * Missing / zero-df tokens return the max IDF for this corpus (keep as signal).
 */
export function tokenIdf(token: string, stats: CorpusTokenStats): number {
  const { docCount, documentFrequency } = stats;
  if (docCount <= 0) return 1;
  const df = documentFrequency.get(token.toLowerCase()) ?? 0;
  return Math.log((docCount + 1) / (df + 1)) + 1;
}

export type CorpusGenericTokenOptions = {
  /**
   * Token is generic when it appears in at least this fraction of documents.
   * Default 0.35 — frequent across unrelated titles ⇒ listing chrome.
   */
  maxDocFraction?: number;
};

/**
 * True when the token is corpus-generic (high DF).
 * Unknown / low-DF ⇒ false (keep as distinctive signal).
 */
export function isCorpusGenericToken(
  token: string,
  stats: CorpusTokenStats,
  options: CorpusGenericTokenOptions = {},
): boolean {
  const { docCount, documentFrequency } = stats;
  if (docCount <= 0) return false;
  const df = documentFrequency.get(token.toLowerCase()) ?? 0;
  if (df <= 0) return false;
  const maxDocFraction = options.maxDocFraction ?? 0.35;
  return df / docCount >= maxDocFraction;
}
