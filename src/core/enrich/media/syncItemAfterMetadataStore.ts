/**
 * Sync item cover / barcode / hero / display name after metadata persist.
 */
import path from "path";
import type { Type } from "@/generated/prisma/browser";
import { prisma } from "@/lib/db/prisma";
import {
  readFileImageMetrics,
  isCoverResolutionAcceptable,
} from "@/core/enrich/media/imageMetrics";
import { urlsReferToSameLocalizedImage } from "@/core/enrich/media/coverUrl";
import {
  perceptualHashForAsset,
  PERCEPTUAL_DUPLICATE_MAX_DISTANCE,
} from "@/core/enrich/media/imageAssets";
import { pickVisuallyMatchingCatalogCoverUrl } from "@/core/enrich/media/croppedCoverSync";
import { normalizeProductBarcode } from "@/core/identify/normalize";
import {
  detectVideoGamePlatformKey,
  isVideoGamePlatformKey,
} from "@/core/identify/platforms/platforms";
import { isMetadataTitleAligned } from "@/core/enrich/titleMatching";
import { resolveMetadataDisplayTitle } from "@/core/enrich/titles/refineCatalogDisplayTitle";
import { adoptItemNameFromMetadataIfPlaceholder } from "@/core/collect/adoptMetadataTitle";
import type { AttachmentImageMetrics } from "@/core/enrich/media/attachmentDisplayScore";
import type {
  MetadataAttachment,
  MetadataResult,
} from "@/types/metadataProvider";
import type { StoreItemContext } from "@/core/enrich/media/prepareMetadataGallery";

export async function syncItemFieldsAfterMetadataStore(input: {
  itemId: string;
  item: StoreItemContext;
  metadata: MetadataResult;
  type: Type;
  name: string;
  croppedImageUrl: string | null;
  heroImageUrl: string | null;
  previousLocalCover: string | null;
  requestedPlatformKey?: string | null;
  finalStorableAttachments: MetadataAttachment[];
  attachmentsForRanking: MetadataAttachment[];
  imageMetricsByUrl: Map<string, AttachmentImageMetrics | null>;
}): Promise<void> {
  const {
    itemId,
    item,
    metadata,
    type,
    name,
    croppedImageUrl,
    heroImageUrl,
    previousLocalCover,
    requestedPlatformKey,
    finalStorableAttachments,
    attachmentsForRanking,
    imageMetricsByUrl,
  } = input;

  if (item && croppedImageUrl) {
    const previousMetadataImage = item.metadata?.imageUrl || null;
    const itemCoverStillInGallery = finalStorableAttachments.some(
      (attachment) => attachment.url === item.imageUrl,
    );
    const itemCoverMetrics = item.imageUrl?.startsWith("/uploads/")
      ? (imageMetricsByUrl.get(item.imageUrl) ??
        (await readFileImageMetrics(
          path.join(process.cwd(), "public", item.imageUrl),
        )))
      : null;
    const itemCoverIsLowRes =
      Boolean(item.imageUrl) && !isCoverResolutionAcceptable(itemCoverMetrics);
    const userCoverSavedAfterEnrichment =
      item.updatedAt &&
      item.metadata?.lastFetched &&
      new Date(item.updatedAt).getTime() >
        new Date(item.metadata.lastFetched).getTime();
    const itemCoverIsUserAttachment = finalStorableAttachments.some(
      (attachment) =>
        attachment.source === "user" &&
        item.imageUrl &&
        urlsReferToSameLocalizedImage(attachment.url, item.imageUrl),
    );
    let visualCatalogMatchUrl: string | null = null;
    if (
      item.imageUrl?.startsWith("/uploads/") &&
      !itemCoverStillInGallery &&
      !itemCoverIsUserAttachment
    ) {
      const pinHash = await perceptualHashForAsset(item.imageUrl);
      if (pinHash) {
        const candidates = await Promise.all(
          finalStorableAttachments.map(async (attachment) => ({
            url: attachment.url,
            type: attachment.type,
            source: attachment.source,
            hash: await perceptualHashForAsset(attachment.url),
          })),
        );
        visualCatalogMatchUrl = pickVisuallyMatchingCatalogCoverUrl(
          pinHash,
          candidates,
          PERCEPTUAL_DUPLICATE_MAX_DISTANCE,
        );
      }
    }
    const shouldSyncItemCover =
      !itemCoverIsUserAttachment &&
      (!item.imageUrl ||
        item.imageUrl === previousMetadataImage ||
        item.imageUrl === croppedImageUrl ||
        (itemCoverIsLowRes && !userCoverSavedAfterEnrichment) ||
        Boolean(visualCatalogMatchUrl) ||
        attachmentsForRanking.some(
          (attachment) =>
            attachment.source === "barcode" && attachment.url === item.imageUrl,
        ) ||
        (type === "musics" &&
          !itemCoverStillInGallery &&
          finalStorableAttachments.some(
            (attachment) => attachment.isCanonicalCoverSource,
          )));
    if (shouldSyncItemCover) {
      await prisma.item.update({
        where: { id: itemId },
        data: { imageUrl: visualCatalogMatchUrl ?? croppedImageUrl },
      });
    }
  } else if (item && previousLocalCover && !item.imageUrl) {
    await prisma.item.update({
      where: { id: itemId },
      data: { imageUrl: previousLocalCover },
    });
  }

  // Fill item.barcode only when the collector left it empty and the discovered
  // EAN is identity-safe (title-aligned + no platform conflict on games shelves).
  // Never overwrite a user-entered barcode.
  const discoveredBarcode = normalizeProductBarcode(metadata.barcode);
  const itemName = name.trim() || item?.name?.trim() || "";
  const metadataPlatformKey =
    metadata.platformKey && isVideoGamePlatformKey(metadata.platformKey)
      ? metadata.platformKey
      : detectVideoGamePlatformKey(metadata.platformKey ?? "");
  const discoveredBarcodePlatformConflicts = Boolean(
    requestedPlatformKey &&
      metadataPlatformKey &&
      metadataPlatformKey !== requestedPlatformKey,
  );
  let effectiveBarcode = normalizeProductBarcode(item?.barcode);
  if (
    item &&
    discoveredBarcode &&
    !effectiveBarcode &&
    !discoveredBarcodePlatformConflicts &&
    itemName &&
    metadata.title &&
    isMetadataTitleAligned({ title: metadata.title }, [itemName], 0.58, {
      shelfType: type,
    })
  ) {
    await prisma.item.update({
      where: { id: itemId },
      data: { barcode: discoveredBarcode },
    });
    effectiveBarcode = discoveredBarcode;
  }

  if (item && heroImageUrl) {
    const previousHero = item.metadata?.heroImageUrl || null;
    const shouldSyncBackground =
      !item.backgroundImageUrl ||
      item.backgroundImageUrl === previousHero ||
      item.backgroundImageUrl === heroImageUrl;
    if (shouldSyncBackground) {
      await prisma.item.update({
        where: { id: itemId },
        data: { backgroundImageUrl: heroImageUrl },
      });
    }
  }

  // Fill item.name only when empty / barcode placeholder and a barcode is set.
  if (item) {
    const displayTitle = resolveMetadataDisplayTitle(
      metadata,
      effectiveBarcode,
    );
    await adoptItemNameFromMetadataIfPlaceholder({
      itemId,
      metadataTitle: displayTitle,
      itemName: item.name?.trim() || name.trim(),
      barcode: effectiveBarcode,
    });
  }
}
