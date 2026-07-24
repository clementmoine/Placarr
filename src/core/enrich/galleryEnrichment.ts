import type { MetadataResult } from "@/types/metadataProvider";
import type { MediaType } from "@/types/providerRegistry";
import {
  isBookGallerySource,
  isGameMediaGallerySource,
} from "@/core/catalog/sourceTraits";
import { isMissingGameMediaGallery } from "@/core/enrich/galleries";

/** True when at least one attachment comes from a game-media gallery provider. */
export function metadataResultsHaveGameGallerySource(
  results: Array<MetadataResult | null | undefined>,
): boolean {
  return results.some((result) =>
    result?.attachments?.some((attachment) =>
      isGameMediaGallerySource(attachment.source),
    ),
  );
}

/** True when at least one attachment comes from a book gallery provider. */
export function metadataResultsHaveBookGallerySource(
  results: Array<MetadataResult | null | undefined>,
): boolean {
  return results.some((result) =>
    result?.attachments?.some(
      (attachment) =>
        isBookGallerySource(attachment.source) ||
        isGameMediaGallerySource(attachment.source),
    ),
  );
}

/**
 * Items still need provider round-trips when the merge would only expose catalog
 * thumbnails instead of a real multi-source retailer gallery.
 */
export function metadataResultsNeedGalleryEnrichment(
  type: MediaType,
  results: Array<MetadataResult | null | undefined>,
  barcode?: string | null,
): boolean {
  const active = results.filter(Boolean) as MetadataResult[];
  if (type === "games") {
    if (active.length === 0) return true;
    if (metadataResultsHaveGameGallerySource(active)) return false;

    const attachments = active.flatMap((result) => result.attachments ?? []);
    return isMissingGameMediaGallery(type, barcode, attachments);
  }

  if (type === "books") {
    if (active.length === 0) return true;
    return !metadataResultsHaveBookGallerySource(active);
  }

  return false;
}
