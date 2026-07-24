import {
  titleTokensEquivalent,
} from "@/core/enrich/titles/tokenEquivalents";
import {
  hardwareFinishConflict,
  hardwareFormFactorConflict,
  hardwareStorageCapacityConflict,
  isHardwareCatalogChromeToken,
  isHardwareControllerFamilyToken,
  isIdentityPlatformNoiseToken,
} from "@/core/enrich/titles/identityNoise";
import { explicitVolumeNumbers } from "@/core/enrich/titles/volumeNumber";
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
  detectVideoGamePlatformKey,
} from "@/core/identify/platforms/platforms";
import type { ResidualIdentityResult } from "@/core/enrich/titles/residualIdentityTypes";
import {
  identityTokens,
  significantTokens,
} from "@/core/enrich/titles/identityTokens";
import {
  unrequestedVolumeOnCandidate,
  volumeMissingOnCandidate,
  volumesConflict,
  volumesMatched,
} from "@/core/enrich/titles/residualVolumes";
import { residualCoveredByAuthors } from "@/core/enrich/titles/residualAuthors";
import {
  consumeEquivalentTokens,
  hardwarePlatformAbbrevCoveredByMatched,
  hardwareRequestEditionFranchiseTokens,
  tokensEquivalentForShelf,
} from "@/core/enrich/titles/residualTokenMatch";
import {
  compactTokenStreamEquivalent,
  orderedSeriesLineConflict,
} from "@/core/enrich/titles/residualSeriesLine";

export function evaluatePair(
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
