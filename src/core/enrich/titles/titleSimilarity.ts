/**
 * Title similarity scoring for metadata alignment and catalog labels.
 */
import levenshtein from "fast-levenshtein";
import { normalizeDisplayTitle } from "@/core/enrich/titles/displayScore";
import { titleTokensEquivalent } from "@/core/enrich/titles/tokenEquivalents";
import { distinctiveTokenCoverage } from "@/core/enrich/titles/catalogTitleTokens";
import { franchiseSequelTokens } from "@/core/enrich/titles/franchiseSequel";
import { variantIdentityTokens } from "@/core/enrich/titles/variantIdentity";
import {
  franchiseLeadTokens,
  franchiseLeadsShareRoot,
} from "@/core/enrich/titles/franchiseLead";

function franchiseSubtitleTokensAlign(
  aTokens: string[],
  bTokens: string[],
): boolean {
  if (aTokens.length < 2 || bTokens.length < 2) return true;
  if (aTokens[0] !== bTokens[0]) return true;

  const aTail = aTokens.slice(1);
  const bTail = bTokens.slice(1);
  if (aTail.length === 0 || bTail.length === 0) return true;

  return aTail.some((aToken) =>
    bTail.some((bToken) => titleTokensEquivalent(aToken, bToken)),
  );
}

export function catalogLabelSimilarity(query: string, label: string): number {
  const coverage = distinctiveTokenCoverage(query, label);
  const similarity = metadataTitleSimilarity(query, label);
  if (coverage >= 1) return Math.max(similarity, 0.85);
  if (coverage >= 0.75) return Math.max(similarity, 0.7);
  return similarity;
}

/**
 * False friends like Bakuman ↔ Batman / Bat Man: short franchise leads that
 * share no root but look close once spaces are ignored. Cap similarity so
 * provider floors at 0.55 cannot adopt the wrong series.
 */
export function compactedFranchiseNearMiss(a: string, b: string): boolean {
  const aLead = franchiseLeadTokens(a);
  const bLead = franchiseLeadTokens(b);
  if (aLead.length === 0 || bLead.length === 0) return false;
  if (franchiseLeadsShareRoot(aLead, bLead)) return false;
  if (aLead.length > 2 || bLead.length > 2) return false;

  const compactA = aLead.join("");
  const compactB = bLead.join("");
  if (compactA.length < 5 || compactB.length < 5) return false;
  if (titleTokensEquivalent(compactA, compactB)) return false;

  const distance = levenshtein.get(compactA, compactB);
  const maxLen = Math.max(compactA.length, compactB.length);
  if (distance <= 0) return false;
  // Bakuman/Batman = 2 edits on 7 chars; keep translations (unrelated strings) out.
  return distance <= 3 && distance / maxLen <= 0.4;
}

/** Below typical provider revue/series floors (0.55) for honest non-matches. */
const NON_EQUIVALENT_FRANCHISE_SIMILARITY_CAP = 0.49;

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

  // Single-token titles ("Parrain" vs "Parkan") must not align on string distance
  // alone when the sequel marker was stripped by normalizeDisplayTitle.
  // Cap strictly below provider floors (0.55) so near-misses cannot pass.
  if (
    aTokens.length === 1 &&
    bTokens.length === 1 &&
    !titleTokensEquivalent(aTokens[0], bTokens[0])
  ) {
    return Math.min(
      Math.max(tokenScore, distanceScore),
      NON_EQUIVALENT_FRANCHISE_SIMILARITY_CAP,
    );
  }

  // "Bakuman" (1 token) vs "Bat Man" (2) escapes the single-token branch but
  // collapses to the same near-miss once spaces are removed.
  if (compactedFranchiseNearMiss(a, b)) {
    return Math.min(
      Math.max(tokenScore, distanceScore),
      NON_EQUIVALENT_FRANCHISE_SIMILARITY_CAP,
    );
  }

  const sameLengthFranchisePair =
    aTokens.length === 2 &&
    bTokens.length === 2 &&
    aTokens[0] === bTokens[0] &&
    aTokens[0].length >= 4;

  if (sameLengthFranchisePair) {
    if (!franchiseSubtitleTokensAlign(aTokens, bTokens)) {
      return tokenScore;
    }
    if (aTokens[1] !== bTokens[1]) {
      return Math.max(tokenScore, distanceScore, 0.62);
    }
  }

  const aSequel = franchiseSequelTokens(a);
  const bSequel = franchiseSequelTokens(b);
  const aIdentity = variantIdentityTokens(a);
  const bIdentity = variantIdentityTokens(b);
  let sharedIdentityPrefix = 0;
  while (
    sharedIdentityPrefix < aIdentity.length &&
    sharedIdentityPrefix < bIdentity.length &&
    titleTokensEquivalent(
      aIdentity[sharedIdentityPrefix],
      bIdentity[sharedIdentityPrefix],
    )
  ) {
    sharedIdentityPrefix++;
  }
  if (
    aSequel.length > 0 &&
    bSequel.some((number) => aSequel.includes(number)) &&
    sharedIdentityPrefix >= 2 &&
    aIdentity.length >= 3 &&
    bIdentity.length >= 3
  ) {
    const aSub = aIdentity.slice(sharedIdentityPrefix);
    const bSub = bIdentity.slice(sharedIdentityPrefix);
    if (
      aSub.length > 0 &&
      bSub.length > 0 &&
      !aSub.some((token) =>
        bSub.some((other) => titleTokensEquivalent(token, other)),
      )
    ) {
      return Math.max(tokenScore, distanceScore, 0.62);
    }
  }

  // Covered subset: catalog "007 nightfire" inside shelf "james bond 007 nightfire".
  // Jaccard over the longer side undersells these. Do NOT boost a bare leading
  // franchise stem ("Black Stories" ⊆ "Black Stories - Faits vécus") — that is
  // how wrong retailer covers used to leak back into the gallery.
  const aSubsetOfB = aTokens.every((token) => bSet.has(token));
  const bSubsetOfA = bTokens.every((token) => aSet.has(token));
  if (aSubsetOfB || bSubsetOfA) {
    const shorter = aTokens.length <= bTokens.length ? aTokens : bTokens;
    const longer = aTokens.length <= bTokens.length ? bTokens : aTokens;
    const isLeadingPrefix =
      shorter.length < longer.length &&
      shorter.every((token, index) =>
        titleTokensEquivalent(token, longer[index]),
      );
    if (
      shorter.length < longer.length &&
      !isLeadingPrefix &&
      (shorter.length >= 2 ||
        shorter.some((token) => token.length >= 6 || /^\d{3}$/.test(token)))
    ) {
      return Math.max(tokenScore, distanceScore, 0.62);
    }
  }

  return Math.max(tokenScore, distanceScore);
}

