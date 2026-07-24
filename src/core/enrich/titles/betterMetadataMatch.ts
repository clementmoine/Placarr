import { normalizeDisplayTitle } from "@/core/enrich/titles/displayScore";
import {
  extractTitleIntentYear,
  preferReleaseDateMatchingTitleYear,
  stripTitleIntentYear,
  titleIntentYearAlignment,
} from "@/core/enrich/titles/intentYear";
import { cleanSearchQuery } from "@/core/enrich/search/query";
import { metadataTitleMatchScore } from "@/core/enrich/titles/metadataTitleScore";
import type { MetadataResult } from "@/types/metadataProvider";

function hasUnrequestedTrailingQualifier(
  requestedName: string,
  resultTitle: string,
): boolean {
  const segments = resultTitle
    .split(/\s*[:\-–—]\s*/g)
    .map((segment) => segment.trim())
    .filter(Boolean);
  if (segments.length < 2) return false;

  const requestedTokens = new Set(normalizeDisplayTitle(requestedName));
  const trailingTokens = normalizeDisplayTitle(segments[segments.length - 1]);
  if (trailingTokens.length === 0) return false;

  return trailingTokens.every((token) => !requestedTokens.has(token));
}

export function shouldRecheckMetadataMatch(
  requestedName: string,
  current: MetadataResult,
  canonicalFallbackNames: string[],
): boolean {
  if (!current.title) return false;

  if (
    titleIntentYearAlignment(
      extractTitleIntentYear(requestedName),
      current.releaseDate,
    ) === "mismatch"
  ) {
    return true;
  }

  if (canonicalFallbackNames.length === 0) return false;

  if (hasUnrequestedTrailingQualifier(requestedName, current.title)) {
    return true;
  }

  const comparisonNames = [requestedName, ...canonicalFallbackNames];
  return metadataTitleMatchScore(current, comparisonNames) < 0.64;
}

function isBetterMetadataMatch(
  requestedName: string,
  current: MetadataResult,
  candidate: MetadataResult,
  canonicalFallbackNames: string[],
): boolean {
  if (!candidate.title) return false;
  const comparisonNames = [requestedName, ...canonicalFallbackNames];
  const currentScore = metadataTitleMatchScore(current, comparisonNames);
  const candidateScore = metadataTitleMatchScore(candidate, comparisonNames);
  const currentHasExtraQualifier = current.title
    ? hasUnrequestedTrailingQualifier(requestedName, current.title)
    : false;
  const candidateHasExtraQualifier = hasUnrequestedTrailingQualifier(
    requestedName,
    candidate.title,
  );

  if (candidateHasExtraQualifier && !currentHasExtraQualifier) return false;

  const yearPreference = preferReleaseDateMatchingTitleYear(
    extractTitleIntentYear(requestedName),
    current.releaseDate,
    candidate.releaseDate,
  );
  if (yearPreference > 0 && candidateScore >= 0.55) return true;
  if (yearPreference < 0) return false;

  if (candidateScore >= currentScore + 0.08) return true;

  return (
    currentHasExtraQualifier &&
    !candidateHasExtraQualifier &&
    candidateScore >= 0.62
  );
}

export async function findBetterMetadataMatch(
  requestedName: string,
  current: MetadataResult,
  canonicalFallbackNames: string[],
  resolveByName: (name: string) => Promise<MetadataResult | null>,
  options?: { isQuotaBlocked?: () => boolean },
): Promise<MetadataResult | null> {
  if (options?.isQuotaBlocked?.()) return null;

  const intentYear = extractTitleIntentYear(requestedName);
  const currentYearAlign = titleIntentYearAlignment(
    intentYear,
    current.releaseDate,
  );
  const currentKey = cleanSearchQuery(current.title || "").toLowerCase();
  const tryNames: string[] = [];
  const pushName = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    const key = cleanSearchQuery(trimmed).toLowerCase();
    if (tryNames.some((name) => cleanSearchQuery(name).toLowerCase() === key)) {
      return;
    }
    // Same catalog title can still be the wrong remake/year — retry when the
    // shelf year disagrees with the current releaseDate.
    if (key === currentKey && currentYearAlign !== "mismatch") return;
    tryNames.push(trimmed);
  };

  if (currentYearAlign === "mismatch") {
    pushName(stripTitleIntentYear(requestedName) || requestedName);
  }
  for (const fallbackName of canonicalFallbackNames) {
    pushName(fallbackName);
  }

  for (const fallbackName of tryNames.slice(0, 6)) {
    const candidate = await resolveByName(fallbackName);
    if (
      candidate &&
      isBetterMetadataMatch(
        requestedName,
        current,
        candidate,
        canonicalFallbackNames,
      )
    ) {
      return candidate;
    }
  }

  return null;
}
