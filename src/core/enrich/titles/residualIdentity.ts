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
  hardwareFinishConflict,
  hardwareFormFactorConflict,
  hardwareStorageCapacityConflict,
  isHardwareCatalogChromeToken,
  isHardwareControllerFamilyToken,
  isIdentityListingPackagingNoise,
  isIdentityNeutralListingToken,
  isIdentityPlatformNoiseToken,
} from "@/core/enrich/titles/identityNoise";
import {
  explicitVolumeNumbers,
  normalizeVolumeNumber,
  normalizeVolumeTitleText,
  VOLUME_NUMBER_SUFFIX_PATTERN,
} from "@/core/enrich/titles/volumeNumber";
import {
  listingAddsUnrequestedControllerAccessory,
  listingAddsUnrequestedConsoleSystem,
  listingLooksLikeConsoleSystemProduct,
  listingLooksLikeControllerProduct,
  listingLooksLikeMerchAccessory,
  listingLooksLikePlatformControllerBundle,
} from "@/core/identify/listingMerch";
import {
  canonicalizeVideoGamePlatformAliasSpan,
  createTrailingVideoGamePlatformSuffixMatcher,
  detectVideoGamePlatformKey,
} from "@/core/identify/platforms/platforms";

export type ResidualIdentityDecision = "accept" | "reject" | "uncertain";

