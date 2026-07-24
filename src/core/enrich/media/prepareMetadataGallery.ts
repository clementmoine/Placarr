/**
 * Build, localize, rank, and filter attachments for metadata persistence.
 */
import path from "path";
import type { Attachment, AttachmentType, Type } from "@prisma/client";
import {
  deriveAttachmentPlatformKeyFromUrl,
  shouldShowCoverAttachmentOnShelf,
  rankAttachmentsForDisplay,
  reorderAttachmentsCoverFirst,
  type AttachmentImageMetrics,
} from "@/core/enrich/media/attachmentDisplayScore";
import { stampAttachmentsMissingPlatformKey } from "@/core/enrich/media/platformKeyStamp";
import { preserveGalleryAttachmentsOnRegression } from "@/core/enrich/galleryPreservation";
import { attachmentTitleAllowedForItem } from "@/core/enrich/media/attachmentTitleAllowed";
import {
  withProviderAttachmentTraits,
  authoritative3dCoverRoleSource,
  coverProvenanceForSource,
  gridStyleCoverLabelSource,
} from "@/core/catalog/sourceTraits";
import { resolveCoverAttachmentRole } from "@/core/enrich/media/coverPerspective";
import { prisma } from "@/lib/db/prisma";
import {
  readFileImageMetrics,
  isCoverResolutionAcceptable,
} from "@/core/enrich/media/imageMetrics";
import { downloadRemoteImage } from "@/core/enrich/media/imageDownload";
import {
  canUseBarcodeCacheCover,
  injectOrphanUserCoverAttachment,
  metadataImageAttachmentSemantics,
} from "@/core/enrich/media/metadataCoverBootstrap";
import {
  dedupeLocalizedAttachmentsByContent,
  filterOutFlatImageAttachments,
  readAttachmentImageMetrics,
  retargetUserHonorPinsInAttachmentGallery,
  shouldReadImageMetricsForAttachment,
} from "@/core/enrich/media/imageAssets";
import {
  prepareDeferredAttachments,
  selectAttachmentsForLocalization,
} from "@/core/enrich/media/attachmentLocalization";
import type { MetadataAttachment, MetadataResult } from "@/types/metadataProvider";

export type StoreItemContext = {
  id: string;
  barcode?: string | null;
  name?: string | null;
  imageUrl?: string | null;
  backgroundImageUrl?: string | null;
  updatedAt?: Date | string | null;
  shelf?: { name: string; type: Type } | null;
  metadata?: {
    id: string;
    imageUrl?: string | null;
    heroImageUrl?: string | null;
    lastFetched?: Date | null;
    facts?: string | null;
    attachments?: Attachment[] | null;
    authors?: unknown;
    publishers?: unknown;
  } | null;
} | null;

export async function prepareMetadataGalleryForStore(input: {
  metadata: MetadataResult;
  type: Type;
  name: string;
  itemId: string;
  item: StoreItemContext;
  requestedPlatformKey?: string | null;
  deferImageLocalization: boolean;
  metadataImageSemantics: Pick<
    MetadataAttachment,
    "type" | "role" | "source" | "title"
  > | null;
  formattedTitle?: string | null;
}): Promise<{
  attachmentsForRanking: MetadataAttachment[];
  finalStorableAttachments: MetadataAttachment[];
  imageMetricsByUrl: Map<string, AttachmentImageMetrics | null>;
  previousLocalCover: string | null;
}> {
  const {
    metadata,
    type,
    name,
    itemId,
    item,
    requestedPlatformKey,
    deferImageLocalization,
    metadataImageSemantics,
    formattedTitle,
  } = input;

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
      formattedTitle || name,
      attachment,
      { mediaType: type },
    ),
  );

  const withOrphanUserPins = preserveGalleryAttachmentsOnRegression(
    item?.metadata?.attachments ?? undefined,
    injectOrphanUserCoverAttachment(item, storableAttachments),
    requestedPlatformKey ?? undefined,
  );
  const finalStorableAttachments =
    await retargetUserHonorPinsInAttachmentGallery(withOrphanUserPins);


  return {
    attachmentsForRanking,
    finalStorableAttachments,
    imageMetricsByUrl,
    previousLocalCover,
  };
}
