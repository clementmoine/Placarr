import {
  areLikelySameProduct,
  cleanTitleForDisplay,
  normalizeForTokens,
} from "@/core/identify/titleUtils";
import { scoreDisplayTitle } from "@/core/enrich/titles/displayScore";
import {
  buildTokenDocumentFrequency,
  isCorpusGenericToken,
  type CorpusTokenStats,
} from "@/core/enrich/titles/tokenCorpusIdf";
import { resolveCorpusTokenStats } from "@/core/enrich/titles/tokenCorpusIndex";

import { GENERIC_TITLE_TOKENS } from "./parse";
import type {
  MatchEvidenceSummary,
  ProductEvidence,
  ResolvedMatch,
} from "./types";
import { regionRank } from "@/core/locale/preference";

export type { CorpusTokenStats };

type MatchLike = {
  name: string;
  suggestions: string[];
  coverUrl: string | null;
  confidence?: number;
  evidence?: MatchEvidenceSummary;
};

/**
 * Distinctive title tokens for subset / specificity checks.
 * When `corpusStats` is provided, also drops corpus-generic tokens (IDF floor).
 * Without stats, behavior matches the historical GENERIC_TITLE_TOKENS-only path.
 */
export function titleSpecificityTokens(
  value: string,
  corpusStats?: CorpusTokenStats | null,
): Set<string> {
  const tokens = normalizeForTokens(value)
    .split(/[^a-z0-9]+/)
    .filter((token) => {
      if (token.length <= 1) return false;
      if (GENERIC_TITLE_TOKENS.has(token)) return false;
      if (corpusStats && isCorpusGenericToken(token, corpusStats)) return false;
      return true;
    });

  return new Set(tokens);
}

export function isStrictTitleSubset(
  candidate: string,
  other: string,
  corpusStats?: CorpusTokenStats | null,
): boolean {
  const candidateTokens = titleSpecificityTokens(candidate, corpusStats);
  const otherTokens = titleSpecificityTokens(other, corpusStats);
  if (candidateTokens.size < 2 || otherTokens.size <= candidateTokens.size) {
    return false;
  }

  for (const token of candidateTokens) {
    if (!otherTokens.has(token)) return false;
  }

  return true;
}

function fallbackEvidenceForMatch(
  match: MatchLike,
  providerName = "Cache",
): MatchEvidenceSummary {
  const confidence = match.confidence ?? (match.coverUrl ? 0.72 : 0.58);
  return {
    providers: [providerName],
    canonicalProviders: [],
    trustedRetailerProviders: [],
    rawCount: Math.max(1, match.suggestions.length),
    canonicalCount: 0,
    trustedRetailerCount: 0,
    marketplaceCount: Math.max(1, match.suggestions.length),
    hasCover: !!match.coverUrl,
    confidence: Number(confidence.toFixed(2)),
    reasons: match.coverUrl ? ["cover-match"] : [],
  };
}

function mergeEvidenceSummaries(
  a: MatchEvidenceSummary,
  b: MatchEvidenceSummary,
): MatchEvidenceSummary {
  const providers = Array.from(new Set([...a.providers, ...b.providers]));
  const canonicalProviders = Array.from(
    new Set([...a.canonicalProviders, ...b.canonicalProviders]),
  );
  const trustedRetailerProviders = Array.from(
    new Set([...a.trustedRetailerProviders, ...b.trustedRetailerProviders]),
  );
  const confidence = Math.min(
    0.98,
    Math.max(a.confidence, b.confidence) + Math.min(0.08, b.rawCount * 0.015),
  );

  return {
    providers,
    canonicalProviders,
    trustedRetailerProviders,
    rawCount: a.rawCount + b.rawCount,
    canonicalCount: a.canonicalCount + b.canonicalCount,
    trustedRetailerCount: a.trustedRetailerCount + b.trustedRetailerCount,
    marketplaceCount: a.marketplaceCount + b.marketplaceCount,
    hasCover: a.hasCover || b.hasCover,
    confidence: Number(confidence.toFixed(2)),
    reasons: Array.from(new Set([...a.reasons, ...b.reasons, "deduped-cover"])),
  };
}

