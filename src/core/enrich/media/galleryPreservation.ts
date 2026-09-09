import type { Attachment } from "@/generated/prisma/browser";

import { shouldShowCoverAttachmentOnShelf } from "@/core/enrich/media/attachmentDisplayScore";
import { withProviderAttachmentTraits } from "@/core/catalog/sourceTraits";
import { normalizeProviderSourceKey } from "@/core/enrich/providerExternalLinks";
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

function attachmentSourceKey(source?: string | null): string {
  if (!source?.trim()) return "";
  return normalizeProviderSourceKey(source);
}

function sameGalleryRow(
  left: { url: string; source?: string | null },
  right: { url: string; source?: string | null },
): boolean {
  if (left.url === right.url) return true;
  if (urlsReferToSameLocalizedImage(left.url, right.url)) return true;
  return false;
}

/**
 * Keep a previously enriched gallery when a refresh would wipe or collapse it.
 *
 * Partial refreshes (e.g. marketplace-only stage-2) must not delete catalog
 * covers from providers that simply did not answer this pass — same contract
 * as `mergePriceOffers` / facts merge.
 */
export function preserveGalleryAttachmentsOnRegression(
  previous: readonly Attachment[] | undefined,
  next: readonly MetadataAttachment[],
  requestedPlatformKey?: string,
): MetadataAttachment[] {
  const withUserUploads = preserveUserUploadedAttachments(previous, next);

  if (!previous?.length) return withUserUploads;

  const withAbsentSources = preserveAbsentSourceGalleryAttachments(
    previous,
    withUserUploads,
    requestedPlatformKey,
  );

  const previousGallery = previous.filter((attachment) =>
    GALLERY_ATTACHMENT_TYPES.has(attachment.type),
  );
  const nextGallery = withAbsentSources.filter((attachment) =>
    GALLERY_ATTACHMENT_TYPES.has(attachment.type),
  );

  if (previousGallery.length < 2) return withAbsentSources;
  if (nextGallery.length >= 2) return withAbsentSources;

  const revivedCandidates = previous
    .filter((attachment) => attachment.url.startsWith("/uploads/"))
    .map(toStorableAttachment);
  const coverCandidates = [
    ...withAbsentSources.filter((attachment) =>
      COVER_GALLERY_TYPES.has(attachment.type),
    ),
    ...revivedCandidates.filter((attachment) =>
      COVER_GALLERY_TYPES.has(attachment.type),
    ),
  ];

  const revived = revivedCandidates.filter((attachment) => {
    if (
      withAbsentSources.some((existing) => sameGalleryRow(existing, attachment))
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

  return [...withAbsentSources, ...revived];
}

/**
 * Revive gallery rows whose provider is missing from this refresh payload.
 * Remote HTTPS URLs are kept too — deferred localize / Flare blips must not
 * erase a PriceCharting cover when only Back Market answered.
 */
function preserveAbsentSourceGalleryAttachments(
  previous: readonly Attachment[],
  next: readonly MetadataAttachment[],
  requestedPlatformKey?: string,
): MetadataAttachment[] {
  const incomingSources = new Set(
    next
      .map((attachment) => attachmentSourceKey(attachment.source))
      .filter(Boolean),
  );

  const result = [...next];
  const coverCandidates = [
    ...result.filter((attachment) => COVER_GALLERY_TYPES.has(attachment.type)),
    ...previous
      .filter((attachment) => COVER_GALLERY_TYPES.has(attachment.type))
      .map(toStorableAttachment),
  ];

  for (const attachment of previous) {
    if (!GALLERY_ATTACHMENT_TYPES.has(attachment.type)) continue;
    if (attachment.source === "user") continue;

    const sourceKey = attachmentSourceKey(attachment.source);
    if (!sourceKey || incomingSources.has(sourceKey)) continue;

    const storable = toStorableAttachment(attachment);
    if (result.some((existing) => sameGalleryRow(existing, storable))) {
      continue;
    }
    if (
      COVER_GALLERY_TYPES.has(storable.type) &&
      requestedPlatformKey &&
      !shouldShowCoverAttachmentOnShelf(
        storable,
        requestedPlatformKey,
        coverCandidates,
      )
    ) {
      continue;
    }
    result.push(storable);
  }

  return result;
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
