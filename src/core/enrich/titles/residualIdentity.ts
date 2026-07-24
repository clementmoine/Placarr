/**
 * Residual identity match — explain a candidate title with known item facts,
 * then decide on what remains unexplained.
 *
 * Identity tokenization keeps short tokens ("z" in Dragon Ball Z): we do not
 * drop information then invent spin-off word lists to recover it.
 *
 * Reject when the candidate alone adds identity (or volume/merch clash).
 * Request-only leftovers (z, sequel digit, James Bond prefix) stay uncertain
 * so existing series/sequel gates can decide — without a Z/GT/Super vocabulary.
 *
 * @see docs/word_list_audit.md
 */

export type {
  ResidualIdentityDecision,
  ResidualIdentityInput,
  ResidualIdentityResult,
} from "@/core/enrich/titles/residualIdentityTypes";
export { identityTokens } from "@/core/enrich/titles/identityTokens";
export { authorNamesFromMetadata } from "@/core/enrich/titles/residualAuthors";

import type {
  ResidualIdentityInput,
  ResidualIdentityResult,
} from "@/core/enrich/titles/residualIdentityTypes";
import { evaluatePair } from "@/core/enrich/titles/residualPairEvaluate";

/**
 * Additional alignment names (search variants / fragments) may only
 * contribute *accepts*. Reject/uncertain come from the primary request title
 * alone — otherwise a romanized "Death Note I" or short "Assassin's Creed"
 * fragment can veto a valid full-title match.
 */
export function residualIdentityMatch(
  input: ResidualIdentityInput,
): ResidualIdentityResult {
  const requestTitles = input.requestTitles.map((t) => t.trim()).filter(Boolean);
  const candidateTitles = input.candidateTitles
    .map((t) => t.trim())
    .filter(Boolean);

  if (requestTitles.length === 0 || candidateTitles.length === 0) {
    return {
      decision: "uncertain",
      residualTokens: [],
      requestResidualTokens: [],
      reasons: ["missing_titles"],
    };
  }

  const primaryRequestTitle = requestTitles[0]!;
  let bestAccept: ResidualIdentityResult | null = null;
  let bestReject: ResidualIdentityResult | null = null;
  let bestUncertain: ResidualIdentityResult | null = null;

  for (const candidateTitle of candidateTitles) {
    const result = evaluatePair(
      primaryRequestTitle,
      candidateTitle,
      input.requestAuthors,
      input.candidateAuthors,
      input.shelfType,
    );
    if (result.decision === "accept") {
      if (
        !bestAccept ||
        result.residualTokens.length < bestAccept.residualTokens.length
      ) {
        bestAccept = result;
      }
    } else if (result.decision === "reject") {
      if (!bestReject) bestReject = result;
    } else if (
      !bestUncertain ||
      result.residualTokens.length < bestUncertain.residualTokens.length
    ) {
      bestUncertain = result;
    }
  }

  for (const requestTitle of requestTitles.slice(1)) {
    for (const candidateTitle of candidateTitles) {
      const result = evaluatePair(
        requestTitle,
        candidateTitle,
        input.requestAuthors,
        input.candidateAuthors,
        input.shelfType,
      );
      if (result.decision !== "accept") continue;
      if (
        !bestAccept ||
        result.residualTokens.length < bestAccept.residualTokens.length
      ) {
        bestAccept = result;
      }
    }
  }

  return (
    bestAccept ??
    bestReject ??
    bestUncertain ?? {
      decision: "uncertain",
      residualTokens: [],
      requestResidualTokens: [],
      reasons: ["no_pair"],
    }
  );
}

/**
 * Single hardware identity gate for prix / metadata links / gallery titles.
 * Residual accept only — no soft token fallthrough (DS ↛ Nintendogs).
 */
export function hardwareProductTitlesAlign(
  requestTitle: string,
  candidateTitle: string,
): boolean {
  const request = requestTitle.trim();
  const candidate = candidateTitle.trim();
  if (!request || !candidate) return false;
  return (
    residualIdentityMatch({
      requestTitles: [request],
      candidateTitles: [candidate],
      shelfType: "hardware",
    }).decision === "accept"
  );
}

/** @deprecated structural helper kept for tests — prefer structured authors. */
export function residualLooksLikeTrailingPersonName(tokens: string[]): boolean {
  if (tokens.length < 2 || tokens.length > 4) return false;
  return tokens.every((token) => /^[a-z]{2,30}$/i.test(token) && !/\d/.test(token));
}
