import {
  Attachment,
  Author,
  Metadata,
  Publisher,
  Type,
} from "@/generated/prisma/browser";
import type { Item } from "@/generated/prisma/browser";
import { detectShelfGamePlatformKey } from "@/core/enrich/platform";
import { prisma } from "@/lib/db/prisma";
import { dedupeFacts, metadataFieldEvidence } from "@/core/enrich/facts";
import { runCpuBackgroundWork } from "@/core/collect/jobs/backgroundWorkQueue";
import type { MetadataResult } from "@/types/metadataProvider";
import {
  replaceFieldEvidence,
  mergeFieldEvidenceForStorage,
} from "@/core/enrich/evidence";
import {
  formatMetadataForStorage,
  toAttachmentCreateData,
} from "@/core/enrich/dbMapping";
import { syncPriceOfferExternalLinksForMetadata } from "@/core/enrich/persistProviderExternalLinks";
import { syncMetadataDisplayFactsFromFieldEvidence } from "@/core/enrich/metadataFactsProjection";
import {
  mergeMetadataFactsForStorage,
  parseMetadataFactsJson,
} from "@/core/enrich/metadataFactsMerge";
import { metadataAliases } from "@/core/enrich/aliases";
import { providerProductUrlsFromMetadataFacts } from "@/core/catalog/catalog";
import { reconfrontItemPricesFromDurableEvidence } from "@/core/commerce/pricing/reconfrontFromEvidence";
import { downloadRemoteImage } from "@/core/enrich/media/imageDownload";
import { metadataImageAttachmentSemantics } from "@/core/enrich/media/metadataCoverBootstrap";
import { cloneMetadataForImageLocalization } from "@/core/enrich/media/attachmentLocalization";
import { prepareMetadataGalleryForStore } from "@/core/enrich/media/prepareMetadataGallery";
import { resolveMetadataCoverAndHero } from "@/core/enrich/media/resolveMetadataCoverHero";
import { syncItemFieldsAfterMetadataStore } from "@/core/enrich/media/syncItemAfterMetadataStore";

export {
  canUseBarcodeCacheCover,
  getCachedMetadata,
  metadataImageAttachmentSemantics,
} from "@/core/enrich/media/metadataCoverBootstrap";
export {
  pickVisuallyMatchingCatalogCoverUrl,
  planCroppedCoverAttachmentSync,
  syncCroppedCoverAttachment,
  type CroppedCoverAttachmentSyncPlan,
} from "@/core/enrich/media/croppedCoverSync";
export {
  MAX_ATTACHMENTS_TO_LOCALIZE,
  selectAttachmentsForLocalization,
} from "@/core/enrich/media/attachmentLocalization";
export { isMissingMusicGallery } from "@/core/enrich/galleries";
export { looksLikeImageBuffer } from "@/core/enrich/media/imageBuffer";
export {
  canKeepRemoteImageOnDownloadFailure,
  downloadRemoteImage,
} from "@/core/enrich/media/imageDownload";
export {
  dedupeByPerceptualHash,
  dedupeLocalizedAttachmentsByContent,
  filterOutFlatImageAttachments,
  hammingDistance,
  keepSourcelessCoverOnlyWithoutCatalogTwin,
  readAttachmentImageMetrics,
  retargetUserHonorPinIfCatalogTwin,
  retargetUserHonorPinsInAttachmentGallery,
  shouldReadImageMetricsForAttachment,
} from "@/core/enrich/media/imageAssets";
export {
  formatMetadataForStorage,
  formatMetadataFromStorage,
} from "@/core/enrich/dbMapping";
export {
  providerOriginalImageUrl,
  retailerOriginalImageUrl,
} from "@/core/enrich/imageUrls";

