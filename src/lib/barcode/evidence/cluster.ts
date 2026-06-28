import levenshtein from "fast-levenshtein";

import {
  getSequelIndicators,
  normalizeForTokens,
} from "@/lib/barcode/titleUtils";
import { getRepresentativeScore } from "@/lib/title/displayScore";

type SuggestionWithPriority = {
  value: string;
  priority: number;
};

export function clusterSuggestions(
  suggestions: SuggestionWithPriority[],
): { name: string; suggestions: string[] }[] {
  const clusters: {
    representative: SuggestionWithPriority;
    members: SuggestionWithPriority[];
  }[] = [];

  for (const item of suggestions) {
    const cleanName = item.value.trim();
    if (!cleanName) continue;

    let bestClusterIndex = -1;
    let bestScore = 0;

    for (let i = 0; i < clusters.length; i++) {
      const rep = clusters[i].representative.value.toLowerCase();
      const candidate = cleanName.toLowerCase();
      const repNorm = normalizeForTokens(rep);
      const candNorm = normalizeForTokens(candidate);

      const dist = levenshtein.get(rep, candidate);
      const maxLen = Math.max(rep.length, candidate.length);
      const similarity = maxLen > 0 ? 1 - dist / maxLen : 0;

      const containsMatch = rep.includes(candidate) || candidate.includes(rep);

      const repTokens = new Set(repNorm.split(/[^a-z0-9]+/));
      const candTokens = new Set(candNorm.split(/[^a-z0-9]+/));
      const intersection = [...repTokens].filter(
        (t) => t.length > 3 && candTokens.has(t),
      );

      const repIndicators = getSequelIndicators(repNorm);
      const candIndicators = getSequelIndicators(candNorm);
      let indicatorsDifferent = false;
      if (repIndicators.size !== candIndicators.size) {
        indicatorsDifferent = true;
      } else {
        for (const ind of repIndicators) {
          if (!candIndicators.has(ind)) {
            indicatorsDifferent = true;
            break;
          }
        }
      }

      const repFirstSig = [...repTokens].find((t) => t.length > 3);
      const candFirstSig = [...candTokens].find((t) => t.length > 3);
      const shareFirstSig =
        repFirstSig && candFirstSig && repFirstSig === candFirstSig;

      if (
        !indicatorsDifferent &&
        (similarity > 0.45 ||
          containsMatch ||
          intersection.length >= 2 ||
          (shareFirstSig && similarity > 0.2))
      ) {
        const score =
          similarity + intersection.length * 0.06 + (containsMatch ? 0.25 : 0);
        if (score > bestScore) {
          bestScore = score;
          bestClusterIndex = i;
        }
      }
    }

    if (bestClusterIndex !== -1) {
      clusters[bestClusterIndex].members.push(item);

      const currentRep = clusters[bestClusterIndex].representative;
      const repScore = getRepresentativeScore(
        currentRep.value,
        currentRep.priority,
      );
      const candScore = getRepresentativeScore(item.value, item.priority);

      if (candScore > repScore) {
        clusters[bestClusterIndex].representative = item;
      } else if (candScore === repScore) {
        if (item.value.length < currentRep.value.length) {
          clusters[bestClusterIndex].representative = item;
        }
      }
    } else {
      clusters.push({
        representative: item,
        members: [item],
      });
    }
  }

  return clusters.map((c) => {
    const seen = new Set<string>();
    const unique = [];
    for (const m of c.members) {
      const norm = m.value.toLowerCase().trim();
      if (!seen.has(norm)) {
        seen.add(norm);
        unique.push(m.value);
      }
    }
    return {
      name: c.representative.value,
      suggestions: unique,
    };
  });
}
