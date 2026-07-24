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
  deriveAttachmentPlatformKeyFromUrl,
  shouldShowCoverAttachmentOnShelf,
  shouldSuppressCoverOnPlatformShelf,
  pickBestBackgroundFromAttachments,
  pickBestCoverFromAttachments,
  rankAttachmentsForDisplay,
  reorderAttachmentsCoverFirst,
  resolveStoredMetadataCoverUrl,
  type AttachmentImageMetrics,
} from "@/core/enrich/media/attachmentDisplayScore";
import { detectShelfGamePlatformKey } from "@/core/enrich/platform";
import {
  detectVideoGamePlatformKey,
  isVideoGamePlatformKey,
} from "@/core/identify/platforms/platforms";
import { preserveGalleryAttachmentsOnRegression } from "@/core/enrich/galleryPreservation";
import { stampAttachmentsMissingPlatformKey } from "@/core/enrich/media/platformKeyStamp";
import { adoptItemNameFromMetadataIfPlaceholder } from "@/core/collect/adoptMetadataTitle";
import { resolveMetadataDisplayTitle } from "@/core/enrich/titles/refineCatalogDisplayTitle";
import { attachmentTitleAllowedForItem } from "@/core/enrich/media/attachmentTitleAllowed";
import { isMetadataTitleAligned } from "@/core/enrich/titleMatching";
import {
  urlsReferToSameLocalizedImage,
  isUrlEligibleDefaultCover,
  isCoverEligibleAttachmentType,
} from "@/core/enrich/media/coverUrl";
import {
  readFileImageMetrics,
  isCoverResolutionAcceptable,
} from "@/core/enrich/media/imageMetrics";
import {
  isMissingArtImageUrl,
  isPlaceholderCoverImage,
} from "@/core/enrich/media/coverPlaceholder";
import { cropImageIfNeeded } from "@/core/enrich/media/imageTrim";
import {
  withProviderAttachmentTraits,
  authoritative3dCoverRoleSource,
  coverProvenanceForSource,
  gridStyleCoverLabelSource,
  inferProviderIdFromMediaUrl,
} from "@/core/catalog/sourceTraits";
import { resolveAttachmentDisplayRegion } from "@/core/enrich/media/attachmentDisplayLabels";
import { regionRank } from "@/core/locale/preference";
import { resolveCoverAttachmentRole } from "@/core/enrich/media/coverPerspective";
import { barcodeListingMatchesItem } from "@/core/identify/titleUtils";
import { normalizeProductBarcode } from "@/core/identify/normalize";
import { inferImageAttachmentFromMediaUrl } from "@/core/catalog/catalog";
import { prisma } from "@/lib/db/prisma";
import { metadataFieldEvidence } from "@/core/enrich/facts";
import { runCpuBackgroundWork } from "@/core/collect/jobs/backgroundWorkQueue";
import type {
  MetadataAttachment,
  MetadataResult,
} from "@/types/metadataProvider";
import type { Item } from "@prisma/client";
import { replaceFieldEvidence, mergeFieldEvidenceForStorage } from "@/core/enrich/evidence";

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
import { dedupeFacts } from "@/core/enrich/facts";
import { downloadRemoteImage } from "@/core/enrich/media/imageDownload";
import {
  dedupeLocalizedAttachmentsByContent,
  filterOutFlatImageAttachments,
  perceptualHashForAsset,
  PERCEPTUAL_DUPLICATE_MAX_DISTANCE,
  readAttachmentImageMetrics,
  retargetUserHonorPinsInAttachmentGallery,
  shouldReadImageMetricsForAttachment,
} from "@/core/enrich/media/imageAssets";
import { pickVisuallyMatchingCatalogCoverUrl } from "@/core/enrich/media/croppedCoverSync";
import {
  cloneMetadataForImageLocalization,
  prepareDeferredAttachments,
  selectAttachmentsForLocalization,
} from "@/core/enrich/media/attachmentLocalization";

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

export { isMissingMusicGallery } from "@/core/enrich/galleries";

export async function getCachedMetadata(
  itemId: Item["id"],
): Promise<(Metadata & { attachments: Attachment[] }) | null> {
  const item = await prisma.item.findUnique({
    where: { id: itemId },
    include: { metadata: { include: { attachments: true } } },
  });
  return item?.metadata || null;
}

export { looksLikeImageBuffer } from "@/core/enrich/media/imageBuffer";

