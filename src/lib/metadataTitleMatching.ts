import { createGameEditionMatcher } from "@/lib/barcode/listingTerms";
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
  // Title-derived and provider-canonical names are more reliable than noisy
  // marketplace barcode listings (e.g. "... Nintendo Wii FR PAL TBE Complet
  // Testé"). Order them first so high-value retries — including the base title
  // produced by buildRequestedTitleFallbackVariants — survive the per-provider
  // fallback `limit` instead of being crowded out by listing chatter.
  const canonical = orderFallbackNamesForLocale(requestedName, [
    ...collectCanonicalFallbackNames(requestedName, sources),
    ...extraNames,
  ]);
  const barcode = orderFallbackNamesForLocale(
    requestedName,
    barcodeAlternateNames,
  );

  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const name of [...canonical, ...barcode]) {
    const key = cleanSearchQuery(name).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    ordered.push(name);
  }
  return ordered;
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

  const baseTitle = extractBaseTitleVariant(requestedName);
  if (baseTitle) variants.push(baseTitle);

  return variants;
}

/**
 * Edition/reprint qualifiers that describe a *variant* of a game rather than a
 * distinct title. Kept deliberately narrow (strong markers only) so a real
 * subtitle is never mistaken for an edition.
 */
const EDITION_QUALIFIER = createGameEditionMatcher("i");

/**
 * Strips a *trailing* edition qualifier so providers that only index the base
 * game can still match:
 *   "Monopoly - Editions Classique Et Monde"            -> "Monopoly"
 *   "The Legend of Zelda: Skyward Sword - Edition Lim." -> "The Legend of Zelda: Skyward Sword"
 *
 * Splits on the LAST top-level separator (a colon or a spaced dash) so a
 * meaningful subtitle ("Skyward Sword") is preserved, and only when the trailing
 * part is an edition qualifier — never a distinct subtitle. Used as a
 * last-resort fallback name, after the full title and aliases have failed.
 */
export function extractBaseTitleVariant(requestedName: string): string | null {
  const trimmed = requestedName.trim();
  // Greedy leading group => the separator captured is the last one in the title.
  const match = trimmed.match(/^(.+)(?::\s+|\s+[-–—]\s+)(\S.*)$/);
  if (!match) return null;
  const base = match[1].trim();
  const trailing = match[2].trim();
  if (base.length < 3) return null;
  if (base.toLowerCase() === trimmed.toLowerCase()) return null;
  if (!EDITION_QUALIFIER.test(trailing)) return null;
  return base;
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

/**
 * Detects a candidate whose title is only a *generic fragment* of the requested
 * title: a strict token-subset of one of the comparison names that drops that
 * name's leading identity token. Catches false matches such as RAWG returning
 * the itch.io game "Retour vers le passé" for "The Lapins Crétins : Retour vers
 * le passé" — it shares the generic subtitle but none of the franchise identity,
 * yet still scores above the alignment threshold via token overlap.
 *
 * Legit base titles keep the leading token and are NOT flagged ("Monopoly" for
 * "Monopoly - Editions ...", "Mario Kart" for "Mario Kart Wii", "The Legend of
 * Zelda: Skyward Sword" for the same with an edition suffix).
 */
export function isGenericTitleFragment(
  candidateTitle: string | undefined,
  comparisonNames: string[],
): boolean {
  if (!candidateTitle) return false;
  const candTokens = normalizeDisplayTitle(candidateTitle);
  if (candTokens.length === 0) return false;
  const candSet = new Set(candTokens);

  let isStrictSubsetOfSome = false;
  for (const name of comparisonNames) {
    const nameTokens = normalizeDisplayTitle(name);
    if (nameTokens.length === 0) continue;
    const nameSet = new Set(nameTokens);
    if (!candTokens.every((token) => nameSet.has(token))) continue;
    if (candTokens.length >= nameTokens.length) return false; // equal/exact → aligned
    isStrictSubsetOfSome = true;
    if (candSet.has(nameTokens[0])) return false; // keeps the leading identity token
  }
  return isStrictSubsetOfSome;
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
