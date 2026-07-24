/**
 * Same-volume album subtitle conflicts (tome N : different issue names).
 */
import { normalizeDisplayTitle } from "@/core/enrich/titles/displayScore";
import { titleTokenPresentInSet } from "@/core/enrich/titles/tokenEquivalents";
import { explicitVolumeNumbers } from "@/core/enrich/titles/volumeNumber";
import {
  IDENTITY_EDITION_PACKAGING_TOKENS,
  IDENTITY_VOLUME_STOP_WORDS,
} from "@/core/enrich/titles/identityNoise";
import {
  catalogMatchTokenSet,
  distinctiveTitleTokens,
} from "@/core/enrich/titles/catalogTitleTokens";
import { allNumbers } from "@/core/enrich/titles/titleNumbers";

const VOLUME_LABEL_NOISE_TOKENS = new Set([
  ...IDENTITY_VOLUME_STOP_WORDS,
  ...IDENTITY_EDITION_PACKAGING_TOKENS,
]);

export function specificSubtitleTokens(title: string): string[] {
  const segments = title
    .split(/\s*(?::|[-–—])\s*/g)
    .map((segment) => segment.trim())
    .filter(Boolean);
  if (segments.length < 2) return [];

  return Array.from(
    new Set(
      segments
        .slice(1)
        .flatMap((segment) => normalizeDisplayTitle(segment))
        .filter(
          (token) =>
            token.length > 3 && !VOLUME_LABEL_NOISE_TOKENS.has(token),
        ),
    ),
  );
}

/**
 * Album/issue-specific tokens beyond the franchise stem (e.g. "mines",
 * "lamororia" in "WAKFU 3 Les Mines de Lamororia"). Empty when the request is
 * only franchise + volume ("Wakfu Tome 3").
 */
export function albumSpecificDistinctiveTokens(title: string): string[] {
  const fromSubtitle = specificSubtitleTokens(title);
  if (fromSubtitle.length > 0) return fromSubtitle;

  const tokens = distinctiveTitleTokens(title).filter(
    (token) => !VOLUME_LABEL_NOISE_TOKENS.has(token) && !/^\d+$/.test(token),
  );
  if (tokens.length <= 1) return [];
  return tokens.slice(1);
}

function albumTokenCoverage(required: string[], candidateTitle: string): number {
  if (required.length === 0) return 1;
  const candidateTokens = catalogMatchTokenSet(candidateTitle);
  const matched = required.filter((token) =>
    titleTokenPresentInSet(token, candidateTokens),
  ).length;
  return matched / required.length;
}

/**
 * Same numbered album (tome/n°/bare N) but a different album subtitle — the
 * Wakfu "tome 3 : Mines" vs "tome 3 : Shak Shaka" case. Cross-language game
 * subtitles (FR vs EN) are out of scope: they lack explicit volume markers.
 */
export function sameVolumeAlbumSubtitleConflicts(
  comparisonNames: string[],
  candidateNames: string[],
): boolean {
  const requestedExplicit = Array.from(
    new Set(comparisonNames.flatMap(explicitVolumeNumbers)),
  );
  const requestedBare = Array.from(
    new Set(comparisonNames.flatMap(allNumbers)),
  );

  const reqAlbumGroups = comparisonNames
    .map(albumSpecificDistinctiveTokens)
    .filter((tokens) => tokens.length >= 2);
  if (reqAlbumGroups.length === 0) return false;

  let sawVolumeAlignedCandidate = false;
  for (const candidate of candidateNames) {
    const candidateExplicit = explicitVolumeNumbers(candidate);
    const volumeAligned =
      (requestedExplicit.length > 0 &&
        candidateExplicit.some((number) =>
          requestedExplicit.includes(number),
        )) ||
      (requestedExplicit.length === 0 &&
        candidateExplicit.length > 0 &&
        candidateExplicit.every((number) => requestedBare.includes(number)));
    if (!volumeAligned) continue;
    sawVolumeAlignedCandidate = true;

    const candAlbum = albumSpecificDistinctiveTokens(candidate);
    if (candAlbum.length < 2) continue;

    if (
      reqAlbumGroups.some(
        (required) => albumTokenCoverage(required, candidate) >= 0.75,
      )
    ) {
      return false;
    }
  }

  return sawVolumeAlignedCandidate;
}

