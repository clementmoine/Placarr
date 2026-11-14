/**
 * Cover bootstrap helpers for metadata persistence (cache cover, orphan Perso pins).
 */
import {
  Attachment,
  AttachmentType,
  Metadata,
  Type,
} from "@/generated/prisma/browser";
import { prisma } from "@/lib/db/prisma";
import { urlsReferToSameLocalizedImage } from "@/core/enrich/media/coverUrl";
import { barcodeListingMatchesItem } from "@/core/identify/titleUtils";
import { inferImageAttachmentFromMediaUrl } from "@/core/catalog/catalog";
import { inferProviderIdFromMediaUrl } from "@/core/catalog/sourceTraits";
import type {
  MetadataAttachment,
  MetadataResult,
} from "@/types/metadataProvider";
import type { Item } from "@/generated/prisma/browser";

function isDisplayImageAttachment(attachment: {
  type?: AttachmentType | string | null;
  url?: string | null;
}) {
  return (
    Boolean(attachment.url) &&
    ["cover", "artwork", "image", "screenshot", "background"].includes(
      String(attachment.type || ""),
    )
  );
}

function hasMetadataImageCandidate(metadata: MetadataResult) {
  if (metadata.imageUrl) return true;
  return Boolean(metadata.attachments?.some(isDisplayImageAttachment));
}

export function metadataImageAttachmentSemantics(
  metadata: MetadataResult,
  originalImageUrl: string,
): Pick<MetadataAttachment, "type" | "role" | "source" | "title"> | null {
  const direct = metadata.attachments?.find(
    (attachment) => attachment.url === originalImageUrl,
  );
  const inferred = inferImageAttachmentFromMediaUrl(originalImageUrl);
  const inferredSource = inferProviderIdFromMediaUrl(originalImageUrl);

  if (!direct && !inferred && !inferredSource) return null;

  return {
    type: direct?.type ?? inferred?.type ?? "cover",
    role: direct?.role ?? inferred?.role,
    source: direct?.source ?? inferred?.source ?? inferredSource ?? undefined,
    title: direct?.title,
  };
}

export function canUseBarcodeCacheCover(
  cached: {
    shelfType?: string | null;
    rawNames?: Array<{ value: string; coverUrl?: string | null }>;
  } | null,
  type: Type,
  metadata: MetadataResult,
  itemName: string,
  inferredCoverSemantics?: Pick<
    MetadataAttachment,
    "type" | "role" | "source" | "title"
  > | null,
) {
  if (cached?.shelfType !== type) return false;
  const barcodeListing = cached?.rawNames?.find(
    (entry) => entry.coverUrl,
  )?.value;
  if (barcodeListing && !barcodeListingMatchesItem(itemName, barcodeListing)) {
    return false;
  }
  if (!hasMetadataImageCandidate(metadata)) return true;
  return Boolean(inferredCoverSemantics?.source && inferredCoverSemantics.role);
}

export async function getCachedMetadata(
  itemId: Item["id"],
): Promise<(Metadata & { attachments: Attachment[] }) | null> {
  const item = await prisma.item.findUnique({
    where: { id: itemId },
    include: { metadata: { include: { attachments: true } } },
  });
  return item?.metadata || null;
}

export function injectOrphanUserCoverAttachment(
  item: {
    imageUrl?: string | null;
    updatedAt?: Date | string | null;
    metadata?: {
      imageUrl?: string | null;
      lastFetched?: Date | string | null;
      attachments?: Attachment[] | null;
    } | null;
  } | null,
  attachments: MetadataAttachment[],
): MetadataAttachment[] {
  const pin = item?.imageUrl?.trim();
  if (!pin?.startsWith("/uploads/")) return attachments;
  if (
    attachments.some((attachment) =>
      urlsReferToSameLocalizedImage(attachment.url, pin),
    )
  ) {
    return attachments;
  }

  const previous = item?.metadata?.attachments ?? [];
  const previousUser = previous.find(
    (attachment) =>
      attachment.source === "user" &&
      urlsReferToSameLocalizedImage(attachment.url, pin),
  );
  const previousProviderHadPin = previous.some(
    (attachment) =>
      attachment.source !== "user" &&
      urlsReferToSameLocalizedImage(attachment.url, pin),
  );
  const metadataCover = item?.metadata?.imageUrl?.trim();
  const matchesMetadataCover =
    !!metadataCover && urlsReferToSameLocalizedImage(pin, metadataCover);

  // Stale enrichment crop / provider localize — do not relabel as user.
  if (previousProviderHadPin || matchesMetadataCover) {
    return attachments;
  }

  const savedAfterEnrichment =
    !!item?.updatedAt &&
    !!item?.metadata?.lastFetched &&
    new Date(item.updatedAt).getTime() >
      new Date(item.metadata.lastFetched).getTime();

  if (!previousUser && !savedAfterEnrichment) {
    return attachments;
  }

  return [
    {
      type: (previousUser?.type as MetadataAttachment["type"]) || "image",
      url: pin,
      source: "user",
      role: previousUser?.role ?? undefined,
      title: previousUser?.title ?? undefined,
      coverProvenance: previousUser?.coverProvenance ?? undefined,
      platformKey: previousUser?.platformKey ?? undefined,
    },
    ...attachments,
  ];
}
