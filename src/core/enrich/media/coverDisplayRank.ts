import {
  isCoverCandidateKind,
  isPhysicalNonCoverKind,
} from "@/core/enrich/media/attachmentDisplayLabels";
import {
  coverProvenanceRank,
  resolveCoverProvenance,
} from "@/core/enrich/media/coverProvenance";
import { isCoverEligibleAttachmentType } from "@/core/enrich/media/coverUrl";
import {
  isCoverResolutionAcceptable,
  shortestImageEdge,
} from "@/core/enrich/media/coverResolution";
import { regionRank } from "@/core/locale/preference";
import {
  attachmentSemantics,
  type AttachmentDisplayScoreOptions,
  type AttachmentImageMetrics,
  type ScoredAttachmentInput,
} from "@/core/enrich/media/attachmentDisplayTypes";
import {
  platformMatchRank,
  platformMismatchRank,
} from "@/core/enrich/media/attachmentPlatformGate";
import {
  crossSourceConsensusBonus,
  mergeRolesByRegion,
  normalizeAttachmentSource,
  preferredDisplaySource,
  rankAttachmentsForDisplay,
  scoreAttachmentForDisplay,
} from "@/core/enrich/media/attachmentDisplayScoring";

export function coverDisplayTypeRank(
  semantics: ReturnType<typeof attachmentSemantics>,
  attachment: ScoredAttachmentInput,
  options?: AttachmentDisplayScoreOptions,
): number {
  if (options?.preferDiscCover && semantics.kind === "disc") {
    return 0;
  }
  if (options?.preferSystemOnlyCover) {
    const title = (attachment.title || "").toLowerCase();
    if (/\bsystem\s*only\b/.test(title) || /^loose$/.test(title.trim())) {
      return 0;
    }
    if (/\bconsole\b/.test(title) && !/\bbox\b/.test(title)) {
      return 1;
    }
  }
  const isFrontCover =
    isCoverCandidateKind(semantics.kind) &&
    !isPhysicalNonCoverKind(semantics.kind);
  if (!isFrontCover) {
    return 5;
  }
  // Box fronts rank after disc art when showing a loose copy.
  if (options?.preferDiscCover || options?.preferSystemOnlyCover) {
    if (semantics.kind === "cover3d") return 3;
    if (attachment.isFullWrapCoverSource === true) return 4;
    if (semantics.kind === "cover") return 2;
    return 3;
  }
  if (semantics.kind === "grid") return 3;
  if (semantics.kind === "grid3d") return 4;
  if (semantics.kind === "cover3d") return 1;
  if (attachment.isFullWrapCoverSource === true) return 2;
  if (semantics.kind === "cover") return 0;
  return 3;
}

/** Marketplace listing photos rank after every regional catalog cover. */
export const MARKETPLACE_COVER_LOCALE_PENALTY = 100;

export function isMarketplaceCoverRole(role?: string | null): boolean {
  const normalized = (role || "").toLowerCase().trim();
  return (
    normalized === "marketplace" ||
    normalized === "marketplace_offer" ||
    normalized.startsWith("3d-marketplace")
  );
}

/**
 * Locale/region tier for cover ranking. Regional tags (fr, eu, …) always beat
 * marketplace roles and unknown regions — quality (score) is compared only
 * within the same locale tier (see `compareCoverDisplayRank`).
 */
export function coverLocaleRank(
  semantics: ReturnType<typeof attachmentSemantics>,
  role?: string | null,
  options?: AttachmentDisplayScoreOptions,
): number {
  const base = regionRank(semantics.region, options);
  if (isMarketplaceCoverRole(role)) {
    return base + MARKETPLACE_COVER_LOCALE_PENALTY;
  }
  return base;
}

/** Locale tier for a gallery row — used when deciding whether to keep a metadata pin. */
export function coverLocaleRankForAttachment(
  attachment: ScoredAttachmentInput,
  options?: AttachmentDisplayScoreOptions,
): number {
  return coverLocaleRank(
    attachmentSemantics(attachment),
    attachment.role,
    options,
  );
}

