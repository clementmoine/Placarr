/**
 * Edition-suffix identity mismatch (Deluxe false positives).
 */
import { EDITION_QUALIFIER } from "@/core/enrich/titles/gameEditionVariant";
import { titleTokensEquivalent } from "@/core/enrich/titles/tokenEquivalents";
import { metadataTitleSimilarity } from "@/core/enrich/titles/titleSimilarity";
import { variantIdentityTokens } from "@/core/enrich/titles/variantIdentity";

export function splitEditionBaseTitle(title: string): {
  base: string;
  hasEditionSuffix: boolean;
} {
  const trimmed = title.trim();
  if (!trimmed) return { base: "", hasEditionSuffix: false };

  const match = trimmed.match(/^(.+)(?::\s+|\s+[-–—]\s+)(\S.*)$/);
  if (!match) return { base: trimmed, hasEditionSuffix: false };

  const trailing = match[2].trim();
  if (!EDITION_QUALIFIER.test(trailing)) {
    return { base: trimmed, hasEditionSuffix: false };
  }

  return { base: match[1].trim(), hasEditionSuffix: true };
}

/**
 * Rejects edition-variant false positives where only the trailing qualifier
 * overlaps ("Alan Wake II - Deluxe Edition" vs "Distraint: Deluxe Edition").
 */
export function editionIdentityBasesMismatch(
  requestedName: string,
  candidateTitle: string,
): boolean {
  const requested = splitEditionBaseTitle(requestedName);
  if (!requested.hasEditionSuffix || !requested.base) return false;

  const candidate = splitEditionBaseTitle(candidateTitle);
  const candidateIdentity = candidate.hasEditionSuffix
    ? candidate.base
    : candidateTitle.trim();
  if (!candidateIdentity) return false;

  if (metadataTitleSimilarity(requested.base, candidateIdentity) >= 0.58) {
    return false;
  }

  const requestedTokens = variantIdentityTokens(requested.base);
  const candidateTokens = variantIdentityTokens(candidateIdentity);
  if (requestedTokens.length === 0 || candidateTokens.length === 0) {
    return true;
  }

  return !requestedTokens.some((token) =>
    candidateTokens.some((other) => titleTokensEquivalent(token, other)),
  );
}

/** Exported for retailer barcode guards (deluxe false positives). */
export function catalogEditionIdentityMismatch(
  requestedName: string,
  catalogTitle: string,
): boolean {
  return editionIdentityBasesMismatch(requestedName, catalogTitle);
}

