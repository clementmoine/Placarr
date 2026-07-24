import { namesFromMetadataSource } from "@/core/enrich/titles/metadataSearchQueries";
import { metadataTitleSimilarity } from "@/core/enrich/titles/titleSimilarity";
import { stripTrailingPlatformSuffix } from "@/core/enrich/titles/variantIdentity";
import { compactVolumeTitleForMatch } from "@/core/enrich/titles/volumeTitleAlign";
import type { MetadataResult } from "@/types/metadataProvider";

function stripTrailingPlatformFromComparisonName(name: string): string {
  return stripTrailingPlatformSuffix(name);
}

export function metadataTitleMatchScore(
  result: MetadataResult,
  comparisonNames: string[],
): number {
  // L'alignement crédite TOUS les noms que le provider déclare pour le
  // candidat (titre + aliases + titres régionaux) : la correspondance
  // inter-langues vient de ces données, jamais d'une table de traduction.
  const candidateNames = namesFromMetadataSource(result);
  if (candidateNames.length === 0) return 0;

  return comparisonNames.reduce((bestScore, comparisonName) => {
    const normalizedComparisonName =
      stripTrailingPlatformFromComparisonName(comparisonName);
    const best = candidateNames.reduce((score, candidateName) => {
      const direct = metadataTitleSimilarity(
        candidateName,
        normalizedComparisonName,
      );
      const compact = metadataTitleSimilarity(
        compactVolumeTitleForMatch(candidateName),
        compactVolumeTitleForMatch(normalizedComparisonName),
      );
      return Math.max(score, direct, compact);
    }, 0);
    return Math.max(bestScore, best);
  }, 0);
}
