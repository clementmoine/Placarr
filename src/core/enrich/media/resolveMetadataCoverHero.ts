/**
 * Choose stored cover (with crop) and hero image from a prepared gallery.
 */
import {
  shouldSuppressCoverOnPlatformShelf,
  pickBestBackgroundFromAttachments,
  pickBestCoverFromAttachments,
  resolveStoredMetadataCoverUrl,
  type AttachmentImageMetrics,
} from "@/core/enrich/media/attachmentDisplayScore";
import { isUrlEligibleDefaultCover } from "@/core/enrich/media/coverUrl";
import { isCoverResolutionAcceptable } from "@/core/enrich/media/imageMetrics";
import type { MetadataAttachment } from "@/types/metadataProvider";

export async function resolveMetadataCoverAndHero(input: {
  finalStorableAttachments: MetadataAttachment[];
  attachmentsForRanking: MetadataAttachment[];
  imageMetricsByUrl: Map<string, AttachmentImageMetrics | null>;
  deferImageLocalization: boolean;
  formattedImageUrl?: string | null;
  previousLocalCover: string | null;
  requestedPlatformKey?: string | null;
}): Promise<{
  selectedImageUrl: string | null;
  croppedImageUrl: string | null;
  heroImageUrl: string | null;
  finalStorableAttachments: MetadataAttachment[];
}> {
  const {
    attachmentsForRanking,
    imageMetricsByUrl,
    deferImageLocalization,
    previousLocalCover,
    requestedPlatformKey,
  } = input;
  const finalStorableAttachments = input.finalStorableAttachments;
  const formattedMetadata = { imageUrl: input.formattedImageUrl };

  const canonicalCoverCandidate = finalStorableAttachments.find(
    (attachment) =>
      attachment.isCanonicalCoverSource && attachment.type === "cover",
  );
  const canonicalCover =
    canonicalCoverCandidate &&
    (deferImageLocalization ||
      isCoverResolutionAcceptable(
        imageMetricsByUrl.get(canonicalCoverCandidate.url) ?? null,
      ))
      ? canonicalCoverCandidate
      : undefined;
  const metadataCoverFallback =
    formattedMetadata.imageUrl &&
    isUrlEligibleDefaultCover(
      formattedMetadata.imageUrl,
      finalStorableAttachments,
    )
      ? formattedMetadata.imageUrl
      : null;
  const scoredImageUrl =
    canonicalCover?.url ??
    pickBestCoverFromAttachments(finalStorableAttachments, imageMetricsByUrl, {
      requestedPlatformKey,
    }) ??
    metadataCoverFallback ??
    (previousLocalCover &&
    requestedPlatformKey &&
    shouldSuppressCoverOnPlatformShelf(
      attachmentsForRanking.find(
        (attachment) => attachment.url === previousLocalCover,
      ) ?? { type: "cover", url: previousLocalCover },
      finalStorableAttachments.filter((attachment) =>
        ["cover", "artwork", "image"].includes(attachment.type),
      ),
      requestedPlatformKey,
    )
      ? null
      : previousLocalCover) ??
    null;

  const selectedImageUrl = resolveStoredMetadataCoverUrl(
    scoredImageUrl,
    finalStorableAttachments,
    imageMetricsByUrl,
    { requestedPlatformKey },
  );

  // The cover is stored as the provider served it. Cropping here used to write a
  // derived "_crop" file and repoint the attachment at it, which severed the
  // cover from its provenance and could not be undone — framing belongs to the
  // collector, not to enrichment. See `suggestCropBox` for the assisted flow.

  // Computed wide hero/background: the sharpest landscape image we have (reuses
  // the display scorer + the metrics already gathered above). Null when nothing
  // high-resolution qualifies, so the UI falls back to the legacy heuristic.
  const heroImageUrl = pickBestBackgroundFromAttachments(
    finalStorableAttachments,
    imageMetricsByUrl,
  );

  return {
    selectedImageUrl: selectedImageUrl ?? null,
    // Named for the old crop step; it now carries the cover exactly as chosen.
    croppedImageUrl: selectedImageUrl ?? null,
    heroImageUrl: heroImageUrl ?? null,
    finalStorableAttachments,
  };
}