export function mergeDuplicateMatches(matches: MatchLike[]): ResolvedMatch[] {
  const merged: ResolvedMatch[] = [];
  // Prefer durable RawName DF index when present; else in-memory batch titles.
  const corpusStats = resolveCorpusTokenStats(
    buildTokenDocumentFrequency(
      matches.flatMap((match) => [match.name, ...match.suggestions]),
    ),
  );

  for (const match of matches) {
    const fallbackEvidence = fallbackEvidenceForMatch(match);
    const normalizedMatch: ResolvedMatch = {
      ...match,
      confidence: match.confidence ?? fallbackEvidence.confidence,
      evidence: match.evidence ?? fallbackEvidence,
    };
    const existingIndex = match.coverUrl
      ? merged.findIndex((m) => m.coverUrl && m.coverUrl === match.coverUrl)
      : -1;

    if (existingIndex !== -1) {
      const existing = merged[existingIndex];
      const allSuggestions = Array.from(
        new Set([
          ...existing.suggestions,
          ...normalizedMatch.suggestions,
          normalizedMatch.name,
          existing.name,
        ]),
      );
      const bestName =
        existing.confidence > normalizedMatch.confidence
          ? existing.name
          : normalizedMatch.confidence > existing.confidence
            ? normalizedMatch.name
            : isStrictTitleSubset(
                  existing.name,
                  normalizedMatch.name,
                  corpusStats,
                )
              ? normalizedMatch.name
              : isStrictTitleSubset(
                    normalizedMatch.name,
                    existing.name,
                    corpusStats,
                  )
                ? existing.name
                : existing.name;
      const mergedEvidence = mergeEvidenceSummaries(
        existing.evidence,
        normalizedMatch.evidence,
      );
      merged[existingIndex] = {
        name: bestName,
        suggestions: allSuggestions,
        coverUrl: existing.coverUrl,
        confidence: mergedEvidence.confidence,
        evidence: mergedEvidence,
      };
    } else {
      merged.push(normalizedMatch);
    }
  }

  return merged;
}

