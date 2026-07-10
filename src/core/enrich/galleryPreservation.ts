import type { Attachment } from "@prisma/client";

import { shouldShowCoverAttachmentOnShelf } from "@/core/enrich/media/attachmentDisplayScore";
import { withProviderAttachmentTraits } from "@/core/catalog/sourceTraits";
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
    source: attachment.source ?? "merged",
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
  if (!previous?.length) return [...next];

  const previousGallery = previous.filter((attachment) =>
    GALLERY_ATTACHMENT_TYPES.has(attachment.type),
  );
  const nextGallery = next.filter((attachment) =>
    GALLERY_ATTACHMENT_TYPES.has(attachment.type),
  );

  if (previousGallery.length < 2) return [...next];
  if (nextGallery.length >= 2) return [...next];

  const revivedCandidates = previous
    .filter((attachment) => attachment.url.startsWith("/uploads/"))
    .map(toStorableAttachment);
  const coverCandidates = [
    ...next.filter((attachment) => COVER_GALLERY_TYPES.has(attachment.type)),
    ...revivedCandidates.filter((attachment) =>
      COVER_GALLERY_TYPES.has(attachment.type),
    ),
  ];

  const revived = revivedCandidates.filter((attachment) => {
    if (next.some((existing) => existing.url === attachment.url)) {
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

  return [...next, ...revived];
}
