/**
 * Metadata title alignment gate (barcode/enrich accept vs reject).
 */
import { normalizeDisplayTitle } from "@/core/enrich/titles/displayScore";
import { titleTokensEquivalent } from "@/core/enrich/titles/tokenEquivalents";
import {
  explicitVolumeNumbers,
  normalizeVolumeTitleText,
  VOLUME_NUMBER_SUFFIX_PATTERN,
} from "@/core/enrich/titles/volumeNumber";
import { parseRomanToken } from "@/core/enrich/titles/romanNumeral";
import {
  EDITION_QUALIFIER,
  extractBaseTitleVariant,
} from "@/core/enrich/titles/gameEditionVariant";
import {
  allNumbers,
  normalizeEditionNumber,
} from "@/core/enrich/titles/titleNumbers";
import {
  franchiseSequelNumbersAreAligned,
  franchiseSequelNumbersConflict,
} from "@/core/enrich/titles/franchiseSequel";
import {
  authorNamesFromMetadata,
  residualIdentityMatch,
} from "@/core/enrich/titles/residualIdentity";
import {
  bundleTitlePartsMatchCatalogTitle,
  isBundleTitle,
} from "@/core/enrich/bundleTitle";
import { METADATA_TITLE_ALIGN_FLOOR } from "@/core/enrich/titles/identityThresholds";
import { namesFromMetadataSource } from "@/core/enrich/titles/metadataSearchQueries";
import { editionIdentityBasesMismatch } from "@/core/enrich/titles/editionIdentity";
import {
  compactedFranchiseNearMiss,
  metadataTitleSimilarity,
} from "@/core/enrich/titles/titleSimilarity";
import { franchiseLeadTokensConflict } from "@/core/enrich/titles/franchiseLead";
import {
  gameProductIdentityMismatch,
  isProductLineContextNoiseToken,
  normalizeMetadataCandidateTitle,
  stripProductLinePackaging,
  stripTrailingPlatformSuffix,
  variantIdentityTokens,
} from "@/core/enrich/titles/variantIdentity";
import { sameVolumeAlbumSubtitleConflicts } from "@/core/enrich/titles/albumSubtitleConflicts";
import {
  isIdentityPlatformNoiseToken,
  isIdentityVolumeStopWord,
} from "@/core/enrich/titles/identityNoise";
import {
  extractTitleIntentYear,
  preferReleaseDateMatchingTitleYear,
  stripTitleIntentYear,
  titleIntentYearAlignment,
} from "@/core/enrich/titles/intentYear";
import { cleanSearchQuery } from "@/core/enrich/search/query";
import type { MetadataResult } from "@/types/metadataProvider";

const SERIES_LINE_REJECT_REASONS = new Set([
  "request_series_line_unexplained",
  "series_suffix_mismatch",
  "series_line_extended_on_candidate",
  "short_series_marker_residual",
]);

export function hasUnrequestedVariantMarker(
  requestedName: string,
  candidateTitle: string,
): boolean {
  const result = residualIdentityMatch({
    requestTitles: [requestedName],
    candidateTitles: [candidateTitle],
  });
  return (
    result.decision === "reject" &&
    result.reasons.some((reason) => SERIES_LINE_REJECT_REASONS.has(reason))
  );
}

/**
 * Parallel product lines insert identity *before* the volume marker
 * ("Neverland Gag Manga Tome 1"). Chapter/album subtitles put identity *after*
 * the volume ("Dragon Ball 1 . Le nuage"). No vocabulary list — only token
 * order relative to the first volume-like token.
 */
