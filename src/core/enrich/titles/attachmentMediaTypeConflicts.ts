/**
 * Reject game gallery titles that look like non-game media (OST, Blu-ray…).
 */
import { createNonGameMediaMatcher } from "@/core/identify/listingTerms";

const NON_GAME_MEDIA_TITLE_PATTERN = createNonGameMediaMatcher("i");

function attachmentTitleLooksLikeNonGameMedia(
  attachmentTitle: string,
  productTitle: string,
): boolean {
  return (
    NON_GAME_MEDIA_TITLE_PATTERN.test(attachmentTitle) &&
    !NON_GAME_MEDIA_TITLE_PATTERN.test(productTitle)
  );
}

export function attachmentTitleMediaTypeConflicts(
  productTitle: string | undefined,
  attachmentTitle: string | undefined,
  options: { mediaType?: string | null } = {},
): boolean {
  if (!productTitle?.trim() || !attachmentTitle?.trim()) return false;
  return (
    options.mediaType === "games" &&
    attachmentTitleLooksLikeNonGameMedia(attachmentTitle, productTitle)
  );
}

