import {
  areLikelySameProduct,
  cleanTitleForDisplay,
  filterPlatformRedundancies,
  isListingDiscardable,
  normalizeForTokens,
} from "@/lib/barcode/titleUtils";
import { getRepresentativeScore } from "@/lib/displayTitleScore";
import { confrontWithDatabase } from "@/services/metadataDatabase";

import {
  isStrictTitleSubset,
  mergeDuplicateMatches,
  pickPreferredClusterDisplayName,
} from "./matchUtils";

import {
  areEvidenceSameProduct,
  buildProductEvidence,
  evidenceSimilarity,
  GENERIC_TITLE_TOKENS,
  uniqueClean,
} from "./parse";
import type {
  MatchEvidenceSummary,
  ProductEvidence,
  ResolvedMatch,
} from "./types";

export async function buildDatabaseEvidence(
  names: string[],
  type: string,
): Promise<ProductEvidence[]> {
  const uniqueNames = uniqueClean(names, {
    preservePlatformSuffix: type === "games",
  }).slice(0, 4);
  const resolved = await Promise.all(
    uniqueNames.map(async (name) => {
      const evidence: ProductEvidence[] = [];
      const confrontedName = await confrontWithDatabase(name, type);
      if (confrontedName) {
        const cleanConfronted = cleanTitleForDisplay(confrontedName);
        if (
          cleanConfronted &&
          !isListingDiscardable(cleanConfronted) &&
          isDatabaseResolvedNameAcceptable(name, cleanConfronted)
        ) {
          const item = buildProductEvidence(
            "DatabaseResolver",
            { name: cleanConfronted },
            true,
          );
          if (item) evidence.push(item);
        }
      }

      return evidence;
    }),
  );

  return resolved.flat();
}

const RESOLVER_GENERIC_TOKENS = new Set([
  ...GENERIC_TITLE_TOKENS,
  "video",
  "volant",
  "wheel",
  "notice",
  "nintendo",
  "sony",
  "microsoft",
  "sega",
]);

const RESOLVER_PLATFORM_TOKENS = new Set([
  "wii",
  "switch",
  "ds",
  "3ds",
  "ps1",
  "ps2",
  "ps3",
  "ps4",
  "ps5",
  "xbox",
  "pc",
]);

export const NON_CANONICAL_CONTEXT_TOKENS = new Set([
  "orchestra",
  "soundtrack",
  "ost",
  "album",
  "vinyl",
  "cd",
  "fan",
  "fanbook",
  "guide",
  "book",
]);

function resolverSignificantTokens(value: string): Set<string> {
  const tokens = normalizeForTokens(
    cleanTitleForDisplay(value, {
      preservePlatformSuffix: true,
    }),
  )
    .replace(/&/g, " and ")
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 2 && !RESOLVER_GENERIC_TOKENS.has(token));

  return new Set(tokens);
}

function isDatabaseResolvedNameAcceptable(
  input: string,
  resolved: string,
): boolean {
  if (!areLikelySameProduct(input, resolved)) return false;

  const inputTokens = resolverSignificantTokens(input);
  const resolvedTokens = resolverSignificantTokens(resolved);
  const extraResolvedTokens = [...resolvedTokens].filter(
    (token) => !inputTokens.has(token) && !RESOLVER_PLATFORM_TOKENS.has(token),
  );
  const extraInputTokens = [...inputTokens].filter(
    (token) =>
      !resolvedTokens.has(token) && !RESOLVER_PLATFORM_TOKENS.has(token),
  );
  const hasNonCanonicalContext = extraInputTokens.some((token) =>
    NON_CANONICAL_CONTEXT_TOKENS.has(token),
  );

  if (hasNonCanonicalContext && extraInputTokens.length >= 1) return false;

  return extraResolvedTokens.length === 0 && extraInputTokens.length <= 3;
}