export function hasUnrequestedPreVolumeProductLine(
  requestedName: string,
  candidateTitle: string,
): boolean {
  const requestSeries = variantIdentityTokens(
    stripProductLinePackaging(requestedName),
  ).filter((token) => !isProductLineContextNoiseToken(token));
  if (requestSeries.length === 0) return false;

  const tokens = normalizeMetadataCandidateTitle(
    stripProductLinePackaging(candidateTitle),
  )
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  if (tokens.length === 0) return false;

  const isVolumeLike = (token: string): boolean => {
    if (isIdentityVolumeStopWord(token)) return true;
    if (/^\d+$/.test(token)) return true;
    // Booknode / FR shorthand: T01, T4, tome-less volume tokens.
    if (/^t\d+[a-z]*$/i.test(token)) return true;
    return new RegExp(
      `^(?:n|no|nr|num|numero)?\\d+(?:${VOLUME_NUMBER_SUFFIX_PATTERN})?$`,
      "i",
    ).test(token);
  };

  const isSkippableNoise = (token: string): boolean =>
    isProductLineContextNoiseToken(token);

  let reqIdx = 0;
  let i = 0;
  while (i < tokens.length && reqIdx < requestSeries.length) {
    const token = tokens[i];
    if (isVolumeLike(token)) {
      // Volume before the request series finished — not a series+line pattern.
      return false;
    }
    if (isSkippableNoise(token)) {
      i += 1;
      continue;
    }
    if (titleTokensEquivalent(token, requestSeries[reqIdx])) {
      reqIdx += 1;
      i += 1;
      continue;
    }
    if (reqIdx === 0) {
      i += 1;
      continue;
    }
    break;
  }
  if (reqIdx < requestSeries.length) return false;

  const inserted: string[] = [];
  while (i < tokens.length) {
    const token = tokens[i];
    if (isVolumeLike(token)) break;
    if (isSkippableNoise(token)) {
      i += 1;
      continue;
    }
    inserted.push(token);
    i += 1;
  }
  // One label before the volume ("Cycle") is a section marker, not a parallel
  // product line. Parallel lines need ≥2 identity tokens ("Gag Manga").
  const identityInserted = inserted.filter((token) => !/^\d+$/.test(token));
  return identityInserted.length >= 2;
}

/**
 * Series-line / suffix conflicts without spin-off vocabularies:
 * residual identity + pre-volume product lines.
 */
export function hasUnrequestedSeriesSuffixToken(
  requestedName: string,
  candidateTitle: string,
): boolean {
  if (hasUnrequestedPreVolumeProductLine(requestedName, candidateTitle)) {
    return true;
  }
  return hasUnrequestedVariantMarker(requestedName, candidateTitle);
}

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

function editionNumbersAreAligned(
  candidateTitle: string,
  comparisonNames: string[],
): boolean {
  const requestedNumbers = Array.from(
    new Set(comparisonNames.flatMap(explicitVolumeNumbers)),
  );
  const candidateEditionNumbers = explicitVolumeNumbers(candidateTitle);

  if (requestedNumbers.length === 0) {
    if (candidateEditionNumbers.length === 0) return true;
    // Bare "WAKFU 3 Les Mines…" vs catalog "Wakfu, Tome 3 : …" — the request
    // has no "tome/n°" marker but still names the same issue number.
    const bareRequested = Array.from(
      new Set(comparisonNames.flatMap(allNumbers)),
    );
    if (bareRequested.length === 0) return false;
    const bareSet = new Set(bareRequested);
    return candidateEditionNumbers.every((number) => bareSet.has(number));
  }

  const requestedSet = new Set(requestedNumbers);
  const candidateNumbers = allNumbers(candidateTitle);
  if (!candidateNumbers.some((number) => requestedSet.has(number))) {
    return false;
  }

  return candidateEditionNumbers.every((number) => requestedSet.has(number));
}

function primaryIssueFromTitle(title: string): string | null {
  const explicit = explicitVolumeNumbers(title)[0];
  if (explicit) return explicit;

  const dotIssue = title.match(/\b(\d+)\s*\.\s+/);
  if (dotIssue?.[1]) return normalizeEditionNumber(dotIssue[1]);

  return null;
}

function compactVolumeTitleForMatch(title: string): string {
  const dotMatch = title.match(/^(.+?)\b(\d+)\s*\.\s+/);
  if (dotMatch) {
    const root = variantIdentityTokens(dotMatch[1]).join(" ");
    const issue = normalizeEditionNumber(dotMatch[2]);
    if (root && issue !== "NaN") return `${root} ${issue}`;
  }

  const issue = primaryIssueFromTitle(title);
  const root = variantIdentityTokens(title).join(" ");
  if (issue && root) return `${root} ${issue}`;
  return title.trim();
}

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

