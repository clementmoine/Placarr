import { priceListingSharesItemIdentity } from "@/core/commerce/retailer/titleMatch";
import {
  attachmentTitleMediaTypeConflicts,
  catalogAttachmentTitleConflicts,
} from "@/core/enrich/titleMatching";

const COVER_ATTACHMENT_TYPES = new Set(["cover", "artwork", "image"]);

export type AttachmentTitleGateInput = {
  type?: string | null;
  title?: string | null;
  retailCatalogImageTitlesSource?: boolean;
  catalogCoverTitlesSource?: boolean;
};

/**
 * Single cover-title gate for persist (storage) and present (media).
 * Stricter path wins: retail listings must share item identity; retail and
 * catalogCover titles must not conflict with the product title.
 */
export function attachmentTitleAllowedForItem(
  productTitle: string | null | undefined,
  attachment: AttachmentTitleGateInput,
  options: { mediaType?: string | null; shelfType?: string | null } = {},
): boolean {
  const type = attachment.type ?? "cover";
  if (!COVER_ATTACHMENT_TYPES.has(type)) return true;

  const attachmentTitle = attachment.title?.trim();
  if (!attachmentTitle) return true;

  const product = productTitle?.trim();
  if (!product) return true;

  const mediaType = options.mediaType ?? options.shelfType ?? null;

  if (
    attachmentTitleMediaTypeConflicts(product, attachmentTitle, { mediaType })
  ) {
    return false;
  }

  if (
    attachment.retailCatalogImageTitlesSource &&
    !priceListingSharesItemIdentity(product, attachmentTitle, {
      shelfType: mediaType,
    })
  ) {
    return false;
  }

  if (
    attachment.retailCatalogImageTitlesSource ||
    attachment.catalogCoverTitlesSource
  ) {
    return !catalogAttachmentTitleConflicts(product, attachmentTitle, {
      mediaType,
    });
  }

  return true;
}
