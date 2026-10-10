/**
 * Cap and prepare remote attachments for deferred image localization.
 */
import { deriveAttachmentPlatformKeyFromUrl } from "@/core/enrich/media/attachmentDisplayScore";
import {
  authoritative3dCoverRoleSource,
  coverProvenanceForSource,
  gridStyleCoverLabelSource,
} from "@/core/catalog/sourceTraits";
import { resolveCoverAttachmentRole } from "@/core/enrich/media/coverPerspective";
import type {
  MetadataAttachment,
  MetadataResult,
} from "@/types/metadataProvider";

export function cloneMetadataForImageLocalization(
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

export function prepareDeferredAttachments(
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
      platformKey:
        deriveAttachmentPlatformKeyFromUrl(sourceUrl) ?? attachment.platformKey,
    };
  });
}

/** Prefer covers/heroes over screenshot grids when capping downloads. */
function attachmentLocalizationPriority(
  attachment: MetadataAttachment,
): number {
  const type = (attachment.type || "").toLowerCase();
  const role = (attachment.role || "").toLowerCase();
  if (type === "cover" || role.includes("cover") || role.includes("box")) {
    return 0;
  }
  if (type === "hero" || role.includes("hero") || role.includes("background")) {
    return 1;
  }
  if (type === "logo" || role.includes("logo")) return 2;
  if (type === "screenshot" || role.includes("screenshot")) return 4;
  return 3;
}

/**
 * Cap remote downloads per metadata store. Full provider galleries (SteamGridDB,
 * ScreenScraper, …) routinely exceed 30 assets and dominated worker wall time.
 * Non-selected remotes stay as https URLs in the gallery.
 */
export const MAX_ATTACHMENTS_TO_LOCALIZE = 12;

export function selectAttachmentsForLocalization(
  attachments: MetadataAttachment[],
  limit = MAX_ATTACHMENTS_TO_LOCALIZE,
): MetadataAttachment[] {
  const remote = attachments.filter((attachment) =>
    /^https?:\/\//i.test(attachment.url),
  );
  if (remote.length <= limit) return remote;
  return [...remote]
    .sort(
      (left, right) =>
        attachmentLocalizationPriority(left) -
        attachmentLocalizationPriority(right),
    )
    .slice(0, limit);
}