function extractNumeralRange(
  title: string,
): { start: number; end: number } | null {
  const match = title.match(/\b([IVXLCDM]+|\d+)\s*[-–—]\s*([IVXLCDM]+|\d+)\b/i);
  if (!match) return null;
  const start = parseRomanToken(match[1]) ?? Number.parseInt(match[1], 10);
  const end = parseRomanToken(match[2]) ?? Number.parseInt(match[2], 10);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    return null;
  }
  return { start, end };
}

function numeralRangesMismatch(
  requestedName: string,
  candidateTitle: string,
): boolean {
  const requested = extractNumeralRange(requestedName);
  const candidate = extractNumeralRange(candidateTitle);
  if (!requested || !candidate) return false;
  return requested.end < candidate.start || candidate.end < requested.start;
}

/** Reject descriptions that omit a distinctive colon-subtitle (e.g. Blood Dragon). */
export function descriptionMatchesRequestedTitle(
  requestedTitle: string,
  description: string,
): boolean {
  const colonMatch = requestedTitle.match(/^[^:]+:\s*([^:]+)/);
  if (!colonMatch) return true;

  const subtitle = colonMatch[1].replace(/\s+[-–—]\s+.*$/, "").trim();
  if (EDITION_QUALIFIER.test(subtitle)) return true;

  const tokens = normalizeDisplayTitle(subtitle).filter(
    (token) =>
      token.length >= 4 &&
      !["edition", "classic", "game", "the", "sur", "star"].includes(token),
  );
  if (tokens.length === 0) return true;

  const lower = description.toLowerCase();
  return tokens.some((token) => lower.includes(token));
}


export {
  BARCODE_CONFIRMED_TITLE_FLOOR,
  METADATA_TITLE_ALIGN_FLOOR,
} from "@/core/enrich/titles/identityThresholds";

