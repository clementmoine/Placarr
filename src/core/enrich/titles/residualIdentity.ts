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
import { normalizeForTokens } from "@/core/enrich/titles/normalize";
import {
  titleTokenPresentInSet,
  titleTokensEquivalent,
} from "@/core/enrich/titles/tokenEquivalents";
import {
  IDENTITY_EDITION_PACKAGING_TOKENS,
  IDENTITY_FUNCTION_WORDS,
  IDENTITY_PLATFORM_NOISE_TOKENS,
  IDENTITY_VOLUME_STOP_WORDS,
  isIdentityListingPackagingNoise,
  isIdentityNeutralListingToken,
} from "@/core/enrich/titles/identityNoise";
import {
  explicitVolumeNumbers,
  normalizeVolumeNumber,
  normalizeVolumeTitleText,
  VOLUME_NUMBER_SUFFIX_PATTERN,
} from "@/core/enrich/titles/volumeNumber";
import { listingLooksLikeMerchAccessory } from "@/core/identify/titleUtils";

export type ResidualIdentityDecision = "accept" | "reject" | "uncertain";

export type ResidualIdentityInput = {
  requestTitles: string[];
  candidateTitles: string[];
  requestAuthors?: string[];
  candidateAuthors?: string[];
};

export type ResidualIdentityResult = {
  decision: ResidualIdentityDecision;
  residualTokens: string[];
  requestResidualTokens: string[];
  reasons: string[];
};

/** Closed taxonomy from shared identity volume stops (parution). */
const VOLUME_MARKER_TOKENS = IDENTITY_VOLUME_STOP_WORDS;

/**
 * Closed function-word taxonomy (articles / light prepositions).
 * Not product vocabulary — keeps "le nuage" from counting "le" as identity.
 */
const FUNCTION_WORDS = IDENTITY_FUNCTION_WORDS;

const PLATFORM_NOISE_TOKENS = IDENTITY_PLATFORM_NOISE_TOKENS;

const EDITION_PACKAGING_TOKENS = IDENTITY_EDITION_PACKAGING_TOKENS;

const VOLUME_MARKER_RES = [
  `\\bn[°º]?\\s*0*\\d+`,
  `\\btome\\s*0*\\d+`,
  `\\bvol\\.?\\s*0*\\d+`,
  `\\bno\\.?\\s*0*\\d+`,
].map(
  (marker) =>
    new RegExp(`${marker}(?:\\s?${VOLUME_NUMBER_SUFFIX_PATTERN})?\\b`, "gi"),
);

const SUFFIXED_NUMBER_RE = new RegExp(
  `\\d+(?:\\s?${VOLUME_NUMBER_SUFFIX_PATTERN})?`,
  "g",
);

function allNumbers(value: string): string[] {
  return Array.from(
    new Set(
      (normalizeVolumeTitleText(value).match(SUFFIXED_NUMBER_RE) || [])
        .map(normalizeVolumeNumber)
        .filter((number) => number !== "NaN"),
    ),
  );
}

function isPackagingNoiseToken(token: string): boolean {
  const lower = token.toLowerCase();
  if (VOLUME_MARKER_TOKENS.has(lower)) return true;
  // Platform connectors ("sur PS4") — not articles that affect series order.
  if (lower === "sur" || lower === "on" || lower === "for") return true;
  if (PLATFORM_NOISE_TOKENS.has(lower)) return true;
  if (EDITION_PACKAGING_TOKENS.has(lower)) return true;
  if (isIdentityNeutralListingToken(token)) return true;
  if (isIdentityListingPackagingNoise(token)) return true;
  return false;
}

/** Drop articles / T01 shorthands when judging unexplained identity. Keep digits. */
function significantTokens(tokens: string[]): string[] {
  return tokens.filter(
    (token) =>
      !FUNCTION_WORDS.has(token.toLowerCase()) &&
      !/^t\d+[a-z]*$/i.test(token),
  );
}

