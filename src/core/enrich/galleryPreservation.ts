import type { Attachment } from "@prisma/client";

import { shouldShowCoverAttachmentOnShelf } from "@/core/enrich/media/attachmentDisplayScore";
import { withProviderAttachmentTraits } from "@/core/catalog/sourceTraits";
import { urlsReferToSameLocalizedImage } from "@/core/enrich/media/coverUrl";
import type { MetadataAttachment } from "@/types/metadataProvider";

const GALLERY_ATTACHMENT_TYPES = new Set([
  "cover",
  "artwork",
  "image",
  "screenshot",
  "background",
  "logo",
]);

const COVER_GALLERY_TYPES = new Set(["cover", "artwork", "image"]);

function toStorableAttachment(attachment: Attachment): MetadataAttachment {
  return withProviderAttachmentTraits({
    type: attachment.type,
    url: attachment.url,
    role: attachment.role ?? undefined,
    source: attachment.source ?? undefined,
    title: attachment.title ?? undefined,
    coverProvenance: attachment.coverProvenance ?? undefined,
    platformKey: attachment.platformKey ?? undefined,
    width: attachment.width ?? undefined,
    height: attachment.height ?? undefined,
    meanLuminance: attachment.meanLuminance ?? undefined,
    darkPixelRatio: attachment.darkPixelRatio ?? undefined,
  });
}

/** Keep a previously enriched gallery when a refresh would wipe or collapse it. */
export function preserveGalleryAttachmentsOnRegression(
  previous: readonly Attachment[] | undefined,
  next: readonly MetadataAttachment[],
  requestedPlatformKey?: string,
): MetadataAttachment[] {
  const withUserUploads = preserveUserUploadedAttachments(previous, next);

  if (!previous?.length) return withUserUploads;

  const previousGallery = previous.filter((attachment) =>
    GALLERY_ATTACHMENT_TYPES.has(attachment.type),
  );
  const nextGallery = withUserUploads.filter((attachment) =>
    GALLERY_ATTACHMENT_TYPES.has(attachment.type),
  );

  if (previousGallery.length < 2) return withUserUploads;
  if (nextGallery.length >= 2) return withUserUploads;

  const revivedCandidates = previous
    .filter((attachment) => attachment.url.startsWith("/uploads/"))
    .map(toStorableAttachment);
  const coverCandidates = [
    ...withUserUploads.filter((attachment) =>
      COVER_GALLERY_TYPES.has(attachment.type),
    ),
    ...revivedCandidates.filter((attachment) =>
      COVER_GALLERY_TYPES.has(attachment.type),
    ),
  ];

  const revived = revivedCandidates.filter((attachment) => {
    if (
      withUserUploads.some((existing) => existing.url === attachment.url)
    ) {
      return false;
    }
    if (!COVER_GALLERY_TYPES.has(attachment.type)) return true;
    if (!requestedPlatformKey) return true;
    return shouldShowCoverAttachmentOnShelf(
      attachment,
      requestedPlatformKey,
      coverCandidates,
    );
  });

  return [...withUserUploads, ...revived];
}

/**
 * User-uploaded gallery images must survive every enrichment refresh, even when
 * the provider gallery looks healthy — otherwise a personal disc/box photo is
 * wiped by SteamGridDB grids on the next metadata pass.
 */
function preserveUserUploadedAttachments(
  previous: readonly Attachment[] | undefined,
  next: readonly MetadataAttachment[],
): MetadataAttachment[] {
  if (!previous?.length) return [...next];

  const result = [...next];
  for (const attachment of previous) {
    if (attachment.source !== "user") continue;
    if (!attachment.url.startsWith("/uploads/")) continue;
    if (
      result.some(
        (existing) =>
          existing.url === attachment.url ||
          urlsReferToSameLocalizedImage(existing.url, attachment.url),
      )
    ) {
      continue;
    }
    result.push(toStorableAttachment(attachment));
  }
  return result;
}
