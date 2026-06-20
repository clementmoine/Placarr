import { normalizeDisplayTitle } from "@/lib/displayTitleScore";
import { inferTextLanguage, regionRank } from "@/lib/localePreference";
import { metadataTitleSimilarity } from "@/lib/metadataTitleSimilarity";
import { cleanSearchQuery } from "@/services/metadataSearchUtils";
import { fetchFromScreenScraper } from "@/services/metadataResolvers";
import { isScreenScraperQuotaBlocked } from "@/services/providers/screenscraper/cache";
import type { MetadataResult } from "@/types/metadataProvider";

function namesFromMetadataSource(source: MetadataResult): string[] {
  const regional = (source.regionalTitles || [])
    .slice()
    .sort((a, b) => regionRank(a.region) - regionRank(b.region))
    .map((entry) => entry.text);
  return [...regional, source.title, ...(source.aliases || [])]
    .filter((value): value is string => Boolean(value?.trim()))
    .map((value) => value.trim());
}

export function collectCanonicalFallbackNames(
  requestedName: string,
  sources: Array<MetadataResult | null | undefined>,
): string[] {
  const requestedKey = cleanSearchQuery(requestedName).toLowerCase();

  return Array.from(
    new Set(
      [
        ...buildRequestedTitleFallbackVariants(requestedName),
        ...sources.flatMap((source) =>
          source ? namesFromMetadataSource(source) : [],
        ),
      ]
        .filter((value): value is string => Boolean(value?.trim()))
        .filter(
          (value) => cleanSearchQuery(value).toLowerCase() !== requestedKey,
        ),
    ),
  );
}

export function orderFallbackNamesForLocale(
  requestedName: string,
  names: string[],
): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];

  for (const value of names) {
    const trimmed = value.replace(/\s+/g, " ").trim();
    if (!trimmed) continue;
    const key = cleanSearchQuery(trimmed).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(trimmed);
  }

  return unique.slice().sort((a, b) => {
    const aFrench = inferTextLanguage(a) === "fr" ? 0 : 1;
    const bFrench = inferTextLanguage(b) === "fr" ? 0 : 1;
    if (aFrench !== bFrench) return aFrench - bFrench;

    const aScore = metadataTitleSimilarity(requestedName, a);
    const bScore = metadataTitleSimilarity(requestedName, b);
    if (aScore !== bScore) return bScore - aScore;

    return a.length - b.length;
  });
}

export function buildGameMetadataFallbackNames(
  requestedName: string,
  barcodeAlternateNames: string[],
  sources: Array<MetadataResult | null | undefined>,
  extraNames: string[] = [],
): string[] {
  return orderFallbackNamesForLocale(requestedName, [
    ...collectCanonicalFallbackNames(requestedName, sources),
    ...barcodeAlternateNames,
    ...extraNames,
  ]);
}

export function buildRequestedTitleFallbackVariants(
  requestedName: string,
): string[] {
  const variants: string[] = [];
  const normalized = requestedName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  if (/\bstar\s+wars\b/.test(normalized)) {
    const forceUnleashedNumber = normalized.match(
      /\ble\s+pouvoir\s+de\s+la\s+force\b.*\b(ii|2)\b/,
    );
    if (forceUnleashedNumber) {
      variants.push(
        "Star Wars: The Force Unleashed II",
        "Star Wars: The Force Unleashed 2",
      );
    } else if (/\ble\s+pouvoir\s+de\s+la\s+force\b/.test(normalized)) {
      variants.push("Star Wars: The Force Unleashed");
    }
  }

  const legendMatch = normalized.match(/^la\s+legende\s+du\s+(.+)$/);
  if (legendMatch?.[1]) {
    const subject = legendMatch[1]
      .replace(/\bps2\b|\bxbox\b|\bwii\b/g, "")
      .trim();
    if (subject) {
      const titledSubject = subject.replace(/\b\w/g, (char) =>
        char.toUpperCase(),
      );
      variants.push(
        `Legend of the ${titledSubject}`,
        `Legend of ${titledSubject}`,
      );
    }
  }

  variants.push(
    requestedName.replace(/\bII\b/g, "2"),
    requestedName.replace(/\bIII\b/g, "3"),
    requestedName.replace(/\bIV\b/g, "4"),
    requestedName.replace(/\b2\b/g, "II"),
    requestedName.replace(/\b3\b/g, "III"),
    requestedName.replace(/\b4\b/g, "IV"),
  );

  return variants;
}

export { metadataTitleSimilarity } from "@/lib/metadataTitleSimilarity";

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

export function screenScraperMatchScore(
  result: MetadataResult,
  comparisonNames: string[],
): number {
  const title = result.title || "";
  if (!title) return 0;

  return comparisonNames.reduce(
    (bestScore, comparisonName) =>
      Math.max(bestScore, metadataTitleSimilarity(title, comparisonName)),
    0,
  );
}

export function isMetadataTitleAligned(
  result: MetadataResult,
  comparisonNames: string[],
  minScore: number,
): boolean {
  if (!result.title) return true;
  return screenScraperMatchScore(result, comparisonNames) >= minScore;
}

export function shouldRecheckScreenScraperMatch(
  requestedName: string,
  ss: MetadataResult,
  canonicalFallbackNames: string[],
): boolean {
  if (!ss.title || canonicalFallbackNames.length === 0) return false;

  if (hasUnrequestedTrailingQualifier(requestedName, ss.title)) {
    return true;
  }

  const comparisonNames = [requestedName, ...canonicalFallbackNames];
  return screenScraperMatchScore(ss, comparisonNames) < 0.64;
}

function isBetterScreenScraperMatch(
  requestedName: string,
  current: MetadataResult,
  candidate: MetadataResult,
  canonicalFallbackNames: string[],
): boolean {
  if (!candidate.title) return false;
  const comparisonNames = [requestedName, ...canonicalFallbackNames];
  const currentScore = screenScraperMatchScore(current, comparisonNames);
  const candidateScore = screenScraperMatchScore(candidate, comparisonNames);
  const currentHasExtraQualifier = current.title
    ? hasUnrequestedTrailingQualifier(requestedName, current.title)
    : false;
  const candidateHasExtraQualifier = hasUnrequestedTrailingQualifier(
    requestedName,
    candidate.title,
  );

  if (candidateHasExtraQualifier && !currentHasExtraQualifier) return false;
  if (candidateScore >= currentScore + 0.08) return true;

  return (
    currentHasExtraQualifier &&
    !candidateHasExtraQualifier &&
    candidateScore >= 0.62
  );
}

export async function findBetterScreenScraperMatch(
  requestedName: string,
  current: MetadataResult,
  canonicalFallbackNames: string[],
  barcode?: string | null,
  platform?: string | null,
): Promise<MetadataResult | null> {
  if (isScreenScraperQuotaBlocked()) return null;

  const currentKey = cleanSearchQuery(current.title || "").toLowerCase();
  const candidates = canonicalFallbackNames.filter(
    (fallbackName) =>
      cleanSearchQuery(fallbackName).toLowerCase() !== currentKey,
  );

  for (const fallbackName of candidates.slice(0, 6)) {
    const candidate = await fetchFromScreenScraper(
      fallbackName,
      barcode,
      platform,
    );
    if (
      candidate &&
      isBetterScreenScraperMatch(
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