export function compareCoverDisplayRank<
  T extends {
    platformMismatchRank: number;
    typeRank: number;
    localeRankValue: number;
    platformMatchRank: number;
    provenanceRank: number;
    shortestEdge: number;
    score: number;
    index: number;
  },
>(a: T, b: T): number {
  return (
    a.platformMismatchRank - b.platformMismatchRank ||
    a.typeRank - b.typeRank ||
    a.platformMatchRank - b.platformMatchRank ||
    a.localeRankValue - b.localeRankValue ||
    a.provenanceRank - b.provenanceRank ||
    b.score - a.score ||
    b.shortestEdge - a.shortestEdge ||
    a.index - b.index
  );
}

export function rankCoversForDisplay<T extends ScoredAttachmentInput>(
  attachments: T[],
  imageMetricsByUrl?: Map<string, AttachmentImageMetrics | null>,
  options?: AttachmentDisplayScoreOptions,
): T[] {
  const scored = attachments.map((attachment, index) => {
    const semantics = attachmentSemantics(attachment);
    const typeRank = coverDisplayTypeRank(semantics, attachment, options);

    const metrics = imageMetricsByUrl?.get(attachment.url);
    return {
      attachment,
      index,
      typeRank,
      platformMismatchRank: platformMismatchRank(
        attachment,
        options?.requestedPlatformKey,
      ),
      platformMatchRank: platformMatchRank(
        attachment,
        options?.requestedPlatformKey,
      ),
      localeRankValue: coverLocaleRank(
        semantics,
        attachment.role,
        options,
      ),
      provenanceRank: coverProvenanceRank(
        resolveCoverProvenance({
          provenance: attachment.coverProvenance,
        }),
      ),
      shortestEdge: shortestImageEdge(metrics),
      score: scoreAttachmentForDisplay(attachment, metrics, options),
    };
  });

  const bestByUrl = new Map<
    string,
    {
      attachment: T;
      score: number;
      index: number;
      typeRank: number;
      platformMismatchRank: number;
      platformMatchRank: number;
      localeRankValue: number;
      provenanceRank: number;
      shortestEdge: number;
      sources: Set<string>;
      sourceLabels: Set<string>;
    }
  >();

  const rememberCoverSource = (
    bucket: { sources: Set<string>; sourceLabels: Set<string> },
    attachment: T,
    source: string | null,
  ) => {
    if (!source) return;
    bucket.sources.add(source);
    if (source === "user") return;
    const label = attachment.providerLabel?.trim();
    if (label) bucket.sourceLabels.add(label);
    else bucket.sourceLabels.add(source);
  };

  for (const entry of scored) {
    if (!entry.attachment.url) continue;
    const source = normalizeAttachmentSource(entry.attachment.source);
    const existing = bestByUrl.get(entry.attachment.url);
    if (!existing) {
      const sources = new Set<string>();
      const sourceLabels = new Set<string>();
      rememberCoverSource({ sources, sourceLabels }, entry.attachment, source);
      bestByUrl.set(entry.attachment.url, {
        ...entry,
        sources,
        sourceLabels,
      });
    } else {
      const mergedRole = mergeRolesByRegion(
        existing.attachment.role,
        entry.attachment.role,
        options,
      );

      const preferIncomingProvider =
        normalizeAttachmentSource(existing.attachment.source) === "user" &&
        source != null &&
        source !== "user";
      const keepExisting =
        !preferIncomingProvider && compareCoverDisplayRank(existing, entry) < 0;
      rememberCoverSource(existing, entry.attachment, source);

      const winner = keepExisting ? existing.attachment : entry.attachment;
      const mergedAttachment: T = {
        ...winner,
        role: mergedRole,
        source: preferredDisplaySource(
          winner.source,
          entry.attachment.source,
          existing.attachment.source,
        ),
        title:
          winner.title ||
          existing.attachment.title ||
          entry.attachment.title ||
          null,
        providerLabel:
          winner.providerLabel ||
          entry.attachment.providerLabel ||
          existing.attachment.providerLabel ||
          null,
      };

      bestByUrl.set(entry.attachment.url, {
        attachment: mergedAttachment,
        sources: existing.sources,
        sourceLabels: existing.sourceLabels,
        score: keepExisting ? existing.score : entry.score,
        index: keepExisting ? existing.index : entry.index,
        typeRank: keepExisting ? existing.typeRank : entry.typeRank,
        platformMismatchRank: keepExisting
          ? existing.platformMismatchRank
          : entry.platformMismatchRank,
        platformMatchRank: keepExisting
          ? existing.platformMatchRank
          : entry.platformMatchRank,
        localeRankValue: keepExisting
          ? existing.localeRankValue
          : entry.localeRankValue,
        provenanceRank: keepExisting
          ? existing.provenanceRank
          : entry.provenanceRank,
        shortestEdge: keepExisting ? existing.shortestEdge : entry.shortestEdge,
      });
    }
  }

  return Array.from(bestByUrl.values())
    .map((entry) => {
      const sourceNames =
        entry.sourceLabels.size > 1
          ? Array.from(entry.sourceLabels)
          : entry.attachment.sourceNames;
      const attachment =
        sourceNames && sourceNames !== entry.attachment.sourceNames
          ? { ...entry.attachment, sourceNames }
          : entry.attachment;
      return {
        ...entry,
        attachment,
        score: entry.score + crossSourceConsensusBonus(entry.sources.size),
      };
    })
    .sort(compareCoverDisplayRank)
    .map((entry) => entry.attachment);
}

