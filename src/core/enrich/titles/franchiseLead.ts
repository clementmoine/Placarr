/**
 * Franchise lead tokens and parallel-series conflict checks.
 */
import { titleTokensEquivalent } from "@/core/enrich/titles/tokenEquivalents";
import { IDENTITY_VOLUME_STOP_WORDS } from "@/core/enrich/titles/identityNoise";
import { normalizeVolumeTitleText } from "@/core/enrich/titles/volumeNumber";
import { normalizeMetadataCandidateTitle } from "@/core/enrich/titles/variantIdentity";

const VOLUME_LEAD_STOP_TOKENS = IDENTITY_VOLUME_STOP_WORDS;

/**
 * Leading franchise identity before the first volume/issue marker
 * ("Naruto n°03" → ["naruto"], "Boruto no 03: Naruto Next Generations" → ["boruto"]).
 * Uses volume-aware normalization so markers are not stripped before the cut
 * (variantIdentityTokens would leak subtitle tokens like "Naruto" after "no 03").
 */
export function franchiseLeadTokens(title: string): string[] {
  const tokens = normalizeVolumeTitleText(
    normalizeMetadataCandidateTitle(title),
  )
    .split(/\s+/)
    .filter(Boolean);
  const lead: string[] = [];
  for (const token of tokens) {
    if (/^\d/.test(token)) break;
    if (VOLUME_LEAD_STOP_TOKENS.has(token.toLowerCase())) break;
    lead.push(token);
  }
  return lead;
}

export function franchiseLeadsShareRoot(
  requested: string[],
  candidate: string[],
): boolean {
  if (requested.length === 0 || candidate.length === 0) return true;

  const shorter = requested.length <= candidate.length ? requested : candidate;
  const longer = requested.length <= candidate.length ? candidate : requested;

  // Ordered prefix: "Dragon Ball" ⊆ "Dragon Ball Super".
  if (
    shorter.every((token, index) => titleTokensEquivalent(token, longer[index]))
  ) {
    return true;
  }

  // Single-token franchise inside a longer lead ("Zelda" ⊆ "legend of zelda").
  // Do not treat subtitle reuse ("Naruto" inside a Boruto lead) as agreement:
  // first tokens must still be reconcilable via containment of the short lead.
  if (
    shorter.length === 1 &&
    longer.some((other) => titleTokensEquivalent(shorter[0], other))
  ) {
    return true;
  }

  return false;
}

/**
 * Rejects parallel series that share a subtitle token but not the lead
 * franchise ("Naruto n°03" must not accept "Boruto … Naruto Next Generations").
 * Cross-language titles with no shared lead vocabulary (LOTR FR vs EN) are
 * left to similarity scoring — conflict only when both leads are short
 * franchise names and the requested lead still appears later in the candidate
 * (subtitle / spin-off pollution). Longer leads (multi-word titles) stay out
 * so provider-prefixed catalog titles ("chasseauxlivres - Fantastic Mr. Fox")
 * are not false-conflicted.
 */
export function franchiseLeadTokensConflict(
  requestedName: string,
  candidateTitle: string,
): boolean {
  const requested = franchiseLeadTokens(requestedName);
  const candidate = franchiseLeadTokens(candidateTitle);
  if (requested.length === 0 || candidate.length === 0) return false;
  if (franchiseLeadsShareRoot(requested, candidate)) return false;
  // Single-token (or very short) franchise labels only — multi-word titles
  // use similarity / other gates instead of spin-off pollution.
  if (requested.length > 2 || candidate.length > 2) return false;

  const candidateAll = normalizeVolumeTitleText(
    normalizeMetadataCandidateTitle(candidateTitle),
  )
    .split(/\s+/)
    .filter(Boolean);
  return requested.every((token) =>
    candidateAll.some((other) => titleTokensEquivalent(token, other)),
  );
}
