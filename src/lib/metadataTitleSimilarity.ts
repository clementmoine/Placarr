import levenshtein from "fast-levenshtein";
import { normalizeDisplayTitle } from "@/lib/displayTitleScore";

export function metadataTitleSimilarity(a: string, b: string): number {
  const aTokens = normalizeDisplayTitle(a);
  const bTokens = normalizeDisplayTitle(b);
  if (aTokens.length === 0 || bTokens.length === 0) return 0;
  if (aTokens.join(" ") === bTokens.join(" ")) return 1;

  const aSet = new Set(aTokens);
  const bSet = new Set(bTokens);
  const shared = [...aSet].filter((token) => bSet.has(token)).length;
  const tokenScore = shared / Math.max(aSet.size, bSet.size);
  const normalizedA = aTokens.join(" ");
  const normalizedB = bTokens.join(" ");
  const distanceScore =
    1 -
    levenshtein.get(normalizedA, normalizedB) /
      Math.max(normalizedA.length, normalizedB.length);

  return Math.max(tokenScore, distanceScore);
}