export function pickBestAcceptableCoverFromAttachments<
  T extends ScoredAttachmentInput,
>(
  attachments: T[],
  imageMetricsByUrl?: Map<string, AttachmentImageMetrics | null>,
  options?: AttachmentDisplayScoreOptions,
): string | null {
  const candidates = rankCoverGalleryAttachments(
    attachments,
    imageMetricsByUrl,
    options,
  );
  let best: { url: string; score: number; edge: number } | null = null;

  for (const attachment of candidates) {
    if (!attachment.url) continue;
    const metrics = imageMetricsByUrl?.get(attachment.url) ?? null;
    if (!isCoverResolutionAcceptable(metrics)) continue;

    const semantics = attachmentSemantics(attachment);
    if (isPhysicalNonCoverKind(semantics.kind)) {
      if (!(options?.preferDiscCover && semantics.kind === "disc")) continue;
    } else if (
      !isCoverCandidateKind(semantics.kind) &&
      attachment.type !== "image" &&
      attachment.type !== "artwork"
    ) {
      continue;
    }

    const score = scoreAttachmentForDisplay(attachment, metrics, options);
    const edge = shortestImageEdge(metrics);
    if (
      !best ||
      score > best.score ||
      (score === best.score && edge > best.edge)
    ) {
      best = { url: attachment.url, score, edge };
    }
  }

  return best?.url ?? null;
}

export function pickBestCoverFromAttachments<T extends ScoredAttachmentInput>(
  attachments: T[],
  imageMetricsByUrl?: Map<string, AttachmentImageMetrics | null>,
  options?: AttachmentDisplayScoreOptions,
): string | null {
  const ranked = rankCoverGalleryAttachments(
    attachments,
    imageMetricsByUrl,
    options,
  );
  const preferred = ranked[0] ?? null;
  const preferredMetrics = preferred?.url
    ? (imageMetricsByUrl?.get(preferred.url) ?? null)
    : null;

  if (
    preferred?.url &&
    isCoverEligibleAttachmentType(preferred.type) &&
    isCoverResolutionAcceptable(preferredMetrics)
  ) {
    return preferred.url;
  }

  const acceptable = pickBestAcceptableCoverFromAttachments(
    attachments,
    imageMetricsByUrl,
    options,
  );
  if (acceptable) return acceptable;

  const fallback = ranked.find(
    (attachment) =>
      attachment.url && isCoverEligibleAttachmentType(attachment.type),
  );
  return fallback?.url ?? null;
}

/**
 * Pick the metadata default cover after scoring. A remote regional catalog
 * cover (Booknode FR, …) is kept even when a localized marketplace photo exists
 * in /uploads/.
 */
