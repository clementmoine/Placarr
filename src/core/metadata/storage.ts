import {
  Attachment,
  AttachmentType,
  Author,
  Metadata,
  Publisher,
  Type,
} from "@prisma/client";
import path from "path";
import {
  shouldShowCoverAttachmentOnShelf,
  shouldSuppressCoverOnPlatformShelf,
  pickBestBackgroundFromAttachments,
  pickBestCoverFromAttachments,
  rankAttachmentsForDisplay,
  reorderAttachmentsCoverFirst,
  type AttachmentImageMetrics,
} from "@/core/media/attachmentDisplayScore";
import { detectShelfGamePlatformKey } from "@/core/metadata/platform";
import { adoptItemNameFromMetadataIfPlaceholder } from "@/core/item/adoptMetadataTitle";
import { resolveMetadataDisplayTitle } from "@/core/title/refineCatalogDisplayTitle";
import {
  attachmentTitleMediaTypeConflicts,
  catalogAttachmentTitleConflicts,
} from "@/core/metadata/titleMatching";
import {
  urlsReferToSameLocalizedImage,
  isUrlEligibleDefaultCover,
} from "@/core/media/coverUrl";
import {
  readFileImageMetrics,
  isCoverResolutionAcceptable,
} from "@/core/media/imageMetrics";
import { resolveCoverAttachmentRole } from "@/core/media/coverPerspective";
import { isMetadataTitleAligned } from "@/core/metadata/titleMatching";
import { barcodeListingMatchesItem } from "@/core/barcode/titleUtils";
import { normalizeProductBarcode } from "@/core/barcode/normalize";
import { inferImageAttachmentFromMediaUrl } from "@/core/catalog/catalog";
import {
  authoritative3dCoverRoleSource,
  coverProvenanceForSource,
  gridStyleCoverLabelSource,
  withProviderAttachmentTraits,
} from "@/core/catalog/sourceTraits";
import { prisma } from "@/lib/db/prisma";
import { metadataFieldEvidence } from "@/core/metadata/facts";
import { cropImageIfNeeded } from "@/core/media/imageTrim";
import { runCpuBackgroundWork } from "@/core/jobs/backgroundWorkQueue";
import type {
  MetadataAttachment,
  MetadataResult,
} from "@/types/metadataProvider";
import type { Item } from "@prisma/client";
import { replaceFieldEvidence } from "@/core/metadata/evidence";
import {
  dedupeLocalizedAttachmentsByContent,
  filterOutFlatImageAttachments,
  readAttachmentImageMetrics,
  shouldReadImageMetricsForAttachment,
} from "@/core/metadata/imageAssets";

import {
  formatMetadataForStorage,
  toAttachmentCreateData,
} from "@/core/metadata/dbMapping";
import { syncPriceOfferExternalLinksForMetadata } from "@/core/metadata/persistProviderExternalLinks";
import { downloadRemoteImage } from "@/core/metadata/imageDownload";

// Re-exported for existing consumers of `@/core/metadata/storage` (and its
// index barrel) after the helpers moved to ./imageAssets, ./imageUrls,
// ./dbMapping and ./imageDownload.
export {
  dedupeByPerceptualHash,
  hammingDistance,
  readAttachmentImageMetrics,
} from "@/core/metadata/imageAssets";
export {
  providerOriginalImageUrl,
  retailerOriginalImageUrl,
} from "@/core/metadata/imageUrls";
export {
  formatMetadataForStorage,
  formatMetadataFromStorage,
} from "@/core/metadata/dbMapping";
export {
  canKeepRemoteImageOnDownloadFailure,
  downloadRemoteImage,
} from "@/core/metadata/imageDownload";

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

  if (!direct && !inferred) return null;

  return {
    type: direct?.type ?? inferred?.type ?? "cover",
    role: direct?.role ?? inferred?.role,
    source: direct?.source ?? inferred?.source,
    title: direct?.title,
  };
}

