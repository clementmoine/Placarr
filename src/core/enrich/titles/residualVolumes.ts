import { titleTokensEquivalent } from "@/core/enrich/titles/tokenEquivalents";
import { allNumbers } from "@/core/enrich/titles/titleNumbers";
import { explicitVolumeNumbers } from "@/core/enrich/titles/volumeNumber";
import { identityTokens } from "@/core/enrich/titles/identityTokens";

/**
 * Shared issue number: explicit on both sides, or request explicit matched
 * against any number on the candidate ("Dragon Ball 1 . …").
 */
export function volumesMatched(
  requestTitle: string,
  candidateTitle: string,
): boolean {
  const requestVolumes = explicitVolumeNumbers(requestTitle);
  const candidateVolumes = explicitVolumeNumbers(candidateTitle);
  if (
    requestVolumes.length > 0 &&
    candidateVolumes.some((volume) => requestVolumes.includes(volume))
  ) {
    return true;
  }
  if (requestVolumes.length > 0) {
    const candidateNumbers = allNumbers(candidateTitle);
    return requestVolumes.some((volume) => candidateNumbers.includes(volume));
  }
  if (candidateVolumes.length > 0) {
    const requestNumbers = allNumbers(requestTitle);
    return candidateVolumes.some((volume) => requestNumbers.includes(volume));
  }
  return false;
}

export function volumesConflict(
  requestTitle: string,
  candidateTitle: string,
): boolean {
  const requestVolumes = explicitVolumeNumbers(requestTitle);
  const candidateVolumes = explicitVolumeNumbers(candidateTitle);
  if (requestVolumes.length === 0 || candidateVolumes.length === 0) {
    return false;
  }
  return !requestVolumes.some((volume) => candidateVolumes.includes(volume));
}

/** Request names an issue; candidate has no matching number at all. */
export function volumeMissingOnCandidate(
  requestTitle: string,
  candidateTitle: string,
): boolean {
  const requestVolumes = explicitVolumeNumbers(requestTitle);
  if (requestVolumes.length === 0) return false;
  const candidateNumbers = allNumbers(candidateTitle);
  return !requestVolumes.some((volume) => candidateNumbers.includes(volume));
}

/**
 * Candidate is a numbered volume while the request is only the collection
 * (no explicit issue and no bare number matching that volume).
 */
export function unrequestedVolumeOnCandidate(
  requestTitle: string,
  candidateTitle: string,
): boolean {
  const requestVolumes = explicitVolumeNumbers(requestTitle);
  if (requestVolumes.length > 0) return false;
  const candidateVolumes = explicitVolumeNumbers(candidateTitle);
  if (candidateVolumes.length === 0) return false;
  const bareRequest = allNumbers(requestTitle);
  if (bareRequest.length > 0) {
    return !candidateVolumes.every((volume) => bareRequest.includes(volume));
  }

  const requestTokens = identityTokens(requestTitle);
  const candidateTokens = identityTokens(candidateTitle);
  if (requestTokens.length === 0) return true;

  // Album subtitle query ("Astérix et Cléopâtre") — tokens appear in the
  // candidate but are not an ordered collection prefix. Allow alignment.
  const isOrderedPrefix =
    requestTokens.length <= candidateTokens.length &&
    requestTokens.every((token, index) =>
      titleTokensEquivalent(token, candidateTokens[index] ?? ""),
    );
  if (!isOrderedPrefix) {
    const allFound = requestTokens.every((token) =>
      candidateTokens.some((other) => titleTokensEquivalent(token, other)),
    );
    if (allFound) return false;
  }

  return true;
}