export function resolveStoredMetadataCoverUrl(
  scoredImageUrl: string | null,
  coverAttachments: ScoredAttachmentInput[],
  imageMetricsByUrl?: Map<string, AttachmentImageMetrics | null>,
  options?: AttachmentDisplayScoreOptions,
): string | null {
  if (!scoredImageUrl) return null;
  if (scoredImageUrl.startsWith("/uploads/")) return scoredImageUrl;

  const scoredAttachment = coverAttachments.find(
    (attachment) => attachment.url === scoredImageUrl,
  );
  if (scoredAttachment && !isMarketplaceCoverRole(scoredAttachment.role)) {
    return scoredImageUrl;
  }

  const localized = coverAttachments.filter((attachment) =>
    attachment.url?.startsWith("/uploads/"),
  );
  if (localized.length === 0) return scoredImageUrl;

  return (
    pickBestCoverFromAttachments(localized, imageMetricsByUrl, options) ??
    scoredImageUrl
  );
}

/** Shared cover ordering for the default picker and gallery UIs. */
export function rankCoverGalleryAttachments<T extends ScoredAttachmentInput>(
  attachments: T[],
  imageMetricsByUrl?: Map<string, AttachmentImageMetrics | null>,
  options?: AttachmentDisplayScoreOptions,
): T[] {
  const coverCandidates: T[] = [];
  const galleryExtras: T[] = [];

  for (const attachment of attachments) {
    if (!attachment.url) continue;
    const semantics = attachmentSemantics(attachment);
    // Disc / support art belongs in the cover tab (picker + gallery). Default
    // ranking still puts box fronts first; preferDiscCover promotes discs.
    if (semantics.kind === "disc") {
      coverCandidates.push(attachment);
      continue;
    }
    // Hardware loose: System Only / console shots compete as cover candidates.
    if (options?.preferSystemOnlyCover) {
      const title = (attachment.title || "").toLowerCase();
      if (
        /\bsystem\s*only\b/.test(title) ||
        /^loose$/.test(title.trim()) ||
        (/\bconsole\b/.test(title) && !/\bbox\b/.test(title))
      ) {
        coverCandidates.push(attachment);
        continue;
      }
    }
    if (isPhysicalNonCoverKind(semantics.kind)) continue; // back / spine
    if (isCoverCandidateKind(semantics.kind)) {
      coverCandidates.push(attachment);
      continue;
    }
    galleryExtras.push(attachment);
  }

  if (coverCandidates.length > 0) {
    return [
      ...rankCoversForDisplay(coverCandidates, imageMetricsByUrl, options),
      ...rankAttachmentsForDisplay(galleryExtras, imageMetricsByUrl, options),
    ];
  }

  return rankAttachmentsForDisplay(attachments, imageMetricsByUrl, options);
}

export const COVER_ATTACHMENT_TYPES = new Set(["cover", "artwork", "image"]);

/** Persist/read cover attachments in the same quality order used for imageUrl. */
export function reorderAttachmentsCoverFirst<T extends ScoredAttachmentInput>(
  attachments: T[],
  imageMetricsByUrl?: Map<string, AttachmentImageMetrics | null>,
  options?: AttachmentDisplayScoreOptions,
): T[] {
  const covers = attachments.filter((attachment) =>
    COVER_ATTACHMENT_TYPES.has(attachment.type),
  );
  const nonCovers = attachments.filter(
    (attachment) => !COVER_ATTACHMENT_TYPES.has(attachment.type),
  );
  if (covers.length === 0) return attachments;

  // Cover-picker ranking omits box backs / spines (and used to omit discs).
  // Re-append anything dropped so persist matches merge's trailing recovery —
  // otherwise LaunchBox disc/back/spine never reach Prisma Attachment rows.
  const rankedCovers = rankCoverGalleryAttachments(
    covers,
    imageMetricsByUrl,
    options,
  );
  const rankedUrls = new Set(
    rankedCovers.map((attachment) => attachment.url).filter(Boolean),
  );
  const omittedFromRanking = covers.filter(
    (attachment) => attachment.url && !rankedUrls.has(attachment.url),
  );
  return [...rankedCovers, ...omittedFromRanking, ...nonCovers];
}
