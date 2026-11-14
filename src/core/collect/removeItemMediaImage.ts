/**
 * Drop one gallery image from an item. No blocklist — a later metadata sync
 * may recreate provider attachments; user uploads stay gone unless re-added.
 */
import { prisma } from "@/lib/db/prisma";
import { detectVideoGamePlatformKey } from "@/core/identify/platforms/platforms";

import {
  filterAttachmentsRemovingUrl,
  mediaUrlMatchesTarget,
  nextCoverUrlAfterRemoval,
} from "./removeItemMediaImage.shared";

export {
  filterAttachmentsRemovingUrl,
  mediaUrlMatchesTarget,
  nextCoverUrlAfterRemoval,
} from "./removeItemMediaImage.shared";

export type RemoveItemMediaImageResult = {
  removedAttachmentIds: string[];
  clearedCover: boolean;
  clearedBackground: boolean;
  nextImageUrl: string | null;
  nextBackgroundImageUrl: string | null;
};

/**
 * Delete matching attachment rows and clear/reassign cover or background when
 * they pointed at the removed URL.
 */
export async function removeItemMediaImage(input: {
  itemId: string;
  url: string;
}): Promise<RemoveItemMediaImageResult> {
  const targetUrl = input.url.trim();
  if (!targetUrl) {
    throw new Error("Image URL is required");
  }

  const item = await prisma.item.findUnique({
    where: { id: input.itemId },
    select: {
      id: true,
      imageUrl: true,
      backgroundImageUrl: true,
      metadataId: true,
      shelf: { select: { name: true, type: true } },
      metadata: {
        select: {
          id: true,
          imageUrl: true,
          attachments: true,
        },
      },
    },
  });

  if (!item) {
    throw new Error("Item not found");
  }

  const attachments = item.metadata?.attachments ?? [];
  const removed = attachments.filter((attachment) =>
    mediaUrlMatchesTarget(attachment.url, targetUrl),
  );
  const remaining = filterAttachmentsRemovingUrl(attachments, targetUrl);

  const clearedCover =
    mediaUrlMatchesTarget(item.imageUrl, targetUrl) ||
    mediaUrlMatchesTarget(item.metadata?.imageUrl, targetUrl);
  const clearedBackground = mediaUrlMatchesTarget(
    item.backgroundImageUrl,
    targetUrl,
  );

  if (removed.length === 0 && !clearedCover && !clearedBackground) {
    throw new Error("Image not found on item");
  }

  if (removed.length > 0) {
    await prisma.attachment.deleteMany({
      where: { id: { in: removed.map((attachment) => attachment.id) } },
    });
  }

  const platformKey = detectVideoGamePlatformKey(item.shelf?.name ?? "");
  let nextImageUrl = item.imageUrl?.trim() || null;
  let nextBackgroundImageUrl = item.backgroundImageUrl?.trim() || null;

  if (clearedCover) {
    nextImageUrl = nextCoverUrlAfterRemoval(remaining, platformKey);
  }
  if (clearedBackground) {
    nextBackgroundImageUrl = null;
  }

  const itemPatch: {
    imageUrl?: string | null;
    backgroundImageUrl?: string | null;
  } = {};
  if (clearedCover) {
    itemPatch.imageUrl = nextImageUrl;
  }
  if (clearedBackground) {
    itemPatch.backgroundImageUrl = null;
  }
  if (Object.keys(itemPatch).length > 0) {
    await prisma.item.update({
      where: { id: item.id },
      data: itemPatch,
    });
  }

  if (
    item.metadataId &&
    mediaUrlMatchesTarget(item.metadata?.imageUrl, targetUrl)
  ) {
    await prisma.metadata.update({
      where: { id: item.metadataId },
      data: { imageUrl: nextImageUrl },
    });
  }

  return {
    removedAttachmentIds: removed.map((attachment) => attachment.id),
    clearedCover,
    clearedBackground,
    nextImageUrl,
    nextBackgroundImageUrl,
  };
}
