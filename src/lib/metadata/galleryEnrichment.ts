import type { MetadataResult } from "@/types/metadataProvider";
import type { MediaType } from "@/types/providerRegistry";
import { isGameMediaGallerySource } from "@/services/provider/sourceTraits";
import { isMissingGameMediaGallery } from "@/lib/metadata/galleries";

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

/**
 * Games still need provider round-trips when the merge would only expose a
 * single listing thumbnail instead of a real multi-source gallery.
 */
export function metadataResultsNeedGalleryEnrichment(
  type: MediaType,
  results: Array<MetadataResult | null | undefined>,
  barcode?: string | null,
): boolean {
  if (type !== "games") return false;

  const active = results.filter(Boolean) as MetadataResult[];
  if (active.length === 0) return true;
  if (metadataResultsHaveGameGallerySource(active)) return false;

  const attachments = active.flatMap((result) => result.attachments ?? []);
  return isMissingGameMediaGallery(type, barcode, attachments);
}