export type StoreMetadataOptions = {
  /** Persist remote URLs immediately; localize images in a background job. */
  deferImageLocalization?: boolean;
  /**
   * Progressive Pass-1 stores defer remote URLs for the UI but must not
   * schedule localization — a stale Pass-1 job can finish after Pass-2 and
   * wipe the richer gallery (LaunchBox discs, etc.).
   */
  skipDeferredLocalizationSchedule?: boolean;
  /**
   * When set (deferred localize jobs), abort the write if `lastFetched` moved
   * since this generation was scheduled.
   */
  expectLastFetched?: Date;
};

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
    const stillCurrentGeneration = async () => {
      const current = await prisma.metadata.findUnique({
        where: { id: metadataId },
        select: { lastFetched: true },
      });
      return (
        Boolean(current?.lastFetched) &&
        current!.lastFetched!.getTime() === fetchedAt.getTime()
      );
    };

    if (!(await stillCurrentGeneration())) {
      return;
    }

    try {
      await storeMetadata(itemId, metadata, type, name, {
        deferImageLocalization: false,
        // Refuse to commit if a newer store landed while we were downloading.
        expectLastFetched: fetchedAt,
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
      (await downloadRemoteImage(metadata.imageUrl, { itemId })) || undefined;
  }

  const formattedMetadata = await formatMetadataForStorage(
    metadata,
    type,
    name,
  );

  const now = new Date();

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

  const {
    attachmentsForRanking,
    finalStorableAttachments,
    imageMetricsByUrl,
    previousLocalCover,
  } = await prepareMetadataGalleryForStore({
    metadata,
    type,
    name,
    itemId,
    item,
    requestedPlatformKey,
    deferImageLocalization,
    metadataImageSemantics,
    formattedTitle: formattedMetadata.title,
  });

  const {
    croppedImageUrl,
    heroImageUrl,
    finalStorableAttachments: storableAttachments,
  } = await resolveMetadataCoverAndHero({
    finalStorableAttachments,
    attachmentsForRanking,
    imageMetricsByUrl,
    deferImageLocalization,
    formattedImageUrl: formattedMetadata.imageUrl,
    previousLocalCover,
    requestedPlatformKey,
  });

  metadata.imageUrl = croppedImageUrl || undefined;
  metadata.heroImageUrl = heroImageUrl || undefined;

  const mergedFacts = item?.metadata
    ? mergeMetadataFactsForStorage(
        parseMetadataFactsJson(item.metadata.facts),
        metadata.facts ?? [],
        {
          itemBarcode: item.barcode,
          itemTitle: item.name?.trim() || name.trim() || undefined,
          shelfType: type,
        },
      )
    : (metadata.facts ?? []);
  const dedupedMergedFacts = dedupeFacts(mergedFacts);
  const mergedFactsJson = dedupedMergedFacts
    ? JSON.stringify(dedupedMergedFacts)
    : null;

  const metadataData = {
    ...formattedMetadata,
    facts: mergedFactsJson,
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

  if (options.expectLastFetched && item?.metadata) {
    const current = await prisma.metadata.findUnique({
      where: { id: item.metadata.id },
      select: { lastFetched: true },
    });
    if (
      !current?.lastFetched ||
      current.lastFetched.getTime() !== options.expectLastFetched.getTime()
    ) {
      return {
        ...item.metadata,
        attachments: item.metadata.attachments,
        authors: item.metadata.authors,
        publishers: item.metadata.publishers,
      };
    }
  }

  if (item?.metadata) {
    storedMetadata = await prisma.metadata.update({
      where: { id: item.metadata.id },
      data: {
        ...metadataData,
        attachments: {
          deleteMany: {},
          create: storableAttachments.map((attachment) =>
            toAttachmentCreateData(
              attachment,
              imageMetricsByUrl.get(attachment.url),
            ),
          ),
        },
        authors: {
          set: [],
          connectOrCreate: formattedMetadata.authors?.connectOrCreate || [],
        },
        publishers: {
          set: [],
          connectOrCreate: formattedMetadata.publishers?.connectOrCreate || [],
        },
      },
      include: { attachments: true, authors: true, publishers: true },
    });
  } else {
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

  const incomingEvidence =
    metadata.fieldEvidence && metadata.fieldEvidence.length > 0
      ? metadata.fieldEvidence
      : metadataFieldEvidence("MergedEngine", metadata, {
          confidence: 0.72,
          priority: 100,
        });

  const previousEvidence = item?.metadata?.id
    ? await prisma.fieldEvidence.findMany({
        where: { metadataId: item.metadata.id },
      })
    : [];

  const evidence = mergeFieldEvidenceForStorage(
    previousEvidence.map((row) => ({
      field: row.field,
      source: row.source,
      value: row.value,
      normalizedValue: row.normalizedValue,
      rawValue: row.rawValue,
      confidence: row.confidence,
      priority: row.priority,
      sourceUrl: row.sourceUrl,
      locale: row.locale,
      region: row.region,
      observedAt: row.observedAt,
    })),
    incomingEvidence,
  );

  await replaceFieldEvidence(
    {
      itemId,
      metadataId: storedMetadata.id,
    },
    evidence,
  );

  await syncItemFieldsAfterMetadataStore({
    itemId,
    item,
    metadata,
    type,
    name,
    croppedImageUrl,
    heroImageUrl,
    previousLocalCover,
    requestedPlatformKey,
    finalStorableAttachments: storableAttachments,
    attachmentsForRanking,
    imageMetricsByUrl,
  });

  if (
    deferImageLocalization &&
    !options.skipDeferredLocalizationSchedule &&
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
      itemId,
      itemBarcode: item?.barcode,
      itemTitle: item?.name?.trim() || name.trim() || undefined,
      shelfType: type,
    });
  } catch (error) {
    console.warn(
      `[Metadata] Price-offer external-link sync failed for item ${itemId}:`,
      error,
    );
  }

  try {
    await syncMetadataDisplayFactsFromFieldEvidence({
      metadataId: storedMetadata.id,
      itemBarcode: item?.barcode,
      itemTitle: item?.name?.trim() || name.trim() || undefined,
      shelfType: type,
    });
  } catch (error) {
    console.warn(
      `[Metadata] Field-evidence fact projection failed for item ${itemId}:`,
      error,
    );
  }

  // Soft bag grew (aliases / catalog title) — re-pick prices from durable
  // SearchYield / DetailYield only (zero HTTP). Best-effort; never blocks store.
  const softAliases = metadataAliases(metadata.aliases) ?? [];
  const softTitle = metadata.title?.trim() || formattedMetadata.title?.trim();
  if (softAliases.length > 0 || softTitle) {
    const itemName = item?.name?.trim() || name.trim();
    void reconfrontItemPricesFromDurableEvidence({
      itemId,
      metadataId: storedMetadata.id,
      shelfType: type,
      shelfName: item?.shelf?.name,
      itemName,
      metadataTitle: softTitle,
      aliases: softAliases,
      barcode: item?.barcode,
      platformKey: requestedPlatformKey,
      providerProductUrls: providerProductUrlsFromMetadataFacts(
        metadata.facts ?? parseMetadataFactsJson(storedMetadata.facts),
      ),
    }).catch((error) => {
      console.warn(
        `[Metadata] Evidence-only price reconfront failed for item ${itemId}:`,
        error,
      );
    });
  }

  return storedMetadata;
}