export function pickRepresentativeEvidence(
  evidence: ProductEvidence[],
): ProductEvidence {
  const canonicalEvidence = evidence.filter((item) => item.isCanonical);
  const canonicalRegionalEvidence = filterOverlyGenericCanonicalEvidence(
    evidence.filter((item) => item.isCanonical && item.region),
    canonicalEvidence,
  );
  const regionOrder = ["fr", "eu", "wor", "uk", "us", "jp"];
  const regionRank = (region?: string | null) => {
    const index = regionOrder.indexOf((region || "").toLowerCase());
    return index === -1 ? regionOrder.length : index;
  };

  if (canonicalRegionalEvidence.length > 0) {
    return canonicalRegionalEvidence.slice().sort((a, b) => {
      const regionDiff = regionRank(a.region) - regionRank(b.region);
      if (regionDiff !== 0) return regionDiff;
      const priorityDiff = b.priority - a.priority;
      if (priorityDiff !== 0) return priorityDiff;
      return a.title.length - b.title.length;
    })[0];
  }

  const specificCanonicalEvidence = filterOverlyGenericCanonicalEvidence(
    canonicalEvidence,
    canonicalEvidence,
  );
  if (specificCanonicalEvidence.length > 0) {
    return specificCanonicalEvidence.slice().sort((a, b) => {
      const scoreA =
        getRepresentativeScore(a.title, a.priority) + a.sourceWeight * 1000;
      const scoreB =
        getRepresentativeScore(b.title, b.priority) + b.sourceWeight * 1000;
      if (scoreA !== scoreB) return scoreB - scoreA;
      return a.title.length - b.title.length;
    })[0];
  }

  const trustedRetailerEvidence = evidence.filter(
    (item) => item.isTrustedRetailer,
  );
  if (trustedRetailerEvidence.length > 0) {
    return trustedRetailerEvidence.slice().sort((a, b) => {
      const scoreA =
        getRepresentativeScore(a.title, a.priority) + a.sourceWeight * 1000;
      const scoreB =
        getRepresentativeScore(b.title, b.priority) + b.sourceWeight * 1000;
      if (scoreA !== scoreB) return scoreB - scoreA;
      return a.title.length - b.title.length;
    })[0];
  }

  return evidence.slice().sort((a, b) => {
    const scoreA =
      getRepresentativeScore(a.title, a.priority) + a.sourceWeight * 1000;
    const scoreB =
      getRepresentativeScore(b.title, b.priority) + b.sourceWeight * 1000;
    if (scoreA !== scoreB) return scoreB - scoreA;
    return a.title.length - b.title.length;
  })[0];
}

function filterOverlyGenericCanonicalEvidence(
  candidates: ProductEvidence[],
  allCanonicalEvidence: ProductEvidence[],
): ProductEvidence[] {
  const filtered = candidates.filter((candidate) => {
    return !allCanonicalEvidence.some((other) => {
      if (other === candidate) return false;
      const sameCover =
        candidate.coverUrl &&
        other.coverUrl &&
        candidate.coverUrl === other.coverUrl;
      if (!sameCover && !areLikelySameProduct(candidate.title, other.title)) {
        return false;
      }

      return isStrictTitleSubset(candidate.title, other.title);
    });
  });

  return filtered.length > 0 ? filtered : candidates;
}

const USER_VISIBLE_REGIONS = new Set(["fr", "eu", "wor", "uk", "us"]);

export function filterDisplayEvidenceForSuggestions(
  evidence: ProductEvidence[],
): ProductEvidence[] {
  const canonicalEvidence = evidence.filter((item) => item.isCanonical);
  const trustedRetailerEvidence = evidence.filter(
    (item) => item.isTrustedRetailer,
  );
  if (canonicalEvidence.length === 0) {
    return trustedRetailerEvidence.length > 0
      ? trustedRetailerEvidence
      : evidence;
  }

  const preferredRegionEvidence = canonicalEvidence.filter(
    (item) =>
      !item.region || USER_VISIBLE_REGIONS.has(item.region.toLowerCase()),
  );
  const displayEvidence =
    preferredRegionEvidence.length > 0
      ? preferredRegionEvidence
      : canonicalEvidence;

  return filterOverlyGenericCanonicalEvidence(
    displayEvidence,
    canonicalEvidence,
  );
}

// Plafond de confiance pour un résultat issu uniquement d'annonces (aucune
// source canonique) : au-dessus, l'UI le présenterait comme certain.
const LISTING_ONLY_CONFIDENCE_CAP = 0.45;

// Plafond pour une source canonique contredite par un fort consensus marchand
// indépendant (probable mauvais mapping code-barres → on la garde en
// alternative, mais sous le consensus qui mène).
const CONTRADICTED_CANONICAL_CONFIDENCE_CAP = 0.4;