function canUseBarcodeCacheCover(
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

export { isMissingMusicGallery } from "@/core/metadata/galleries";

export async function getCachedMetadata(
  itemId: Item["id"],
): Promise<(Metadata & { attachments: Attachment[] }) | null> {
  const item = await prisma.item.findUnique({
    where: { id: itemId },
    include: { metadata: { include: { attachments: true } } },
  });
  return item?.metadata || null;
}

export { looksLikeImageBuffer } from "@/core/media/imageBuffer";

export async function syncCroppedCoverAttachment(
  metadataId: string,
  croppedImageUrl: string,
  previousImageUrl?: string | null,
): Promise<void> {
  if (!croppedImageUrl.startsWith("/uploads/")) return;

  const attachments = await prisma.attachment.findMany({
    where: { metadataId },
  });

  const match = attachments.find(
    (attachment) =>
      urlsReferToSameLocalizedImage(attachment.url, croppedImageUrl) ||
      (previousImageUrl &&
        urlsReferToSameLocalizedImage(attachment.url, previousImageUrl)),
  );

  if (!match || match.url === croppedImageUrl) return;

  await prisma.attachment.update({
    where: { id: match.id },
    data: { url: croppedImageUrl },
  });

  const metadata = await prisma.metadata.findUnique({
    where: { id: metadataId },
    select: { imageUrl: true },
  });
  if (
    metadata?.imageUrl &&
    urlsReferToSameLocalizedImage(metadata.imageUrl, croppedImageUrl)
  ) {
    await prisma.metadata.update({
      where: { id: metadataId },
      data: { imageUrl: croppedImageUrl },
    });
  }
}

export type StoreMetadataOptions = {
  /** Persist remote URLs immediately; localize images in a background job. */
  deferImageLocalization?: boolean;
};

function cloneMetadataForImageLocalization(
  metadata: MetadataResult,
): MetadataResult {
  return {
    ...metadata,
    attachments: metadata.attachments?.map((attachment) => ({
      ...attachment,
    })),
    aliases: metadata.aliases ? [...metadata.aliases] : metadata.aliases,
    facts: metadata.facts ? [...metadata.facts] : metadata.facts,
    fieldEvidence: metadata.fieldEvidence
      ? metadata.fieldEvidence.map((entry) => ({ ...entry }))
      : metadata.fieldEvidence,
    authors: metadata.authors?.map((author) => ({ ...author })),
    publishers: metadata.publishers?.map((publisher) => ({ ...publisher })),
  };
}

function prepareDeferredAttachments(
  attachments: MetadataAttachment[],
): MetadataAttachment[] {
  return attachments.map((attachment) => {
    const sourceUrl = attachment.url;
    let role = attachment.role;
    if (attachment.type === "cover") {
      role =
        resolveCoverAttachmentRole({
          type: attachment.type,
          url: sourceUrl,
          title: attachment.title,
          role: attachment.role,
          source: attachment.source,
          authoritative3dCoverRoleSource: authoritative3dCoverRoleSource(
            attachment.source,
          ),
          gridStyleCoverLabelsSource: gridStyleCoverLabelSource(
            attachment.source,
          ),
        }) ?? role;
    }

    return {
      ...attachment,
      role,
      coverProvenance:
        coverProvenanceForSource(attachment.source, sourceUrl) ??
        attachment.coverProvenance,
    };
  });
}

function scheduleDeferredMetadataImageLocalization(
  itemId: Item["id"],
  metadata: MetadataResult,
  type: Type,
  name: string,
  metadataId: string,
  fetchedAt: Date,
): void {
  // Image localization runs sharp (resize/analysis) — CPU-bound work that must
  // stay on the low-concurrency pool so it never blocks interactive requests.
  void runCpuBackgroundWork(async () => {
    const current = await prisma.metadata.findUnique({
      where: { id: metadataId },
      select: { lastFetched: true },
    });
    if (
      !current?.lastFetched ||
      current.lastFetched.getTime() !== fetchedAt.getTime()
    ) {
      return;
    }

    try {
      await storeMetadata(itemId, metadata, type, name, {
        deferImageLocalization: false,
      });
    } catch (error) {
      console.error(
        `[MetadataStorage] Deferred image localization failed for item ${itemId}:`,
        error,
      );
    }
  });
}

export async function storeMetadata(
  itemId: Item["id"],
  metadata: MetadataResult,
  type: Type,
  name: string,
  options: StoreMetadataOptions = {},
): Promise<
  Metadata & {
    attachments?: Attachment[];
    authors?: Author[];
    publishers?: Publisher[];
  }
> {
  const deferImageLocalization = options.deferImageLocalization ?? false;
  const metadataSnapshotForLocalization = deferImageLocalization
    ? cloneMetadataForImageLocalization(metadata)
    : null;
  const originalMetadataImageUrl = metadata.imageUrl;
  const metadataImageSemantics = originalMetadataImageUrl
    ? metadataImageAttachmentSemantics(metadata, originalMetadataImageUrl)
    : null;

  if (metadata.imageUrl && !deferImageLocalization) {
    metadata.imageUrl =
      (await downloadRemoteImage(metadata.imageUrl)) || undefined;
  }

  const formattedMetadata = await formatMetadataForStorage(
    metadata,
    type,
    name,
  );

  const now = new Date();

  // First, get the existing metadata if any
  const item = await prisma.item.findUnique({
    where: { id: itemId },
    include: {
      shelf: { select: { name: true, type: true } },
      metadata: {
        include: { attachments: true, authors: true, publishers: true },
      },
    },
  });

  const requestedPlatformKey =
    type === "games"
      ? detectShelfGamePlatformKey(item?.shelf?.name)
      : undefined;

  const attachmentsList = [...(metadata.attachments || [])];
  if (metadata.imageUrl) {
    const exists = attachmentsList.some(
      (attachment) => attachment.url === metadata.imageUrl,
    );
    if (!exists) {
      attachmentsList.unshift({
        type: metadataImageSemantics?.type ?? "cover",
        url: metadata.imageUrl,
        role: metadataImageSemantics?.role,
        source: metadataImageSemantics?.source ?? "merged",
        title: metadataImageSemantics?.title,
      });
    }
  }
  if (item?.barcode) {
    const cleanedBarcode = item.barcode.replace(/[^\d]/g, "").trim();
    if (cleanedBarcode) {
      const cached = await prisma.barcodeCache.findUnique({
        where: { barcode: cleanedBarcode },
        include: { rawNames: true },
      });
      if (cached) {
        const barcodeCover = cached.rawNames.find(
          (rn) => rn.coverUrl,
        )?.coverUrl;
        const barcodeCoverSemantics = barcodeCover
          ? metadataImageAttachmentSemantics(
              { imageUrl: barcodeCover },
              barcodeCover,
            )
          : null;
        if (
          barcodeCover &&
          canUseBarcodeCacheCover(
            cached,
            type,
            metadata,
            name,
            barcodeCoverSemantics,
          )
        ) {
          const exists = attachmentsList.some((a) => a.url === barcodeCover);
          if (!exists) {
            attachmentsList.unshift({
              type: barcodeCoverSemantics?.type ?? ("cover" as AttachmentType),
              url: barcodeCover,
              role: barcodeCoverSemantics?.role,
              source: barcodeCoverSemantics?.source ?? "barcode",
              title: barcodeCoverSemantics?.title,
            });
          }
        }
      }
    }
  }

  // Deduplicate attachments by URL
  const uniqueAttachments = attachmentsList.filter(
    (attachment, index, self) =>
      index === self.findIndex((a) => a.url === attachment.url),
  );

  // Localize all attachments before database save, filtering out failures (e.g. 404)
  let attachmentsForRanking = deferImageLocalization
    ? prepareDeferredAttachments(uniqueAttachments)
    : (
        await Promise.all(
          uniqueAttachments.map(async (attachment) => {
            const sourceUrl = attachment.url;
            const localizedUrl = await downloadRemoteImage(attachment.url, {
              source: attachment.source,
            });
            if (!localizedUrl) {
              return null;
            }

            let role = attachment.role;
            if (attachment.type === "cover") {
              role =
                resolveCoverAttachmentRole({
                  type: attachment.type,
                  url: sourceUrl,
                  title: attachment.title,
                  role: attachment.role,
                  source: attachment.source,
                  authoritative3dCoverRoleSource:
                    authoritative3dCoverRoleSource(attachment.source),
                  gridStyleCoverLabelsSource: gridStyleCoverLabelSource(
                    attachment.source,
                  ),
                }) ?? role;
            }

            return {
              ...attachment,
              url: localizedUrl,
              role,
              coverProvenance:
                coverProvenanceForSource(attachment.source, sourceUrl) ??
                attachment.coverProvenance,
            };
          }),
        )
      ).filter((a): a is NonNullable<typeof a> => a !== null);

  if (!deferImageLocalization) {
    attachmentsForRanking = await filterOutFlatImageAttachments(
      attachmentsForRanking,
    );
  }

  if (
    attachmentsForRanking.length === 0 &&
    item?.metadata?.attachments?.length
  ) {
    attachmentsForRanking = item.metadata.attachments
      .filter((attachment) => attachment.url.startsWith("/uploads/"))
      .map((attachment) => ({
        type: attachment.type,
        url: attachment.url,
        role: attachment.role ?? undefined,
        source: attachment.source ?? "merged",
        title: attachment.title ?? undefined,
        coverProvenance: attachment.coverProvenance ?? undefined,
      }));
  }

  const previousLocalCoverRaw = item?.metadata?.imageUrl?.startsWith(
    "/uploads/",
  )
    ? item.metadata.imageUrl
    : item?.imageUrl?.startsWith("/uploads/")
      ? item.imageUrl
      : null;
  const previousLocalCover =
    previousLocalCoverRaw &&
    isCoverResolutionAcceptable(
      await readFileImageMetrics(
        path.join(process.cwd(), "public", previousLocalCoverRaw),
      ),
    )
      ? previousLocalCoverRaw
      : null;

  const imageMetricsByUrl = new Map<string, AttachmentImageMetrics | null>();
  if (!deferImageLocalization) {
    await Promise.all(
      attachmentsForRanking
        .filter((attachment) =>
          shouldReadImageMetricsForAttachment(attachment.type),
        )
        .map(async (attachment) => {
          imageMetricsByUrl.set(
            attachment.url,
            await readAttachmentImageMetrics(attachment.url),
          );
        }),
    );
  }

  // Stamp the provider-declared cover traits onto each attachment so the display
  // scorer (and the client, via the stored payload) ranks the box cover / full
  // wrap signals without reading the registry.
  const rankedLocalizedAttachments = await dedupeLocalizedAttachmentsByContent(
    reorderAttachmentsCoverFirst(
      rankAttachmentsForDisplay(
        attachmentsForRanking.map(withProviderAttachmentTraits),
        imageMetricsByUrl,
        { requestedPlatformKey },
      ),
      imageMetricsByUrl,
      { requestedPlatformKey },
    ),
  );
  const storableAttachments = (
    requestedPlatformKey
      ? (() => {
          const coverCandidates = rankedLocalizedAttachments.filter(
            (attachment) =>
              ["cover", "artwork", "image"].includes(attachment.type),
          );
          return rankedLocalizedAttachments.filter((attachment) => {
            if (!["cover", "artwork", "image"].includes(attachment.type)) {
              return true;
            }
            return shouldShowCoverAttachmentOnShelf(
              attachment,
              requestedPlatformKey,
              coverCandidates,
            );
          });
        })()
      : rankedLocalizedAttachments
  ).filter((attachment) => {
    if (!["cover", "artwork", "image"].includes(attachment.type)) return true;
    if (!attachment.title?.trim()) return true;
    const catalogTitle = formattedMetadata.title || name;
    if (
      attachmentTitleMediaTypeConflicts(catalogTitle, attachment.title, {
        mediaType: type,
      })
    ) {
      return false;
    }
    if (!attachment.retailCatalogImageTitlesSource) {
      return true;
    }
    return !catalogAttachmentTitleConflicts(catalogTitle, attachment.title, {
      mediaType: type,
    });
  });
  const canonicalCoverCandidate = storableAttachments.find(
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
    isUrlEligibleDefaultCover(formattedMetadata.imageUrl, storableAttachments)
      ? formattedMetadata.imageUrl
      : null;
  const selectedImageUrl =
    canonicalCover?.url ??
    pickBestCoverFromAttachments(storableAttachments, imageMetricsByUrl, {
      requestedPlatformKey,
    }) ??
    metadataCoverFallback ??
    (previousLocalCover &&
    requestedPlatformKey &&
    shouldSuppressCoverOnPlatformShelf(
      attachmentsForRanking.find(
        (attachment) => attachment.url === previousLocalCover,
      ) ?? { type: "cover", url: previousLocalCover },
      storableAttachments.filter((attachment) =>
        ["cover", "artwork", "image"].includes(attachment.type),
      ),
      requestedPlatformKey,
    )
      ? null
      : previousLocalCover) ??
    null;

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
    const coverAttachment = storableAttachments.find(
      (attachment) => attachment.url === selectedImageUrl,
    );
    if (coverAttachment) coverAttachment.url = croppedImageUrl;
  }

  metadata.imageUrl = croppedImageUrl || undefined;

  // Computed wide hero/background: the sharpest landscape image we have (reuses
  // the display scorer + the metrics already gathered above). Null when nothing
  // high-resolution qualifies, so the UI falls back to the legacy heuristic.
  const heroImageUrl = pickBestBackgroundFromAttachments(
    storableAttachments,
    imageMetricsByUrl,
  );
  metadata.heroImageUrl = heroImageUrl || undefined;

  const metadataData = {
    ...formattedMetadata,
    imageUrl: croppedImageUrl,
    heroImageUrl,
    lastFetched: now,
    updatedAt: now,
  };

  let storedMetadata: Metadata & {
    attachments?: Attachment[];
    authors?: Author[];
    publishers?: Publisher[];
  };

  if (item?.metadata) {
    // Delete existing attachments
    await prisma.attachment.deleteMany({
      where: { metadataId: item.metadata.id },
    });

    // Update existing metadata with new authors and publishers
    storedMetadata = await prisma.metadata.update({
      where: { id: item.metadata.id },
      data: {
        ...metadataData,
        attachments: {
          create: storableAttachments.map((attachment) =>
            toAttachmentCreateData(
              attachment,
              imageMetricsByUrl.get(attachment.url),
            ),
          ),
        },
        authors: {
          set: [], // Disconnect all existing authors
          connectOrCreate: formattedMetadata.authors?.connectOrCreate || [],
        },
        publishers: {
          set: [], // Disconnect all existing publishers
          connectOrCreate: formattedMetadata.publishers?.connectOrCreate || [],
        },
      },
      include: { attachments: true, authors: true, publishers: true },
    });
  } else {
    // Create new metadata and connect it to the item
    storedMetadata = await prisma.metadata.create({
      data: {
        ...metadataData,
        items: {
          connect: { id: itemId },
        },
        attachments: {
          create: storableAttachments.map((attachment) =>
            toAttachmentCreateData(
              attachment,
              imageMetricsByUrl.get(attachment.url),
            ),
          ),
        },
      },
      include: { attachments: true, authors: true, publishers: true },
    });
  }

  const evidence =
    metadata.fieldEvidence && metadata.fieldEvidence.length > 0
      ? metadata.fieldEvidence
      : metadataFieldEvidence("MergedEngine", metadata, {
          confidence: 0.72,
          priority: 100,
        });

  await replaceFieldEvidence(
    {
      itemId,
      metadataId: storedMetadata.id,
    },
    evidence,
  );

  if (item && croppedImageUrl) {
    const previousMetadataImage = item.metadata?.imageUrl || null;
    const itemCoverStillInGallery = storableAttachments.some(
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
    const shouldSyncItemCover =
      !item.imageUrl ||
      item.imageUrl === previousMetadataImage ||
      item.imageUrl === croppedImageUrl ||
      (itemCoverIsLowRes && !userCoverSavedAfterEnrichment) ||
      attachmentsForRanking.some(
        (attachment) =>
          attachment.source === "barcode" && attachment.url === item.imageUrl,
      ) ||
      (type === "musics" &&
        !itemCoverStillInGallery &&
        storableAttachments.some(
          (attachment) => attachment.isCanonicalCoverSource,
        ));
    if (shouldSyncItemCover) {
      await prisma.item.update({
        where: { id: itemId },
        data: { imageUrl: croppedImageUrl },
      });
    }
  } else if (item && previousLocalCover && !item.imageUrl) {
    await prisma.item.update({
      where: { id: itemId },
      data: { imageUrl: previousLocalCover },
    });
  }

  const discoveredBarcode = normalizeProductBarcode(metadata.barcode);
  const itemName = name.trim() || item?.name?.trim() || "";
  if (
    item &&
    discoveredBarcode &&
    !normalizeProductBarcode(item.barcode) &&
    itemName &&
    metadata.title &&
    isMetadataTitleAligned({ title: metadata.title }, [itemName], 0.58)
  ) {
    await prisma.item.update({
      where: { id: itemId },
      data: { barcode: discoveredBarcode },
    });
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

  if (item) {
    const displayTitle = resolveMetadataDisplayTitle(metadata, item.barcode);
    await adoptItemNameFromMetadataIfPlaceholder({
      itemId,
      metadataTitle: displayTitle,
      itemName: item.name?.trim() || name.trim(),
      barcode: item.barcode,
    });
  }

  if (
    deferImageLocalization &&
    metadataSnapshotForLocalization &&
    storedMetadata.lastFetched
  ) {
    scheduleDeferredMetadataImageLocalization(
      itemId,
      metadataSnapshotForLocalization,
      type,
      name,
      storedMetadata.id,
      storedMetadata.lastFetched,
    );
  }

  try {
    await syncPriceOfferExternalLinksForMetadata({
      metadataId: storedMetadata.id,
      itemBarcode: item?.barcode,
      itemTitle: item?.name?.trim() || name.trim() || undefined,
    });
  } catch (error) {
    console.warn(
      `[Metadata] Price-offer external-link sync failed for item ${itemId}:`,
      error,
    );
  }

  return storedMetadata;
}
