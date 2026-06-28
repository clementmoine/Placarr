import {
  areLikelySameProduct,
  cleanTitleForDisplay,
  filterPlatformRedundancies,
  getSequelIndicators,
  isListingDiscardable,
  normalizeForTokens,
} from "@/lib/barcode/titleUtils";
import { getRepresentativeScore } from "@/lib/title/displayScore";
import { VIDEO_GAME_PLATFORM_TOKEN_TERMS } from "@/lib/games/platforms";
import { confrontWithDatabase } from "@/services/metadata/database";
import { isbnCoverUrlForBarcode } from "@/services/provider/registry";

import {
  isStrictTitleSubset,
  mergeDuplicateMatches,
  pickPreferredClusterDisplayName,
} from "./matchUtils";

import {
  barcodeEvidenceObservationSourceWeight,
  barcodeEvidenceTitleObservationScore,
  compareBarcodeEvidenceByImageObservationRank,
  compareBarcodeEvidenceByObservationRank,
  pickPlatformKeyFromEvidence,
} from "./observations";

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
import { ALTERNATE, CLUSTER_CONFIDENCE } from "./scoring";

export async function buildDatabaseEvidence(
  names: string[],
  type: string,
): Promise<ProductEvidence[]> {
  // Confront a wider slice so a specific edition the marketplace names ("… II:
  // The Arcade Game") is resolved even when noisier base-ish listings come first.
  const uniqueNames = uniqueClean(names, {
    preservePlatformSuffix: type === "games",
  }).slice(0, 8);
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

const RESOLVER_PLATFORM_TOKENS = new Set(VIDEO_GAME_PLATFORM_TOKEN_TERMS);

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

// How many franchise-identifying tokens two titles share, ignoring platform
// names. Used to fold a noisy marketplace listing ("Tom Clancy's Ghost Recon …
// Big Box Ubisoft Rainbow six") into the clean consensus leader it names, even
// when its seller junk defeats the stricter areLikelySameProduct.
function sharedFranchiseTokenCount(a: string, b: string): number {
  const franchiseTokens = (value: string) => {
    const out = new Set<string>();
    for (const token of resolverSignificantTokens(value)) {
      if (!RESOLVER_PLATFORM_TOKENS.has(token)) out.add(token);
    }
    return out;
  };
  const aTokens = franchiseTokens(a);
  const bTokens = franchiseTokens(b);
  let shared = 0;
  for (const token of aTokens) if (bTokens.has(token)) shared++;
  return shared;
}

// Whether `candidate` is exactly the leader's title plus a sequel number it
// lacks ("De Blob" → "de Blob 2"). Such a candidate is the wrong edition of the
// same game, not a different product — so a contradicted canonical of this shape
// must not surface as a pickable alternate, even when the franchise is a single
// word that the consensus override's ≥2-token guard can't dispute. A candidate
// that adds an identifying *word* ("Rainbow Six" → "… Lockdown") is NOT matched.
function isLeaderWithExtraSequelNumber(
  leaderName: string,
  candidateName: string,
): boolean {
  const words = (name: string) => {
    const out = new Set<string>();
    for (const token of resolverSignificantTokens(name)) {
      if (/^\d+$/.test(token)) continue;
      if (getSequelIndicators(token).size > 0) continue;
      if (RESOLVER_PLATFORM_TOKENS.has(token)) continue;
      out.add(token);
    }
    return out;
  };
  const leaderWords = words(leaderName);
  const candidateWords = words(candidateName);
  if (leaderWords.size === 0 || leaderWords.size !== candidateWords.size) {
    return false;
  }
  for (const token of leaderWords) {
    if (!candidateWords.has(token)) return false;
  }
  const leaderNums = getSequelIndicators(normalizeForTokens(leaderName));
  const candidateNums = getSequelIndicators(normalizeForTokens(candidateName));
  for (const num of candidateNums) {
    if (!leaderNums.has(num)) return true;
  }
  return false;
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

const REPRESENTATIVE_TIER_WEIGHT = 1_000;

function representativeEvidenceScore(item: ProductEvidence): number {
  return (
    barcodeEvidenceTitleObservationScore(item) * REPRESENTATIVE_TIER_WEIGHT +
    getRepresentativeScore(item.title, item.priority)
  );
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
      const scoreA = representativeEvidenceScore(a);
      const scoreB = representativeEvidenceScore(b);
      if (scoreA !== scoreB) return scoreB - scoreA;
      return a.title.length - b.title.length;
    })[0];
  }

  const trustedRetailerEvidence = evidence.filter(
    (item) => item.isTrustedRetailer,
  );
  if (trustedRetailerEvidence.length > 0) {
    return trustedRetailerEvidence.slice().sort((a, b) => {
      const scoreA = representativeEvidenceScore(a);
      const scoreB = representativeEvidenceScore(b);
      if (scoreA !== scoreB) return scoreB - scoreA;
      return a.title.length - b.title.length;
    })[0];
  }

  return evidence.slice().sort((a, b) => {
    const scoreA = representativeEvidenceScore(a);
    const scoreB = representativeEvidenceScore(b);
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
  const sourceScore = evidence.reduce(
    (sum, item) => sum + barcodeEvidenceObservationSourceWeight(item),
    0,
  );
  const providerBonus = Math.min(
    CLUSTER_CONFIDENCE.multiProvider.cap,
    Math.max(0, providers.length - 1) *
      CLUSTER_CONFIDENCE.multiProvider.perExtraProvider,
  );
  const canonicalBonus = Math.min(
    CLUSTER_CONFIDENCE.canonical.cap,
    canonicalProviders.length * CLUSTER_CONFIDENCE.canonical.perProvider,
  );
  const trustedRetailerBonus = Math.min(
    CLUSTER_CONFIDENCE.trustedRetailer.cap,
    trustedRetailerProviders.length *
      CLUSTER_CONFIDENCE.trustedRetailer.perProvider,
  );
  const coverBonus = hasCover ? CLUSTER_CONFIDENCE.cover : 0;
  const rawSupportBonus = Math.min(
    CLUSTER_CONFIDENCE.rawSupport.cap,
    Math.max(0, evidence.length - 1) *
      CLUSTER_CONFIDENCE.rawSupport.perExtraRow,
  );
  const confidence = Math.max(
    CLUSTER_CONFIDENCE.floor,
    Math.min(
      CLUSTER_CONFIDENCE.ceiling,
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
  const isWrongEdition = evidence.some((e) => e.contradictedEdition);
  const finalConfidence = isContradictedCanonical
    ? Math.min(confidence, CLUSTER_CONFIDENCE.contradictedCanonicalCap)
    : hasAnchorSignals
      ? confidence
      : Math.min(confidence, CLUSTER_CONFIDENCE.listingOnlyCap);

  const reasons: string[] = [];
  if (isContradictedCanonical) reasons.push("contradicted-by-consensus");
  if (isWrongEdition) reasons.push("contradicted-edition");
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
      cluster
        .filter((entry) => entry.coverUrl)
        .sort(compareBarcodeEvidenceByImageObservationRank)[0]?.coverUrl ||
      isbnCoverUrlForBarcode(type, cleanedBarcode);
    const platformEvidence = cluster.filter(
      (item) => !item.contradictedByConsensus,
    );
    const platformKey =
      type === "games"
        ? pickPlatformKeyFromEvidence(
            platformEvidence.length > 0 ? platformEvidence : cluster,
          )
        : null;
    const suggestions = filterPlatformRedundancies(
      uniqueClean(
        [
          displayName,
          representative.title,
          ...displayEvidence
            .sort(compareBarcodeEvidenceByObservationRank)
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
      platformKey,
    };
  });

  const mergedByImage = mergeDuplicateMatches(matches);
  const sorted = mergedByImage.sort((a, b) => b.confidence - a.confidence);
  const top = sorted[0];
  if (!top) return [];

  return sorted.filter((match, index) => {
    if (index === 0) return true;

    // A canonical the override demoted as a wrong edition of the leader's own
    // franchise (a bad "… 2" or "… : Island Thunder" mapping of the base) is the
    // edition the consensus already disproved — not a different product the user
    // might want. Never surface it, whatever the ambiguity heuristics below say:
    // offering it would only invite shelving the wrong game.
    if (match.evidence.reasons.includes("contradicted-edition")) {
      return false;
    }

    // A contradicted canonical that is just the leader's title plus a sequel
    // number ("De Blob" leader vs SS's bad "de Blob 2") is the wrong edition,
    // not a different product — drop it. This covers short franchises the
    // edition-contradiction override can't dispute (its ≥2 franchise-token
    // guard) yet whose strict-consensus demotion still leaves the sequel as an
    // alternate.
    if (
      match.evidence.canonicalCount > 0 &&
      isLeaderWithExtraSequelNumber(top.name, match.name)
    ) {
      return false;
    }

    const isRelatedToTop = areLikelySameProduct(top.name, match.name);

    // When the leader carries no canonical evidence, a marketplace consensus
    // overrode a contradicting canonical barcode match. Keep that canonical
    // match as a clean, least-prioritised alternate so the user can still pick
    // the item the canonical strictly identified by barcode.
    const isContradictedCanonicalAlternate =
      top.evidence.canonicalCount === 0 && match.evidence.canonicalCount > 0;

    // A match that names the SAME product as the leader (just noisier seller
    // text — e.g. the same-edition listings the consensus override promoted to
    // trusted-retailer, often split across clusters by abbreviations like
    // "TMNT") adds no real choice. Surface it only when it brings genuinely
    // higher-trust evidence: a related, high-confidence canonical alternate, or
    // the contradicted canonical above. Otherwise drop it so one clean leader
    // stands for the whole consensus.
    if (isRelatedToTop) {
      const isStrongCanonicalAmbiguity =
        match.confidence >= ALTERNATE.strongCanonicalConfidence &&
        match.evidence.canonicalCount > 0;
      return isStrongCanonicalAmbiguity || isContradictedCanonicalAlternate;
    }

    // The marketplace-consensus override promotes EVERY franchise-matching
    // listing to trusted-retailer. A noisy one ("… Big Box Ubisoft Rainbow six")
    // fails the stricter areLikelySameProduct against the clean leader and would
    // surface as its own candidate. When the leader is itself a consensus result
    // (no canonical) and this alternate carries no canonical evidence either, a
    // shared franchise core means it is the SAME identified product with seller
    // noise — fold it into the leader rather than offering a duplicate.
    if (
      top.evidence.canonicalCount === 0 &&
      match.evidence.canonicalCount === 0 &&
      sharedFranchiseTokenCount(top.name, match.name) >=
        ALTERNATE.sharedFranchiseTokens
    ) {
      return false;
    }

    // Below: the match names a DIFFERENT candidate product, so genuine ambiguity
    // heuristics apply.
    const isDistinctTrustedAlternate = match.evidence.trustedRetailerCount > 0;
    const isCloseToTop =
      top.confidence < ALTERNATE.closeRunnerUp.leaderBelow &&
      top.confidence - match.confidence <= ALTERNATE.closeRunnerUp.maxGap;
    const hasNoDominantWinner =
      top.confidence < ALTERNATE.noDominantWinner.leaderBelow &&
      match.confidence >= ALTERNATE.noDominantWinner.matchAtLeast;
    return (
      isDistinctTrustedAlternate ||
      isCloseToTop ||
      hasNoDominantWinner ||
      isContradictedCanonicalAlternate
    );
  });
}
