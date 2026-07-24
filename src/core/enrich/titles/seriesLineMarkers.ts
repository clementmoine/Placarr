import { titleTokensEquivalent } from "@/core/enrich/titles/tokenEquivalents";
import { VOLUME_NUMBER_SUFFIX_PATTERN } from "@/core/enrich/titles/volumeNumber";
import { residualIdentityMatch } from "@/core/enrich/titles/residualIdentity";
import {
  isProductLineContextNoiseToken,
  normalizeMetadataCandidateTitle,
  stripProductLinePackaging,
  variantIdentityTokens,
} from "@/core/enrich/titles/variantIdentity";
import { isIdentityVolumeStopWord } from "@/core/enrich/titles/identityNoise";

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