function injectOrphanUserCoverAttachment(
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

  const attachmentsList = stampAttachmentsMissingPlatformKey(
    (metadata.attachments || []).map((attachment) =>
      withProviderAttachmentTraits(attachment),
    ),
    metadata.platformKey ?? requestedPlatformKey,
  );
  if (metadata.imageUrl) {
    const exists = attachmentsList.some(
      (attachment) => attachment.url === metadata.imageUrl,
    );
    if (!exists) {
      attachmentsList.unshift(
        withProviderAttachmentTraits({
          type: metadataImageSemantics?.type ?? "cover",
          url: metadata.imageUrl,
          role: metadataImageSemantics?.role,
          source: metadataImageSemantics?.source ?? undefined,
          title: metadataImageSemantics?.title,
        }),
      );
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
            attachmentsList.unshift(
              withProviderAttachmentTraits({
                type:
                  barcodeCoverSemantics?.type ?? ("cover" as AttachmentType),
                url: barcodeCover,
                role: barcodeCoverSemantics?.role,
                source: barcodeCoverSemantics?.source ?? "barcode",
                title: barcodeCoverSemantics?.title,
              }),
            );
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

  // Localize a ranked subset — full SteamGridDB/SS galleries (30+ assets) used
  // to dominate metadata wall time. Non-selected remotes stay as https URLs.
  const localizeUrls = new Set(
    selectAttachmentsForLocalization(uniqueAttachments).map(
      (attachment) => attachment.url,
    ),
  );

  let attachmentsForRanking = deferImageLocalization
    ? prepareDeferredAttachments(uniqueAttachments)
    : (
        await Promise.all(
          uniqueAttachments.map(async (attachment) => {
            const sourceUrl = attachment.url;
            const shouldLocalize =
              localizeUrls.has(sourceUrl) && /^https?:\/\//i.test(sourceUrl);

            let nextUrl = sourceUrl;
            if (shouldLocalize) {
              const localizedUrl = await downloadRemoteImage(sourceUrl, {
                source: attachment.source,
                itemId,
                metadataId: item?.metadata?.id,
              });
              // Keep the remote URL when localize fails (CloudFront / Flare
              // blips) so marketplace covers still appear in the gallery.
              if (localizedUrl) nextUrl = localizedUrl;
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
              url: nextUrl,
              role,
              coverProvenance:
                coverProvenanceForSource(attachment.source, sourceUrl) ??
                attachment.coverProvenance,
              // Derive from the *original* remote URL — the local /uploads path it
              // is about to become no longer carries the platform signal.
              platformKey:
                deriveAttachmentPlatformKeyFromUrl(sourceUrl) ??
                attachment.platformKey,
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
        source: attachment.source ?? undefined,
        title: attachment.title ?? undefined,
        coverProvenance: attachment.coverProvenance ?? undefined,
        platformKey: attachment.platformKey ?? undefined,
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
  ).filter((attachment) =>
    attachmentTitleAllowedForItem(
      formattedMetadata.title || name,
      attachment,
      { mediaType: type },
    ),
  );

  const withOrphanUserPins = preserveGalleryAttachmentsOnRegression(
    item?.metadata?.attachments,
    injectOrphanUserCoverAttachment(item, storableAttachments),
    requestedPlatformKey,
  );
  const finalStorableAttachments =
    await retargetUserHonorPinsInAttachmentGallery(withOrphanUserPins);

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

  metadata.imageUrl = croppedImageUrl || undefined;

  // Computed wide hero/background: the sharpest landscape image we have (reuses
  // the display scorer + the metrics already gathered above). Null when nothing
  // high-resolution qualifies, so the UI falls back to the legacy heuristic.
  const heroImageUrl = pickBestBackgroundFromAttachments(
    finalStorableAttachments,
    imageMetricsByUrl,
  );
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
      // A newer store landed while we localized — keep it.
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
          create: finalStorableAttachments.map((attachment) =>
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
          create: finalStorableAttachments.map((attachment) =>
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

  const previousEvidence =
    item?.metadata?.id
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
            attachment.source === "barcode" &&
            attachment.url === item.imageUrl,
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
    const displayTitle = resolveMetadataDisplayTitle(metadata, effectiveBarcode);
    await adoptItemNameFromMetadataIfPlaceholder({
      itemId,
      metadataTitle: displayTitle,
      itemName: item.name?.trim() || name.trim(),
      barcode: effectiveBarcode,
    });
  }

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

  return storedMetadata;
}

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
