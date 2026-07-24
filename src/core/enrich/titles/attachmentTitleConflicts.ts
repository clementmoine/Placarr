/**
 * Gallery attachment title vs shelf-item identity conflicts.
 */
import { CATALOG_REQUIRED_TITLE_MARKER_GROUPS } from "@/core/identify/listingTerms";
import { normalizeDisplayTitle } from "@/core/enrich/titles/displayScore";
import { titleTokensEquivalent } from "@/core/enrich/titles/tokenEquivalents";
import { normalizeForTokens } from "@/core/enrich/titles/normalize";
import { listingLooksLikeMerchAccessory } from "@/core/identify/titleUtils";
import {
  hardwareProductTitlesAlign,
  residualIdentityMatch,
} from "@/core/enrich/titles/residualIdentity";
import { franchiseSequelNumbersConflict } from "@/core/enrich/titles/franchiseSequel";
import { attachmentTitleMediaTypeConflicts } from "@/core/enrich/titles/attachmentMediaTypeConflicts";
import { specificSubtitleTokens } from "@/core/enrich/titles/albumSubtitleConflicts";
import {
  distinctiveTitleTokens,
  distinctiveTokenCoverage,
} from "@/core/enrich/titles/catalogTitleTokens";
import { catalogLabelSimilarity } from "@/core/enrich/titles/titleSimilarity";
import { gameProductIdentityMismatch } from "@/core/enrich/titles/variantIdentity";

function normalizeCatalogTitleText(value: string): string {
  return normalizeForTokens(value)
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function textContainsCatalogPhrase(text: string, phrase: string): boolean {
  const normalizedText = ` ${normalizeCatalogTitleText(text)} `;
  const normalizedPhrase = normalizeCatalogTitleText(phrase);
  return Boolean(
    normalizedPhrase && normalizedText.includes(` ${normalizedPhrase} `),
  );
}

function catalogAttachmentDropsRequiredTitleMarker(
  productTitle: string,
  attachmentTitle: string,
): boolean {
  return CATALOG_REQUIRED_TITLE_MARKER_GROUPS.some(
    (group) =>
      group.some((term) => textContainsCatalogPhrase(productTitle, term)) &&
      !group.some((term) => textContainsCatalogPhrase(attachmentTitle, term)),
  );
}

function catalogAttachmentDropsSpecificSubtitle(
  productTitle: string,
  attachmentTitle: string,
): boolean {
  const subtitleTokens = specificSubtitleTokens(productTitle);
  if (subtitleTokens.length === 0) return false;

  const attachmentTokens = normalizeDisplayTitle(attachmentTitle);
  const compactAttachmentTitle = normalizeCatalogTitleText(
    attachmentTitle,
  ).replace(/\s+/g, "");

  return !subtitleTokens.some((token) => {
    const compactToken = normalizeCatalogTitleText(token).replace(/\s+/g, "");
    return (
      attachmentTokens.some(
        (other) =>
          titleTokensEquivalent(token, other) ||
          other.includes(token) ||
          token.includes(other),
      ) ||
      (compactToken.length > 3 && compactAttachmentTitle.includes(compactToken))
    );
  });
}

/** True when a gallery image title names another product than the shelf item. */
export function catalogAttachmentTitleConflicts(
  productTitle: string | undefined,
  attachmentTitle: string | undefined,
  options: { mediaType?: string | null } = {},
): boolean {
  if (!productTitle?.trim() || !attachmentTitle?.trim()) return false;
  if (
    listingLooksLikeMerchAccessory(attachmentTitle, {
      shelfType: options.mediaType,
    }) &&
    !listingLooksLikeMerchAccessory(productTitle, {
      shelfType: options.mediaType,
    })
  ) {
    return true;
  }
  if (
    attachmentTitleMediaTypeConflicts(productTitle, attachmentTitle, options)
  ) {
    return true;
  }
  if (
    catalogAttachmentDropsRequiredTitleMarker(productTitle, attachmentTitle)
  ) {
    return true;
  }
  if (catalogAttachmentDropsSpecificSubtitle(productTitle, attachmentTitle)) {
    return true;
  }

  // Hardware: same residual gate as price listings + catalog URL alignment.
  // Do not re-run distinctive-token coverage (that treated Bleu≠Blue).
  if (options.mediaType === "hardware") {
    return !hardwareProductTitlesAlign(productTitle, attachmentTitle);
  }

  // Games / books: residual series lines + distinctive tokens.
  const attachmentResidual = residualIdentityMatch({
    requestTitles: [productTitle],
    candidateTitles: [attachmentTitle],
  });
  if (
    attachmentResidual.decision === "reject" &&
    (attachmentResidual.reasons.includes("request_series_line_unexplained") ||
      attachmentResidual.reasons.includes("series_suffix_mismatch"))
  ) {
    return true;
  }
  if (gameProductIdentityMismatch([productTitle], attachmentTitle)) return true;
  if (franchiseSequelNumbersConflict([productTitle], attachmentTitle)) {
    return true;
  }

  const productDistinctive = distinctiveTitleTokens(productTitle);
  if (productDistinctive.length >= 2) {
    const coverage = distinctiveTokenCoverage(productTitle, attachmentTitle);
    if (
      coverage < 1 &&
      catalogLabelSimilarity(productTitle, attachmentTitle) < 0.7
    ) {
      return true;
    }
  }

  return false;
}

