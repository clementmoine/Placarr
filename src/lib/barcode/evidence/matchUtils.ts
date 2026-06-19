import {
  areLikelySameProduct,
  cleanTitleForDisplay,
  normalizeForTokens,
} from "@/lib/barcode/titleUtils";
import { scoreDisplayTitle } from "@/lib/displayTitleScore";

import { GENERIC_TITLE_TOKENS } from "./parse";
import type { MatchEvidenceSummary, ProductEvidence, ResolvedMatch } from "./types";

type MatchLike = {
  name: string;
  suggestions: string[];
  coverUrl: string | null;
  confidence?: number;
  evidence?: MatchEvidenceSummary;
};

function titleSpecificityTokens(value: string): Set<string> {
  const tokens = normalizeForTokens(value)
    .split(/[^a-z0-9]+/)
    .filter(
      (token) =>
        token.length > 1 &&
        !GENERIC_TITLE_TOKENS.has(token) &&
        token !== "video",
    );

  return new Set(tokens);
}

export function isStrictTitleSubset(candidate: string, other: string): boolean {
  const candidateTokens = titleSpecificityTokens(candidate);
  const otherTokens = titleSpecificityTokens(other);
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
    rawCount: Math.max(1, match.suggestions.length),
    canonicalCount: 0,
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
  const confidence = Math.min(
    0.98,
    Math.max(a.confidence, b.confidence) + Math.min(0.08, b.rawCount * 0.015),
  );

  return {
    providers,
    canonicalProviders,
    rawCount: a.rawCount + b.rawCount,
    canonicalCount: a.canonicalCount + b.canonicalCount,
    marketplaceCount: a.marketplaceCount + b.marketplaceCount,
    hasCover: a.hasCover || b.hasCover,
    confidence: Number(confidence.toFixed(2)),
    reasons: Array.from(new Set([...a.reasons, ...b.reasons, "deduped-cover"])),
  };
}

export function mergeDuplicateMatches(matches: MatchLike[]): ResolvedMatch[] {
  const merged: ResolvedMatch[] = [];

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
            : isStrictTitleSubset(existing.name, normalizedMatch.name)
              ? normalizedMatch.name
              : isStrictTitleSubset(normalizedMatch.name, existing.name)
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
  const canonicalRegionalCandidates = cluster.filter(
    (item) => item.isCanonical && item.region,
  );
  if (canonicalRegionalCandidates.length > 0) {
    const regionOrder = ["fr", "eu", "wor", "uk", "us", "jp"];
    const regionRank = (region?: string | null) => {
      const index = regionOrder.indexOf((region || "").toLowerCase());
      return index === -1 ? regionOrder.length : index;
    };
    return canonicalRegionalCandidates.slice().sort((a, b) => {
      const regionDiff = regionRank(a.region) - regionRank(b.region);
      if (regionDiff !== 0) return regionDiff;
      const priorityDiff = b.priority - a.priority;
      if (priorityDiff !== 0) return priorityDiff;
      return a.title.length - b.title.length;
    })[0].title;
  }

  const candidates = [
    { name: representative, isCanonical: true },
    ...cluster.flatMap((item) => [
      { name: item.title, isCanonical: item.isCanonical },
      { name: item.cleanName, isCanonical: item.isCanonical },
    ]),
  ];
  const seen = new Set<string>();

  const validCandidates = candidates
    .map((candidate) => ({
      ...candidate,
      name: cleanTitleForDisplay(candidate.name, {
        preservePlatformSuffix: candidate.isCanonical,
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
  const specificCandidates = validCandidates.filter((candidate) => {
    return !validCandidates.some(
      (other) =>
        other.name !== candidate.name &&
        isStrictTitleSubset(candidate.name, other.name),
    );
  });
  const displayCandidates =
    specificCandidates.length > 0 ? specificCandidates : validCandidates;

  return (
    displayCandidates.sort((a, b) => {
      const scoreA = scoreDisplayTitle(a.name, a.isCanonical);
      const scoreB = scoreDisplayTitle(b.name, b.isCanonical);
      if (scoreA !== scoreB) return scoreB - scoreA;
      return a.name.length - b.name.length;
    })[0]?.name || representative
  );
}