function scoreEvidenceCluster(
  evidence: ProductEvidence[],
): MatchEvidenceSummary {
  const providers = Array.from(new Set(evidence.map((e) => e.providerName)));
  const canonicalProviders = Array.from(
    new Set(evidence.filter((e) => e.isCanonical).map((e) => e.providerName)),
  );
  const trustedRetailerProviders = Array.from(
    new Set(
      evidence.filter((e) => e.isTrustedRetailer).map((e) => e.providerName),
    ),
  );
  const canonicalCount = evidence.filter((e) => e.isCanonical).length;
  const trustedRetailerCount = evidence.filter(
    (e) => e.isTrustedRetailer,
  ).length;
  const marketplaceCount =
    evidence.length - canonicalCount - trustedRetailerCount;
  const hasCover = evidence.some((e) => e.coverUrl);
  const sourceScore = evidence.reduce((sum, e) => sum + e.sourceWeight, 0);
  const providerBonus = Math.min(
    0.16,
    Math.max(0, providers.length - 1) * 0.04,
  );
  const canonicalBonus = Math.min(0.18, canonicalProviders.length * 0.06);
  const trustedRetailerBonus = Math.min(
    0.12,
    trustedRetailerProviders.length * 0.05,
  );
  const coverBonus = hasCover ? 0.05 : 0;
  const rawSupportBonus = Math.min(
    0.12,
    Math.max(0, evidence.length - 1) * 0.025,
  );
  const confidence = Math.max(
    0.05,
    Math.min(
      0.98,
      sourceScore +
        providerBonus +
        canonicalBonus +
        trustedRetailerBonus +
        coverBonus +
        rawSupportBonus,
    ),
  );

  const hasAnchorSignals =
    canonicalProviders.length > 0 || trustedRetailerProviders.length > 0;
  const isContradictedCanonical = evidence.some(
    (e) => e.contradictedByConsensus,
  );
  const finalConfidence = isContradictedCanonical
    ? Math.min(confidence, CONTRADICTED_CANONICAL_CONFIDENCE_CAP)
    : hasAnchorSignals
      ? confidence
      : Math.min(confidence, LISTING_ONLY_CONFIDENCE_CAP);

  const reasons: string[] = [];
  if (isContradictedCanonical) reasons.push("contradicted-by-consensus");
  if (canonicalProviders.length > 0) reasons.push("canonical-source");
  if (trustedRetailerProviders.length > 0) {
    reasons.push("trusted-retailer-source");
  }
  if (providers.length > 1) reasons.push("multi-source-agreement");
  if (hasCover) reasons.push("cover-match");
  if (marketplaceCount > 0) reasons.push("marketplace-support");

  return {
    providers,
    canonicalProviders,
    trustedRetailerProviders,
    rawCount: evidence.length,
    canonicalCount,
    trustedRetailerCount,
    marketplaceCount,
    hasCover,
    confidence: Number(finalConfidence.toFixed(2)),
    reasons,
  };
}

export function resolveEvidenceToMatches(
  evidenceList: ProductEvidence[],
  type: string,
  cleanedBarcode: string,
): ResolvedMatch[] {
  const clusters: ProductEvidence[][] = [];

  for (const evidence of evidenceList) {
    let bestClusterIndex = -1;
    let bestScore = 0;
    for (let i = 0; i < clusters.length; i++) {
      const clusterScore = Math.max(
        ...clusters[i].map((other) => evidenceSimilarity(evidence, other)),
      );
      if (clusterScore > bestScore) {
        bestScore = clusterScore;
        bestClusterIndex = i;
      }
    }

    if (
      bestClusterIndex !== -1 &&
      clusters[bestClusterIndex].some((other) =>
        areEvidenceSameProduct(evidence, other),
      )
    ) {
      clusters[bestClusterIndex].push(evidence);
    } else {
      clusters.push([evidence]);
    }
  }

  const matches = clusters.map((cluster) => {
    const representative = pickRepresentativeEvidence(cluster);
    const evidence = scoreEvidenceCluster(cluster);
    const displayName = pickPreferredClusterDisplayName(
      representative.title,
      cluster,
    );
    const displayEvidence = filterDisplayEvidenceForSuggestions(cluster);
    const coverUrl =
      cluster.find(
        (e) => e.providerName === representative.providerName && e.coverUrl,
      )?.coverUrl ||
      cluster.find((e) => e.coverUrl)?.coverUrl ||
      (type === "books"
        ? `https://covers.openlibrary.org/b/isbn/${cleanedBarcode}-M.jpg`
        : null);
    const suggestions = filterPlatformRedundancies(
      uniqueClean(
        [
          displayName,
          representative.title,
          ...displayEvidence
            .sort((a, b) => b.sourceWeight - a.sourceWeight)
            .flatMap((e) => [e.title, e.cleanName]),
        ],
        { preservePlatformSuffix: type === "games" },
      ),
    );

    return {
      name: displayName,
      suggestions,
      coverUrl,
      confidence: evidence.confidence,
      evidence,
    };
  });

  const mergedByImage = mergeDuplicateMatches(matches);
  const sorted = mergedByImage.sort((a, b) => b.confidence - a.confidence);
  const top = sorted[0];
  if (!top) return [];

  return sorted.filter((match, index) => {
    if (index === 0) return true;
    const isRelatedToTop = areLikelySameProduct(top.name, match.name);
    const isStrongAmbiguity =
      (isRelatedToTop &&
        match.confidence >= 0.72 &&
        match.evidence.canonicalCount > 0) ||
      match.evidence.trustedRetailerCount > 0;
    const isCloseToTop =
      top.confidence < 0.82 && top.confidence - match.confidence <= 0.18;
    const hasNoDominantWinner =
      top.confidence < 0.62 && match.confidence >= 0.28;
    // When the leader carries no canonical evidence, a marketplace consensus
    // overrode a contradicting canonical barcode match. Keep that canonical
    // match as a clean, least-prioritised alternate so the user can still pick
    // the item the canonical strictly identified by barcode.
    const isContradictedCanonicalAlternate =
      top.evidence.canonicalCount === 0 && match.evidence.canonicalCount > 0;
    return (
      isStrongAmbiguity ||
      isCloseToTop ||
      hasNoDominantWinner ||
      isContradictedCanonicalAlternate
    );
  });
}
