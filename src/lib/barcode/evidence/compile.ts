import { filterPlatformRedundancies } from "@/lib/barcode/titleUtils";

import {
  areEvidenceSameProduct,
  buildProductEvidence,
  uniqueClean,
} from "./parse";
import {
  buildDatabaseEvidence,
  filterDisplayEvidenceForSuggestions,
  NON_CANONICAL_CONTEXT_TOKENS,
  pickRepresentativeEvidence,
  resolveEvidenceToMatches,
} from "./resolve";
import {
  pickPlatformKeyFromEvidence,
  type CompiledResult,
  type ProductEvidence,
  type ResolvedMatch,
  type SourceProduct,
} from "./types";

export async function compileResultForType(
  type: string,
  sources: {
    providerName: string;
    products: SourceProduct[];
  }[],
  cleanedBarcode: string,
): Promise<CompiledResult | null> {
  const activeSources = sources.filter(
    (s) => s.products && s.products.length > 0,
  );
  if (activeSources.length === 0) return null;

  const provider = activeSources.map((s) => s.providerName).join("+");
  const sourceEvidence: ProductEvidence[] = [];
  const canonicalEvidence: ProductEvidence[] = [];

  for (const source of activeSources) {
    for (const product of source.products) {
      const evidence = buildProductEvidence(source.providerName, product);
      if (!evidence) continue;
      if (
        type === "games" &&
        !evidence.isCanonical &&
        !evidence.parsed.platformKey &&
        [...evidence.parsed.tokens].some((token) =>
          NON_CANONICAL_CONTEXT_TOKENS.has(token),
        )
      ) {
        continue;
      }
      sourceEvidence.push(evidence);
      if (evidence.isCanonical) {
        canonicalEvidence.push(evidence);
      }
    }
  }

  if (sourceEvidence.length === 0) return null;

  const hasCanonicalSignals = canonicalEvidence.length > 0;
  const trustedEvidence = hasCanonicalSignals
    ? sourceEvidence.filter((evidence) => {
        if (evidence.isCanonical) return true;
        const isRelatedToCanonical = canonicalEvidence.some((canonical) =>
          areEvidenceSameProduct(canonical, evidence),
        );
        if (!isRelatedToCanonical) {
          console.log(
            `[Barcode API] Ignoring marketplace noise "${evidence.cleanName}" because canonical signals exist for ${type}`,
          );
        }
        return isRelatedToCanonical;
      })
    : sourceEvidence;

  const looksLikeAudioBarcode = /^(0?(498|499)|45|88)/.test(cleanedBarcode);
  const skipGameDatabaseFallback = type === "games" && looksLikeAudioBarcode;

  const databaseEvidence =
    hasCanonicalSignals || skipGameDatabaseFallback
      ? []
      : await buildDatabaseEvidence(
          trustedEvidence
            .filter((evidence) => !evidence.isCanonical)
            .map((evidence) => evidence.cleanName),
          type,
        );

  const canAcceptMarketplaceOnlyBooks =
    type === "books" &&
    /^(978|979)/.test(cleanedBarcode) &&
    trustedEvidence.length > 0;

  if (!hasCanonicalSignals && databaseEvidence.length === 0) {
    if (canAcceptMarketplaceOnlyBooks) {
      console.warn(
        `[Barcode API] No canonical resolver for ISBN ${cleanedBarcode}; using marketplace-only book hints.`,
      );
    } else {
      console.warn(
        `[Barcode API] No canonical resolver confirmed barcode ${cleanedBarcode} for ${type}; raw marketplace names ignored.`,
      );
      return null;
    }
  }

  const supportingEvidence = hasCanonicalSignals
    ? trustedEvidence
    : canAcceptMarketplaceOnlyBooks
      ? trustedEvidence
      : trustedEvidence.filter((evidence) =>
          databaseEvidence.some((canonical) =>
            areEvidenceSameProduct(canonical, evidence),
          ),
        );
  const allEvidence = [...databaseEvidence, ...supportingEvidence];
  if (allEvidence.length === 0) {
    console.warn(
      `[Barcode API] No usable evidence after filtering for ${cleanedBarcode} (${type})`,
    );
    return null;
  }
  const matches = resolveEvidenceToMatches(allEvidence, type, cleanedBarcode);
  const representative =
    matches[0]?.name || pickRepresentativeEvidence(allEvidence).title;
  const displayEvidence = filterDisplayEvidenceForSuggestions(allEvidence);
  const finalSuggestions = filterPlatformRedundancies(
    uniqueClean(
      matches.flatMap((match) => [match.name, ...match.suggestions]),
      { preservePlatformSuffix: type === "games" },
    ),
  ).slice(0, 15);
  const rawNames = uniqueClean(
    displayEvidence
      .sort((a, b) => b.sourceWeight - a.sourceWeight)
      .flatMap((evidence) => [evidence.title, evidence.cleanName]),
    { preservePlatformSuffix: type === "games" },
  ).slice(0, 15);
  const platformKey =
    type === "games" ? pickPlatformKeyFromEvidence(allEvidence) : null;

  return {
    provider,
    rawNames,
    cleanName: representative,
    suggestions: finalSuggestions,
    matches,
    platformKey,
  };
}

export function scoreTypeCandidate(
  candidateType: string,
  result: CompiledResult,
  barcode: string,
): number {
  const topMatch = result.matches[0];
  if (!topMatch) return 0;
  const evidence = topMatch.evidence;
  const isBookBarcode = /^(978|979)/.test(barcode);
  const isAudioBarcode = /^(498|602|724|731|886|888)/.test(barcode);

  let score = topMatch.confidence;
  score += evidence.canonicalCount * 0.08;
  score += evidence.canonicalProviders.length * 0.05;
  score += evidence.hasCover ? 0.03 : 0;
  if (candidateType === "books" && isBookBarcode) score += 0.45;
  if (candidateType === "musics" && isAudioBarcode) score += 0.3;
  if (candidateType === "games" && (result.platformKey || "").length > 0)
    score += 0.04;

  return score;
}
