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
import { cropImageIfNeeded } from "@/core/enrich/media/imageTrim";
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
  let finalStorableAttachments = input.finalStorableAttachments;
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
    isUrlEligibleDefaultCover(formattedMetadata.imageUrl, finalStorableAttachments)
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

  const croppedImageUrl = selectedImageUrl
    ? await cropImageIfNeeded(selectedImageUrl, { minMarginPixels: 30 })
    : null;

  // Cropping writes a new "_crop" file, so the cover URL stored on the item /
  // metadata would no longer match any gallery attachment. Repoint the source
  // attachment at the cropped file so the cover keeps its provenance
  // (source + region role) instead of surfacing as an orphan "Scan" image.
  if (
    croppedImageUrl &&
    selectedImageUrl &&
    croppedImageUrl !== selectedImageUrl
  ) {
    const coverAttachment = finalStorableAttachments.find(
      (attachment) => attachment.url === selectedImageUrl,
    );
    if (coverAttachment) coverAttachment.url = croppedImageUrl;
  }


  // Computed wide hero/background: the sharpest landscape image we have (reuses
  // the display scorer + the metrics already gathered above). Null when nothing
  // high-resolution qualifies, so the UI falls back to the legacy heuristic.
  const heroImageUrl = pickBestBackgroundFromAttachments(
    finalStorableAttachments,
    imageMetricsByUrl,
  );


  return {
    selectedImageUrl: selectedImageUrl ?? null,
    croppedImageUrl: croppedImageUrl ?? null,
    heroImageUrl: heroImageUrl ?? null,
    finalStorableAttachments,
  };
}