export function isMetadataTitleAligned(
  result: MetadataResult,
  comparisonNames: string[],
  minScore: number = METADATA_TITLE_ALIGN_FLOOR,
  options?: { shelfType?: string | null },
): boolean {
  if (!result.title) return true;
  if (
    comparisonNames.some(
      (name) =>
        isBundleTitle(name) &&
        bundleTitlePartsMatchCatalogTitle(
          name,
          result.title || "",
          result.aliases ?? [],
        ),
    )
  ) {
    return true;
  }
  const primaryComparisonName =
    comparisonNames.find((name) => name.trim())?.trim() || "";
  // Identity / series-line gates must consider every name the provider
  // declares (primary + aliases + regional titles). Rejecting on the English
  // primary alone drops valid FR shelf matches such as LaunchBox
  // "Tomb Raider: The Last Revelation" ↔ "La Révélation Finale".
  const catalogNames = namesFromMetadataSource(result);
  const catalogTitlesForIdentity =
    catalogNames.length > 0 ? catalogNames : [result.title || ""];

  // Fact-based residual: consume known title/volume blocks, judge leftovers
  // (author, merch, volume, series line, unexplained candidate identity…).
  const residual = residualIdentityMatch({
    requestTitles: comparisonNames,
    candidateTitles: catalogTitlesForIdentity,
    candidateAuthors: authorNamesFromMetadata(result.authors),
    shelfType: options?.shelfType,
  });
  if (residual.decision === "accept") return true;
  if (residual.decision === "reject") return false;
  // Hardware: same contract as catalogTitleAlignedWithItem — residual must
  // positively accept. Soft similarity alone pairs bare consoles with games
  // that merely share the brand token (Nintendo DS → Nintendogs).
  if (options?.shelfType === "hardware") return false;

  // Merch / volume / series-line variant markers: handled by residual above.
  // "007: Agent Under Fire" looks like a generic fragment of "James Bond 007…"
  // when judged alone, but LaunchBox also declares the full Bond alias — only
  // reject when *every* declared name is a fragment.
  if (
    catalogTitlesForIdentity.every((catalogTitle) =>
      isGenericTitleFragment(catalogTitle, comparisonNames),
    )
  ) {
    return false;
  }
  if (
    primaryComparisonName &&
    catalogTitlesForIdentity.every((catalogTitle) =>
      editionIdentityBasesMismatch(primaryComparisonName, catalogTitle),
    )
  ) {
    return false;
  }
  if (
    primaryComparisonName &&
    catalogTitlesForIdentity.every((catalogTitle) =>
      franchiseLeadTokensConflict(primaryComparisonName, catalogTitle),
    )
  ) {
    return false;
  }
  if (
    primaryComparisonName &&
    catalogTitlesForIdentity.every((catalogTitle) =>
      compactedFranchiseNearMiss(primaryComparisonName, catalogTitle),
    )
  ) {
    return false;
  }
  if (
    comparisonNames.some((name) =>
      catalogTitlesForIdentity.every((catalogTitle) =>
        gameProductIdentityMismatch([name], catalogTitle),
      ),
    )
  ) {
    return false;
  }
  if (
    sameVolumeAlbumSubtitleConflicts(
      comparisonNames,
      namesFromMetadataSource(result),
    )
  ) {
    return false;
  }

  if (
    comparisonNames.some((name) => {
      const base = extractBaseTitleVariant(name);
      if (!base) return false;
      const normalizedCandidate = stripTrailingPlatformSuffix(
        result.title || "",
      );
      return normalizedCandidate.toLowerCase() === base.toLowerCase();
    })
  ) {
    return true;
  }
  if (
    comparisonNames.some((name) => {
      const trimmed = name.trim();
      if (!trimmed) return false;
      const normalizedCandidate = stripTrailingPlatformSuffix(
        result.title || "",
      );
      return normalizedCandidate.toLowerCase() === trimmed.toLowerCase();
    })
  ) {
    return true;
  }
  if (
    !catalogTitlesForIdentity.some((catalogTitle) =>
      editionNumbersAreAligned(catalogTitle, comparisonNames),
    )
  ) {
    return false;
  }
  if (
    !catalogTitlesForIdentity.some((catalogTitle) =>
      franchiseSequelNumbersAreAligned(catalogTitle, comparisonNames),
    )
  ) {
    return false;
  }
  if (
    comparisonNames.some((name) =>
      catalogTitlesForIdentity.every((catalogTitle) =>
        numeralRangesMismatch(name, catalogTitle),
      ),
    )
  ) {
    return false;
  }
  if (
    catalogTitlesForIdentity.every((catalogTitle) =>
      franchiseSequelNumbersConflict(comparisonNames, catalogTitle),
    )
  ) {
    return false;
  }
  // When residual identity is bilaterally unexplained (edition franchise
  // leftovers on both sides), score only against the primary request title.
  // Short alignment fragments from buildMetadataAlignmentNames
  // ("Nintendo Switch OLED") must not rescue a Pokémon OLED hit for a Zelda
  // OLED request — while FR↔EN subtitle pairs (Ni no Kuni) still pass on the
  // shared franchise stem.
  const scoreNames = residual.reasons.includes("bilateral_unexplained")
    ? [primaryComparisonName].filter(Boolean)
    : comparisonNames;
  if (scoreNames.length === 0) return false;
  return metadataTitleMatchScore(result, scoreNames) >= minScore;
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
    // Catalog keeps a platform-registry token from the request ("PlayStation 5"
    // for "Sony PlayStation 5") — brand prefixes are not generic subtitles.
    if (
      candTokens.some(
        (token) =>
          isIdentityPlatformNoiseToken(token) && nameSet.has(token),
      )
    ) {
      return false;
    }
    // Catalog "007: Nightfire" keeps the Bond series code from a "James Bond 007…"
    // shelf title — that code is the franchise identity, not a generic subtitle.
    if (
      candTokens.some((token) => /^\d{3}$/.test(token) && nameSet.has(token))
    ) {
      return false;
    }
  }
  return isStrictSubsetOfSome;
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