/**
 * Identity tokens: keep short letters ("z") and function words for order.
 * Strip volume markers / edition packaging / platform-registry noise only.
 */
export function identityTokens(title: string): string[] {
  let withoutVolume = title;
  for (const marker of VOLUME_MARKER_RES) {
    withoutVolume = withoutVolume.replace(marker, " ");
  }
  withoutVolume = withoutVolume
    .replace(/\b(?:game\s+of\s+the\s+year|goty)(?:\s+edition)?\b/gi, " ")
    .replace(/\b(?:day\s+one|first\s+day)(?:\s+edition)?\b/gi, " ");

  return normalizeForTokens(withoutVolume)
    .replace(/[’‘']/g, "")
    .replace(/&/g, " and ")
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 1 && !isPackagingNoiseToken(token));
}

function authorTokens(authors: string[] | undefined): Set<string> {
  const out = new Set<string>();
  for (const author of authors ?? []) {
    for (const token of identityTokens(author)) {
      out.add(token);
    }
    for (const piece of author.split(/[,/&]+/)) {
      for (const token of identityTokens(piece)) {
        out.add(token);
      }
    }
  }
  return out;
}

function consumeEquivalentTokens(
  haystack: string[],
  needles: string[],
): { remaining: string[]; matched: string[] } {
  const remaining = [...haystack];
  const matched: string[] = [];
  for (const needle of needles) {
    const idx = remaining.findIndex((token) =>
      titleTokensEquivalent(token, needle),
    );
    if (idx < 0) continue;
    matched.push(remaining[idx]);
    remaining.splice(idx, 1);
  }
  return { remaining, matched };
}

/**
 * Shared issue number: explicit on both sides, or request explicit matched
 * against any number on the candidate ("Dragon Ball 1 . …").
 */
function volumesMatched(requestTitle: string, candidateTitle: string): boolean {
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

function volumesConflict(requestTitle: string, candidateTitle: string): boolean {
  const requestVolumes = explicitVolumeNumbers(requestTitle);
  const candidateVolumes = explicitVolumeNumbers(candidateTitle);
  if (requestVolumes.length === 0 || candidateVolumes.length === 0) {
    return false;
  }
  return !requestVolumes.some((volume) => candidateVolumes.includes(volume));
}

/** Request names an issue; candidate has no matching number at all. */
function volumeMissingOnCandidate(
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
function unrequestedVolumeOnCandidate(
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

function residualCoveredByAuthors(
  residual: string[],
  requestAuthors: string[] | undefined,
  candidateAuthors: string[] | undefined,
): boolean {
  if (residual.length === 0) return true;
  const known = new Set([
    ...authorTokens(requestAuthors),
    ...authorTokens(candidateAuthors),
  ]);
  if (known.size === 0) return false;
  return residual.every((token) => titleTokenPresentInSet(token, known));
}

function evaluatePair(
  requestTitle: string,
  candidateTitle: string,
  requestAuthors: string[] | undefined,
  candidateAuthors: string[] | undefined,
): ResidualIdentityResult {
  const reasons: string[] = [];

  if (
    !listingLooksLikeMerchAccessory(requestTitle) &&
    listingLooksLikeMerchAccessory(candidateTitle)
  ) {
    return {
      decision: "reject",
      residualTokens: identityTokens(candidateTitle),
      requestResidualTokens: identityTokens(requestTitle),
      reasons: ["merch_accessory"],
    };
  }

  if (volumesConflict(requestTitle, candidateTitle)) {
    return {
      decision: "reject",
      residualTokens: identityTokens(candidateTitle),
      requestResidualTokens: identityTokens(requestTitle),
      reasons: ["volume_conflict"],
    };
  }

  if (volumeMissingOnCandidate(requestTitle, candidateTitle)) {
    return {
      decision: "reject",
      residualTokens: identityTokens(candidateTitle),
      requestResidualTokens: identityTokens(requestTitle),
      reasons: ["volume_missing_on_candidate"],
    };
  }

  if (unrequestedVolumeOnCandidate(requestTitle, candidateTitle)) {
    return {
      decision: "reject",
      residualTokens: identityTokens(candidateTitle),
      requestResidualTokens: identityTokens(requestTitle),
      reasons: ["unrequested_volume_on_candidate"],
    };
  }

  const requestTokens = identityTokens(requestTitle);
  const candidateTokens = identityTokens(candidateTitle);
  if (requestTokens.length === 0 || candidateTokens.length === 0) {
    return {
      decision: "uncertain",
      residualTokens: candidateTokens,
      requestResidualTokens: requestTokens,
      reasons: ["empty_tokens"],
    };
  }

  const { remaining: afterRequest, matched } = consumeEquivalentTokens(
    candidateTokens,
    requestTokens,
  );
  const requestStillUnmatched = [...requestTokens];
  for (const m of matched) {
    const idx = requestStillUnmatched.findIndex((t) =>
      titleTokensEquivalent(t, m),
    );
    if (idx >= 0) requestStillUnmatched.splice(idx, 1);
  }

  // Parenthetical arabic restatement of an already-matched roman sequel
  // ("Alan Wake II (2)") must not count as new candidate identity.
  const residual = significantTokens(afterRequest).filter(
    (token) => !matched.some((m) => titleTokensEquivalent(token, m)),
  );
  const requestUnmatchedSignificant = significantTokens(requestStillUnmatched);
  const volMatched = volumesMatched(requestTitle, candidateTitle);

  const seriesLine = orderedSeriesLineConflict(requestTokens, candidateTokens);
  if (seriesLine === "request_line_missing_on_candidate") {
    reasons.push("request_series_line_unexplained");
    return {
      decision: "reject",
      residualTokens: residual,
      requestResidualTokens: requestUnmatchedSignificant,
      reasons,
    };
  }
  if (seriesLine === "series_suffix_mismatch") {
    reasons.push("series_suffix_mismatch");
    return {
      decision: "reject",
      residualTokens: residual,
      requestResidualTokens: requestUnmatchedSignificant,
      reasons,
    };
  }
  if (seriesLine === "series_line_extended_on_candidate") {
    reasons.push("series_line_extended_on_candidate");
    return {
      decision: "reject",
      residualTokens: residual,
      requestResidualTokens: requestUnmatchedSignificant,
      reasons,
    };
  }

  if (requestUnmatchedSignificant.length > 0) {
    reasons.push(
      residual.length > 0 ? "bilateral_unexplained" : "request_unexplained",
    );
    return {
      decision: "uncertain",
      residualTokens: residual,
      requestResidualTokens: requestUnmatchedSignificant,
      reasons,
    };
  }

  if (residual.length === 0) {
    if (volMatched || matched.length > 0) {
      reasons.push(
        volMatched ? "empty_residual_volume_matched" : "empty_residual_covered",
      );
      return {
        decision: "accept",
        residualTokens: [],
        requestResidualTokens: [],
        reasons,
      };
    }
    reasons.push("empty_residual");
    return {
      decision: "uncertain",
      residualTokens: [],
      requestResidualTokens: [],
      reasons,
    };
  }

  if (residualCoveredByAuthors(residual, requestAuthors, candidateAuthors)) {
    const requestVolumes = explicitVolumeNumbers(requestTitle);
    if (requestVolumes.length > 0 && !volMatched) {
      reasons.push("author_covered_but_volume_unmatched");
      return {
        decision: "uncertain",
        residualTokens: residual,
        requestResidualTokens: [],
        reasons,
      };
    }
    reasons.push("author_covered");
    return {
      decision: "accept",
      residualTokens: residual,
      requestResidualTokens: [],
      reasons,
    };
  }

  const seriesMarkerResidual = residual.filter(
    (token) =>
      token !== "x" &&
      !/^\d+$/.test(token) &&
      !/^t\d+[a-z]*$/i.test(token),
  );
  if (
    volMatched &&
    seriesMarkerResidual.some((token) => token.length <= 3)
  ) {
    reasons.push("short_series_marker_residual");
    return {
      decision: "reject",
      residualTokens: residual,
      requestResidualTokens: [],
      reasons,
    };
  }

  if (!volMatched) {
    const candidateHasVolume =
      explicitVolumeNumbers(candidateTitle).length > 0;
    const requestHasVolume = explicitVolumeNumbers(requestTitle).length > 0;
    if (candidateHasVolume && !requestHasVolume) {
      const reqSig = significantTokens(requestTokens);
      const candSig = significantTokens(candidateTokens);
      const isCollectionPrefix =
        reqSig.length <= candSig.length &&
        reqSig.every((token, index) =>
          titleTokensEquivalent(token, candSig[index] ?? ""),
        );
      if (!isCollectionPrefix) {
        reasons.push("subtitle_query_with_candidate_volume");
        return {
          decision: "uncertain",
          residualTokens: residual,
          requestResidualTokens: [],
          reasons,
        };
      }
    }
    reasons.push("unexplained_candidate_identity");
    return {
      decision: "reject",
      residualTokens: residual,
      requestResidualTokens: [],
      reasons,
    };
  }

  reasons.push("ambiguous_residual_with_volume");
  return {
    decision: "uncertain",
    residualTokens: residual,
    requestResidualTokens: [],
    reasons,
  };
}

/**
 * Ordered token prefix ≥ 2, then compare suffixes.
 * - Request line missing on candidate → sibling series
 * - Compact suffix mismatch → sibling series
 * - Request line ordered-prefix of candidate line with extras ("super livre")
 */
function orderedSeriesLineConflict(
  requestTokens: string[],
  candidateTokens: string[],
):
  | "request_line_missing_on_candidate"
  | "series_suffix_mismatch"
  | "series_line_extended_on_candidate"
  | null {
  let prefixLen = 0;
  while (
    prefixLen < requestTokens.length &&
    prefixLen < candidateTokens.length &&
    titleTokensEquivalent(requestTokens[prefixLen], candidateTokens[prefixLen])
  ) {
    prefixLen += 1;
  }
  if (prefixLen < 2) return null;

  const requestSuffix = requestTokens.slice(prefixLen);
  const candidateSuffix = candidateTokens.slice(prefixLen);
  const reqSig = significantTokens(requestSuffix);
  const candSig = significantTokens(candidateSuffix);

  if (reqSig.length === 0) return null;
  if (reqSig.every((token) => /^\d+$/.test(token))) return null;

  if (candSig.length === 0) {
    return "request_line_missing_on_candidate";
  }

  if (
    candSig.length > reqSig.length &&
    reqSig.every((token, index) =>
      titleTokensEquivalent(token, candSig[index] ?? ""),
    )
  ) {
    return "series_line_extended_on_candidate";
  }

  const shares = reqSig.some((token) =>
    candSig.some((other) => titleTokensEquivalent(token, other)),
  );
  if (shares) return null;

  if (reqSig.length >= 2 && candSig.length >= 2) return null;

  const isCompactLine = (suffix: string[]) =>
    suffix.length <= 2 && suffix.every((token) => token.length <= 8);

  if (isCompactLine(reqSig) || isCompactLine(candSig)) {
    return "series_suffix_mismatch";
  }
  return null;
}

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

export function authorNamesFromMetadata(
  authors: Array<{ name: string }> | undefined,
): string[] {
  return (authors ?? []).map((a) => a.name).filter(Boolean);
}

/** @deprecated structural helper kept for tests — prefer structured authors. */
export function residualLooksLikeTrailingPersonName(tokens: string[]): boolean {
  if (tokens.length < 2 || tokens.length > 4) return false;
  return tokens.every((token) => /^[a-z]{2,30}$/i.test(token) && !/\d/.test(token));
}