export type ResidualIdentityInput = {
  requestTitles: string[];
  candidateTitles: string[];
  requestAuthors?: string[];
  candidateAuthors?: string[];
  /** When `hardware`, platform tokens are identity and catalog chrome is noise. */
  shelfType?: string | null;
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

/** Marketplace trailing platforms ("… sur NEOGEO AES+") are not identity. */
const TRAILING_PLATFORM_SUFFIX_MATCHER =
  createTrailingVideoGamePlatformSuffixMatcher("i");

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

function isPackagingNoiseToken(
  token: string,
  shelfType?: string | null,
): boolean {
  const lower = token.toLowerCase();
  if (VOLUME_MARKER_TOKENS.has(lower)) return true;
  // Platform connectors ("sur PS4") — not articles that affect series order.
  if (lower === "sur" || lower === "on" || lower === "for") return true;
  // On hardware shelves the platform *is* the product (Switch OLED, PS5…).
  if (shelfType !== "hardware" && PLATFORM_NOISE_TOKENS.has(lower)) {
    return true;
  }
  if (shelfType === "hardware" && isHardwareCatalogChromeToken(token)) {
    return true;
  }
  if (EDITION_PACKAGING_TOKENS.has(lower)) return true;
  if (isIdentityNeutralListingToken(token)) {
    // Neutral listing includes platform tokens — keep them on hardware.
    if (shelfType === "hardware" && isIdentityPlatformNoiseToken(token)) {
      return false;
    }
    return true;
  }
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
 * Pass `shelfType: "hardware"` so console/platform tokens stay as identity.
 */
export function identityTokens(
  title: string,
  shelfType?: string | null,
): string[] {
  let withoutVolume = title;
  // Game/media shelves: drop trailing marketplace platform SKUs before
  // tokenizing so "AES+" in "… sur NEOGEO AES+" is not unexplained identity.
  if (shelfType !== "hardware") {
    withoutVolume = withoutVolume.replace(TRAILING_PLATFORM_SUFFIX_MATCHER, " ");
  }
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
    .filter(
      (token) =>
        token.length >= 1 && !isPackagingNoiseToken(token, shelfType),
    );
}

function authorTokens(
  authors: string[] | undefined,
  shelfType?: string | null,
): Set<string> {
  const out = new Set<string>();
  for (const author of authors ?? []) {
    for (const token of identityTokens(author, shelfType)) {
      out.add(token);
    }
    for (const piece of author.split(/[,/&]+/)) {
      for (const token of identityTokens(piece, shelfType)) {
        out.add(token);
      }
    }
  }
  return out;
}

function tokensEquivalentForShelf(
  a: string,
  b: string,
  shelfType?: string | null,
): boolean {
  if (titleTokensEquivalent(a, b)) return true;
  if (
    shelfType === "hardware" &&
    isHardwareControllerFamilyToken(a) &&
    isHardwareControllerFamilyToken(b)
  ) {
    return true;
  }
  return false;
}

/**
 * "PS4" in the request is covered once the catalog already matched
 * PlayStation + 4 (and the same for PS5 / PS3 / …).
 */
function hardwarePlatformAbbrevCoveredByMatched(
  token: string,
  matched: readonly string[],
): boolean {
  const lower = token.toLowerCase();
  const matchedSet = new Set(matched.map((entry) => entry.toLowerCase()));
  const abbrev: Record<string, [string, string]> = {
    ps1: ["playstation", "1"],
    ps2: ["playstation", "2"],
    ps3: ["playstation", "3"],
    ps4: ["playstation", "4"],
    ps5: ["playstation", "5"],
  };
  const pair = abbrev[lower];
  if (!pair) return false;
  return matchedSet.has(pair[0]) && matchedSet.has(pair[1]);
}

/**
 * Unmatched request tokens that sit *after* the matched console core — edition
 * franchise lines, not leading brand chrome ("Sony") or single color SKUs.
 */
function hardwareRequestEditionFranchiseTokens(
  requestTokens: string[],
  matched: string[],
  requestUnmatchedSignificant: string[],
): string[] {
  if (matched.length === 0 || requestUnmatchedSignificant.length === 0) {
    return [];
  }
  let firstMatchedIdx = -1;
  for (let i = 0; i < requestTokens.length; i++) {
    if (
      matched.some((m) => tokensEquivalentForShelf(requestTokens[i]!, m, "hardware"))
    ) {
      firstMatchedIdx = i;
      break;
    }
  }
  if (firstMatchedIdx < 0) return requestUnmatchedSignificant;
  const leading = new Set(
    significantTokens(requestTokens.slice(0, firstMatchedIdx)),
  );
  return requestUnmatchedSignificant.filter(
    (token) => !titleTokenPresentInSet(token, leading),
  );
}

function consumeEquivalentTokens(
  haystack: string[],
  needles: string[],
  shelfType?: string | null,
): { remaining: string[]; matched: string[] } {
  const remaining = [...haystack];
  const matched: string[] = [];
  let needleIndex = 0;
  while (needleIndex < needles.length) {
    const needle = needles[needleIndex]!;
    const nextNeedle = needles[needleIndex + 1];

    const idx = remaining.findIndex((token) =>
      tokensEquivalentForShelf(token, needle, shelfType),
    );
    if (idx >= 0) {
      matched.push(remaining[idx]!);
      remaining.splice(idx, 1);
      needleIndex += 1;
      continue;
    }

    // "joycon" ↔ adjacent "joy"+"con" (PriceCharting splits Joy-Con).
    const adjacentIdx = remaining.findIndex(
      (token, index) =>
        index + 1 < remaining.length &&
        titleTokensEquivalent(
          `${token}${remaining[index + 1]}`,
          needle,
        ),
    );
    if (adjacentIdx >= 0) {
      matched.push(needle);
      remaining.splice(adjacentIdx, 2);
      needleIndex += 1;
      continue;
    }

    // Reverse: request "joy"+"con" ↔ catalog "joycon".
    if (nextNeedle) {
      const compoundIdx = remaining.findIndex((token) =>
        titleTokensEquivalent(token, `${needle}${nextNeedle}`),
      );
      if (compoundIdx >= 0) {
        matched.push(needle, nextNeedle);
        remaining.splice(compoundIdx, 1);
        needleIndex += 2;
        continue;
      }
    }

    needleIndex += 1;
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
  shelfType?: string | null,
): boolean {
  if (residual.length === 0) return true;
  const known = new Set([
    ...authorTokens(requestAuthors, shelfType),
    ...authorTokens(candidateAuthors, shelfType),
  ]);
  if (known.size === 0) return false;
  return residual.every((token) => titleTokenPresentInSet(token, known));
}

function evaluatePair(
  requestTitle: string,
  candidateTitle: string,
  requestAuthors: string[] | undefined,
  candidateAuthors: string[] | undefined,
  shelfType?: string | null,
): ResidualIdentityResult {
  const reasons: string[] = [];

  if (
    !listingLooksLikeMerchAccessory(requestTitle, { shelfType }) &&
    listingLooksLikeMerchAccessory(candidateTitle, { shelfType })
  ) {
    return {
      decision: "reject",
      residualTokens: identityTokens(candidateTitle, shelfType),
      requestResidualTokens: identityTokens(requestTitle, shelfType),
      reasons: ["merch_accessory"],
    };
  }

  if (
    listingAddsUnrequestedControllerAccessory(requestTitle, candidateTitle, {
      shelfType,
    })
  ) {
    return {
      decision: "reject",
      residualTokens: identityTokens(candidateTitle, shelfType),
      requestResidualTokens: identityTokens(requestTitle, shelfType),
      reasons: ["controller_accessory"],
    };
  }

  // Platform + pad shelf name ("Switch Joycon Gris") must not land on pad-only
  // SKUs ("Joy-Con Gray") — those omit the console.
  if (
    shelfType === "hardware" &&
    listingLooksLikePlatformControllerBundle(requestTitle) &&
    listingLooksLikeControllerProduct(candidateTitle) &&
    !listingLooksLikeConsoleSystemProduct(candidateTitle) &&
    !listingLooksLikePlatformControllerBundle(candidateTitle)
  ) {
    return {
      decision: "reject",
      residualTokens: identityTokens(candidateTitle, shelfType),
      requestResidualTokens: identityTokens(requestTitle, shelfType),
      reasons: ["controller_accessory"],
    };
  }

  // Distinct registry platforms (PS5 ≠ PS1 / Mega Drive ≠ Game Gear) — never
  // collapse via a shared "PlayStation" / brand token alone.
  if (shelfType === "hardware") {
    const requestPlatform = detectVideoGamePlatformKey(requestTitle);
    const candidatePlatform = detectVideoGamePlatformKey(candidateTitle);
    if (
      requestPlatform &&
      candidatePlatform &&
      requestPlatform !== candidatePlatform
    ) {
      return {
        decision: "reject",
        residualTokens: identityTokens(candidateTitle, shelfType),
        requestResidualTokens: identityTokens(requestTitle, shelfType),
        reasons: ["platform_key_mismatch"],
      };
    }
  }

  if (
    listingAddsUnrequestedConsoleSystem(requestTitle, candidateTitle, {
      shelfType,
    })
  ) {
    return {
      decision: "reject",
      residualTokens: identityTokens(candidateTitle, shelfType),
      requestResidualTokens: identityTokens(requestTitle, shelfType),
      reasons: ["console_system"],
    };
  }

  if (
    shelfType === "hardware" &&
    hardwareStorageCapacityConflict(requestTitle, candidateTitle)
  ) {
    return {
      decision: "reject",
      residualTokens: identityTokens(candidateTitle, shelfType),
      requestResidualTokens: identityTokens(requestTitle, shelfType),
      reasons: ["storage_capacity_conflict"],
    };
  }

  if (
    shelfType === "hardware" &&
    hardwareFinishConflict(requestTitle, candidateTitle)
  ) {
    return {
      decision: "reject",
      residualTokens: identityTokens(candidateTitle, shelfType),
      requestResidualTokens: identityTokens(requestTitle, shelfType),
      reasons: ["finish_conflict"],
    };
  }

  if (
    shelfType === "hardware" &&
    hardwareFormFactorConflict(requestTitle, candidateTitle)
  ) {
    return {
      decision: "reject",
      residualTokens: identityTokens(candidateTitle, shelfType),
      requestResidualTokens: identityTokens(requestTitle, shelfType),
      reasons: ["form_factor_conflict"],
    };
  }

  if (volumesConflict(requestTitle, candidateTitle)) {
    return {
      decision: "reject",
      residualTokens: identityTokens(candidateTitle, shelfType),
      requestResidualTokens: identityTokens(requestTitle, shelfType),
      reasons: ["volume_conflict"],
    };
  }

  if (volumeMissingOnCandidate(requestTitle, candidateTitle)) {
    return {
      decision: "reject",
      residualTokens: identityTokens(candidateTitle, shelfType),
      requestResidualTokens: identityTokens(requestTitle, shelfType),
      reasons: ["volume_missing_on_candidate"],
    };
  }

  if (unrequestedVolumeOnCandidate(requestTitle, candidateTitle)) {
    return {
      decision: "reject",
      residualTokens: identityTokens(candidateTitle, shelfType),
      requestResidualTokens: identityTokens(requestTitle, shelfType),
      reasons: ["unrequested_volume_on_candidate"],
    };
  }

  // Regional console aliases (Genesis ≡ Mega Drive) share a registry key —
  // canonicalize before token residual so hardware identity stays one gate.
  const requestForTokens =
    shelfType === "hardware"
      ? canonicalizeVideoGamePlatformAliasSpan(requestTitle)
      : requestTitle;
  const candidateForTokens =
    shelfType === "hardware"
      ? canonicalizeVideoGamePlatformAliasSpan(candidateTitle)
      : candidateTitle;

  const requestTokens = identityTokens(requestForTokens, shelfType);
  const candidateTokens = identityTokens(candidateForTokens, shelfType);
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
    shelfType,
  );
  const requestStillUnmatched = [...requestTokens];
  for (const m of matched) {
    const idx = requestStillUnmatched.findIndex((t) =>
      tokensEquivalentForShelf(t, m, shelfType),
    );
    if (idx >= 0) requestStillUnmatched.splice(idx, 1);
  }

  // Parenthetical arabic restatement of an already-matched roman sequel
  // ("Alan Wake II (2)") must not count as new candidate identity.
  // Hardware: "PS4" restates PlayStation + 4 already matched on either side.
  // Included-pad console SKUs ("NES - Manette Gris", "Switch Joycon") keep
  // controller-family tokens as chrome once the console core matched.
  const includedPadChrome =
    shelfType === "hardware" &&
    (listingLooksLikeConsoleSystemProduct(candidateTitle) ||
      listingLooksLikePlatformControllerBundle(candidateTitle));
  const residual = significantTokens(afterRequest).filter(
    (token) =>
      !matched.some((m) => tokensEquivalentForShelf(token, m, shelfType)) &&
      !(
        shelfType === "hardware" &&
        hardwarePlatformAbbrevCoveredByMatched(token, matched)
      ) &&
      !(
        includedPadChrome &&
        (isHardwareControllerFamilyToken(token) ||
          // PriceCharting / marketplace often split Joy-Con → joy + con.
          token === "joy" ||
          token === "con")
      ),
  );
  const requestUnmatchedSignificant = significantTokens(
    requestStillUnmatched,
  ).filter(
    (token) =>
      !(
        shelfType === "hardware" &&
        hardwarePlatformAbbrevCoveredByMatched(token, matched)
      ),
  );
  const volMatched = volumesMatched(requestTitle, candidateTitle);

  const seriesLine = orderedSeriesLineConflict(requestTokens, candidateTokens);
  if (seriesLine === "request_line_missing_on_candidate") {
    // Hardware: multi-token edition franchise after a shared console core
    // ("Switch OLED" + "Legend of Zelda") may still align to the bare console
    // SKU. Single trailing markers (Slim Rose → Slim) stay rejected.
    const hardwareEditionFranchise =
      shelfType === "hardware" &&
      residual.length === 0 &&
      matched.length >= 2 &&
      hardwareRequestEditionFranchiseTokens(
        requestTokens,
        matched,
        requestUnmatchedSignificant,
      ).length >= 2;
    if (!hardwareEditionFranchise) {
      reasons.push("request_series_line_unexplained");
      return {
        decision: "reject",
        residualTokens: residual,
        requestResidualTokens: requestUnmatchedSignificant,
        reasons,
      };
    }
  } else if (seriesLine === "series_suffix_mismatch") {
    reasons.push("series_suffix_mismatch");
    return {
      decision: "reject",
      residualTokens: residual,
      requestResidualTokens: requestUnmatchedSignificant,
      reasons,
    };
  } else if (seriesLine === "series_line_extended_on_candidate") {
    reasons.push("series_line_extended_on_candidate");
    return {
      decision: "reject",
      residualTokens: residual,
      requestResidualTokens: requestUnmatchedSignificant,
      reasons,
    };
  }

  // "Q-Force" vs "QForce": token streams differ but compact to the same marker.
  if (
    requestUnmatchedSignificant.length > 0 &&
    residual.length > 0 &&
    compactTokenStreamEquivalent(requestUnmatchedSignificant, residual)
  ) {
    reasons.push("empty_residual_covered");
    return {
      decision: "accept",
      residualTokens: [],
      requestResidualTokens: [],
      reasons,
    };
  }

  if (requestUnmatchedSignificant.length > 0) {
    // Hardware: catalog fully explained, request only adds brand/vendor chrome
    // ("Sony" + PlayStation 5) — accept. But reject when the request still
    // carries unmatched platform/product tokens the catalog dropped (Switch
    // OLED request vs NES Zelda game; PS5 / Classic vs bare PS One).
    if (shelfType === "hardware" && residual.length === 0 && matched.length > 0) {
      const missingHardwareIdentity = requestUnmatchedSignificant.some((token) =>
        isIdentityPlatformNoiseToken(token),
      );
      if (missingHardwareIdentity) {
        const controllerRequest = requestTokens.some(
          (token) =>
            isHardwareControllerFamilyToken(token) ||
            token === "dualsense" ||
            token === "dualshock",
        );
        const matchedProduct = matched.some(
          (token) => !isIdentityPlatformNoiseToken(token),
        );
        if (controllerRequest && matchedProduct) {
          reasons.push("hardware_controller_platform_context");
          return {
            decision: "accept",
            residualTokens: [],
            requestResidualTokens: requestUnmatchedSignificant,
            reasons,
          };
        }
        reasons.push("candidate_missing_hardware_identity");
        return {
          decision: "reject",
          residualTokens: residual,
          requestResidualTokens: requestUnmatchedSignificant,
          reasons,
        };
      }
      // Brand-prefix accept only for catalog chrome leftovers (sony / console).
      // Generation digits ("5") and product lines ("classic") stay identity.
      // Multi-token edition franchise after the console core
      // ("Switch OLED" + "Legend of Zelda") may still align to the bare SKU.
      const unexplainedRequestIdentity = requestUnmatchedSignificant.filter(
        (token) => !isHardwareCatalogChromeToken(token),
      );
      if (unexplainedRequestIdentity.length === 0) {
        reasons.push("hardware_brand_prefix");
        return {
          decision: "accept",
          residualTokens: [],
          requestResidualTokens: requestUnmatchedSignificant,
          reasons,
        };
      }
      const editionFranchise = hardwareRequestEditionFranchiseTokens(
        requestTokens,
        matched,
        unexplainedRequestIdentity,
      );
      if (matched.length >= 2 && editionFranchise.length >= 2) {
        reasons.push("hardware_edition_franchise_on_request");
        return {
          decision: "accept",
          residualTokens: [],
          requestResidualTokens: unexplainedRequestIdentity,
          reasons,
        };
      }
      reasons.push("candidate_missing_hardware_identity");
      return {
        decision: "reject",
        residualTokens: residual,
        requestResidualTokens: unexplainedRequestIdentity,
        reasons,
      };
    }
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

  if (
    residualCoveredByAuthors(
      residual,
      requestAuthors,
      candidateAuthors,
      shelfType,
    )
  ) {
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
 * Hyphen / spacing vs catalog compound: "Q-Force" tokens ≡ "QForce".
 * Structural join only — never invent FR↔EN aliases (rose ≠ pink).
 */
function compactTokenStreamEquivalent(a: string[], b: string[]): boolean {
  if (
    a.length === b.length &&
    a.every((token, index) => titleTokensEquivalent(token, b[index] ?? ""))
  ) {
    return true;
  }
  const compactA = a.join("");
  const compactB = b.join("");
  return (
    compactA.length >= 2 &&
    compactB.length >= 2 &&
    titleTokensEquivalent(compactA, compactB)
  );
}

/**
 * Ordered shared core ≥ 2 tokens (not only from index 0 — brand prefixes like
 * "Sony" must not hide a trailing color/edition line), then compare suffixes.
 * - Request line missing on candidate → sibling series / color SKU
 * - Compact suffix mismatch → sibling series (distinct markers, no invented alias)
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
  let best: {
    reqStart: number;
    candStart: number;
    length: number;
  } | null = null;

  for (let i = 0; i < requestTokens.length; i++) {
    for (let j = 0; j < candidateTokens.length; j++) {
      let length = 0;
      while (
        i + length < requestTokens.length &&
        j + length < candidateTokens.length &&
        titleTokensEquivalent(
          requestTokens[i + length]!,
          candidateTokens[j + length]!,
        )
      ) {
        length += 1;
      }
      if (length >= 2 && (!best || length > best.length)) {
        best = { reqStart: i, candStart: j, length };
      }
    }
  }
  if (!best) return null;

  const requestSuffix = requestTokens.slice(best.reqStart + best.length);
  const candidateSuffix = candidateTokens.slice(best.candStart + best.length);
  const reqSig = significantTokens(requestSuffix);
  const candSig = significantTokens(candidateSuffix);

  if (reqSig.length === 0) return null;
  if (reqSig.every((token) => /^\d+$/.test(token))) return null;

  if (candSig.length === 0) {
    return "request_line_missing_on_candidate";
  }

  // "Q-Force" vs "QForce" — same compound line, not a sibling SKU.
  if (compactTokenStreamEquivalent(reqSig, candSig)) return null;

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