export function pickPreferredClusterDisplayName(
  representative: string,
  cluster: ProductEvidence[],
): string {
  // A genuine, uncontradicted canonical source names the product
  // authoritatively, so its clean title wins the display — even over
  // marketplace listings the consensus override raised to trusted-retailer,
  // which is a RANKING device, not an endorsement of their noisy seller text
  // ("Teenage Mutant Hero Turtles - TMNT" must not beat the canonical "Teenage
  // Mutant Ninja Turtles"). Prefer the local region, then the cleanest title.
  const trustworthyCanonical = cluster.filter(
    (item) => item.isCanonical && !item.contradictedByConsensus,
  );
  if (trustworthyCanonical.length > 0) {
    const best = trustworthyCanonical.slice().sort((a, b) => {
      const regionDiff = regionRank(a.region) - regionRank(b.region);
      if (regionDiff !== 0) return regionDiff;
      const scoreDiff =
        scoreDisplayTitle(b.title, { isCanonical: true }) -
        scoreDisplayTitle(a.title, { isCanonical: true });
      if (scoreDiff !== 0) return scoreDiff;
      const priorityDiff = b.priority - a.priority;
      if (priorityDiff !== 0) return priorityDiff;
      return a.title.length - b.title.length;
    })[0];
    return cleanTitleForDisplay(best.title, {
      preservePlatformSuffix: true,
      preserveEditionTerms: true,
    });
  }

  // Prefer durable RawName DF index when present; else this cluster's titles.
  const corpusStats = resolveCorpusTokenStats(
    buildTokenDocumentFrequency([
      representative,
      ...cluster.flatMap((item) => [item.title, item.cleanName, item.rawName]),
    ]),
  );

  const candidates = [
    {
      name: representative,
      isCanonical: true,
      isTrustedRetailer: false,
      catalogTitleAnchor: false,
    },
    ...cluster.flatMap((item) => [
      {
        name: item.title,
        isCanonical: item.isCanonical,
        isTrustedRetailer: item.isTrustedRetailer,
        catalogTitleAnchor: item.catalogTitleAnchor,
      },
      {
        name: item.cleanName,
        isCanonical: item.isCanonical,
        isTrustedRetailer: item.isTrustedRetailer,
        catalogTitleAnchor: item.catalogTitleAnchor,
      },
    ]),
  ];
  const seen = new Set<string>();

  const validCandidates = candidates
    .map((candidate) => ({
      ...candidate,
      name: cleanTitleForDisplay(candidate.name, {
        preservePlatformSuffix:
          candidate.isCanonical || candidate.catalogTitleAnchor,
        preserveEditionTerms: candidate.isCanonical,
      }),
    }))
    .filter((candidate) => {
      const key = candidate.name.toLowerCase().trim();
      if (
        !key ||
        seen.has(key) ||
        !areLikelySameProduct(representative, candidate.name)
      ) {
        return false;
      }
      seen.add(key);
      return true;
    });
  // A non-anchor title that merely wraps an anchor's clean title in extra noise
  // (publisher/edition junk) must never become the display name: a trusted /
  // canonical source's clean name wins over a noisier marketplace superset of it.
  const anchorNames = validCandidates
    .filter(
      (candidate) =>
        candidate.isCanonical ||
        candidate.isTrustedRetailer ||
        candidate.catalogTitleAnchor,
    )
    .map((candidate) => candidate.name);
  const deNoisedCandidates =
    anchorNames.length > 0
      ? validCandidates.filter((candidate) => {
          if (
            candidate.isCanonical ||
            candidate.isTrustedRetailer ||
            candidate.catalogTitleAnchor
          ) {
            return true;
          }
          return !anchorNames.some(
            (anchorName) =>
              anchorName !== candidate.name &&
              isStrictTitleSubset(anchorName, candidate.name, corpusStats),
          );
        })
      : validCandidates;

  const specificCandidates = deNoisedCandidates.filter((candidate) => {
    return !deNoisedCandidates.some(
      (other) =>
        other.name !== candidate.name &&
        isStrictTitleSubset(other.name, candidate.name, corpusStats) &&
        scoreDisplayTitle(other.name, {
          isCanonical: other.isCanonical,
          isTrustedRetailer: other.isTrustedRetailer,
        }) >=
          scoreDisplayTitle(candidate.name, {
            isCanonical: candidate.isCanonical,
            isTrustedRetailer: candidate.isTrustedRetailer,
          }) -
            40,
    );
  });
  const displayCandidates =
    specificCandidates.length > 0 ? specificCandidates : deNoisedCandidates;

  const ranked = displayCandidates.sort((a, b) => {
    const scoreA = scoreDisplayTitle(a.name, {
      isCanonical: a.isCanonical,
      isTrustedRetailer: a.isTrustedRetailer,
    });
    const scoreB = scoreDisplayTitle(b.name, {
      isCanonical: b.isCanonical,
      isTrustedRetailer: b.isTrustedRetailer,
    });
    if (scoreA !== scoreB) return scoreB - scoreA;
    return a.name.length - b.name.length;
  });

  for (const candidate of ranked) {
    const candidateScore = scoreDisplayTitle(candidate.name, {
      isCanonical: candidate.isCanonical,
      isTrustedRetailer: candidate.isTrustedRetailer,
    });
    const beatenByNoisySuperset = ranked.some(
      (other) =>
        other.name !== candidate.name &&
        isStrictTitleSubset(candidate.name, other.name, corpusStats) &&
        scoreDisplayTitle(other.name, {
          isCanonical: other.isCanonical,
          isTrustedRetailer: other.isTrustedRetailer,
        }) > candidateScore,
    );
    if (!beatenByNoisySuperset) {
      return candidate.name;
    }
  }

  return ranked[0]?.name || representative;
}
