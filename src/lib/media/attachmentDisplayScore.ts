import type { AttachmentType } from "@prisma/client";

import {
  isCoverCandidateKind,
  isPhysicalNonCoverKind,
  resolveAttachmentDisplayRegion,
  resolveAttachmentSemantics,
} from "@/lib/media/attachmentDisplayLabels";
import {
  localeBonusForAttachmentRole,
  regionRank,
} from "@/lib/locale/preference";
import {
  coverProvenanceRank,
  resolveCoverProvenance,
} from "@/lib/media/coverProvenance";
import { MIN_COVER_SHORTEST_EDGE, isCoverResolutionAcceptable, shortestImageEdge } from "@/lib/media/coverResolution";
import { exposureScoreAdjustment, isUnderexposedCoverScan } from "@/lib/media/coverExposure";
import {
  detectVideoGamePlatformKey,
  getPlatformKeyByScreenScraperSystemId,
  isVideoGamePlatformKey,
  type VideoGamePlatformKey,
} from "@/lib/games/platforms";

// When the same image is contributed by several sources, it may carry different
// region tags (e.g. "wor" from one, "fr" from another). Keep the most valuable
// region (France > Europe > World > …) so the merged attachment never loses a
// better localisation than the one it happened to be seen with first.
function mergeRolesByRegion(
  a?: string | null,
  b?: string | null,
): string | null {
  if (!a) return b ?? null;
  if (!b) return a ?? null;
  const rankA = regionRank(
    resolveAttachmentDisplayRegion({ type: "image", role: a }),
  );
  const rankB = regionRank(
    resolveAttachmentDisplayRegion({ type: "image", role: b }),
  );
  return rankA <= rankB ? a : b;
}

// When the very same image URL is contributed by several independent sources,
// that agreement is a strong signal it really depicts the product, so it earns
// a display-ranking bonus. Counted per distinct source and capped so it breaks
// ties between comparable images without overriding type/quality semantics.
const CROSS_SOURCE_CONSENSUS_BONUS = 40;
const MAX_CONSENSUS_SOURCES = 4;

function normalizeAttachmentSource(source?: string | null): string | null {
  if (!source) return null;
  // Image sources are provider ids; drop any "· region" / "/ variant" suffix so
  // the same provider is not double-counted.
  const normalized = source.split(/[·/]/)[0].toLowerCase().trim();
  return normalized || null;
}

function crossSourceConsensusBonus(distinctSourceCount: number): number {
  if (distinctSourceCount <= 1) return 0;
  const extraSources = Math.min(distinctSourceCount, MAX_CONSENSUS_SOURCES) - 1;
  return extraSources * CROSS_SOURCE_CONSENSUS_BONUS;
}

export interface AttachmentImageMetrics {
  width?: number;
  height?: number;
  format?: string;
  /** Average RGB luminance sampled from the asset (0–255). */
  meanLuminance?: number;
  /** Share of sampled pixels below the dark-luminance threshold. */
  darkPixelRatio?: number;
}

export type ScoredAttachmentInput = {
  type: AttachmentType;
  url: string;
  role?: string | null;
  source?: string | null;
  title?: string | null;
  providerLabel?: string | null;
  /**
   * Provider-declared cover traits, stamped server-side (the scorer is client-safe
   * and cannot read the registry). `isFullWrapCoverSource` marks a full front+back
   * wrap (penalised). See `@/services/provider/sourceTraits`.
   */
  isFullWrapCoverSource?: boolean;
  strictShelfPlatformCoverSource?: boolean;
  providerImageScoreAdjustment?: number;
  /**
   * Provider-declared, URL-derived source context of the image
   * (catalog / listing_photo / user_photo). Stamped server-side from
   * `ProviderInfo.coverProvenanceRules`; drives the provenance tier in
   * `rankCoversForDisplay` so a photographed copy ranks below catalog art of the
   * same region. See `@/lib/media/coverProvenance`.
   */
  coverProvenance?: string | null;
};

export type AttachmentDisplayScoreOptions = {
  /** Shelf / requested game platform — boosts matching covers, penalises mismatches. */
  requestedPlatformKey?: string | null;
};

export interface AttachmentDisplayScoreDetails {
  score: number;
  signals: string[];
  width?: number;
  height?: number;
  aspectRatio?: number;
  format?: string;
}

const DISPLAY_ATTACHMENT_BASE_SCORE: Partial<Record<AttachmentType, number>> = {
  cover: 620,
  artwork: 430,
  image: 330,
  screenshot: 230,
  background: 190,
  logo: 120,
  audio: 20,
};

export const DISPLAY_COVER_PRIORITY_ORDER: AttachmentType[] = [
  "cover",
  "artwork",
  "image",
  "screenshot",
  "background",
  "logo",
];

const COVER_FRIENDLY_TYPES = new Set<AttachmentType>([
  "cover",
  "artwork",
  "image",
]);

function attachmentSemantics(attachment: ScoredAttachmentInput) {
  return resolveAttachmentSemantics({
    type: attachment.type,
    role: attachment.role,
    title: attachment.title,
    source: attachment.source,
  });
}

export function isDiscOrSupportCoverCandidate(
  attachment: ScoredAttachmentInput,
): boolean {
  const { kind } = attachmentSemantics(attachment);
  if (isPhysicalNonCoverKind(kind)) return true;

  const role = (attachment.role || "").toLowerCase();
  const url = (attachment.url || "").toLowerCase();
  const signal = `${role} ${url}`;
  return /\b(support|texture)\b/.test(signal);
}

function detectPlatformKeysInText(text: string): Set<VideoGamePlatformKey> {
  const keys = new Set<VideoGamePlatformKey>();
  const direct = detectVideoGamePlatformKey(text);
  if (direct) keys.add(direct);

  const systemMatch = text.match(/systemeid=(\d+)/i);
  if (systemMatch) {
    const fromScreenScraper = getPlatformKeyByScreenScraperSystemId(
      Number(systemMatch[1]),
    );
    if (fromScreenScraper) keys.add(fromScreenScraper);
  }

  for (const segment of text.toLowerCase().split(/[^a-z0-9]+/)) {
    if (!segment) continue;
    if (isVideoGamePlatformKey(segment)) {
      keys.add(segment);
      continue;
    }
    const detected = detectVideoGamePlatformKey(segment);
    if (detected) keys.add(detected);
  }

  return keys;
}

function detectAttachmentPlatformKeys(
  attachment: ScoredAttachmentInput,
): Set<VideoGamePlatformKey> {
  const haystack = [
    attachment.url,
    attachment.title,
    attachment.role,
    attachment.source,
  ]
    .filter(Boolean)
    .join(" ");
  return detectPlatformKeysInText(haystack);
}

function platformAlignmentScore(
  attachment: ScoredAttachmentInput,
  requestedPlatformKey?: string | null,
): number {
  if (
    !requestedPlatformKey ||
    !isVideoGamePlatformKey(requestedPlatformKey)
  ) {
    return 0;
  }

  const detected = detectAttachmentPlatformKeys(attachment);
  if (detected.size === 0) return 0;
  if (detected.has(requestedPlatformKey)) return 280;
  return -450;
}

function detectAttachmentPlatformKeysForMismatchRank(
  attachment: ScoredAttachmentInput,
): Set<VideoGamePlatformKey> {
  const parts: Array<string | null | undefined> = [
    attachment.title,
    attachment.role,
  ];
  if (attachment.strictShelfPlatformCoverSource) {
    parts.push(attachment.url);
  }
  const haystack = parts.filter(Boolean).join(" ");
  return detectPlatformKeysInText(haystack);
}

function platformMismatchRank(
  attachment: ScoredAttachmentInput,
  requestedPlatformKey?: string | null,
): number {
  return isAttachmentCoverPlatformMismatch(attachment, requestedPlatformKey)
    ? 1
    : 0;
}

/** True when title/role explicitly names a platform that differs from the shelf. */
export function isAttachmentCoverPlatformMismatch(
  attachment: ScoredAttachmentInput,
  requestedPlatformKey?: string | null,
): boolean {
  if (
    !requestedPlatformKey ||
    !isVideoGamePlatformKey(requestedPlatformKey)
  ) {
    return false;
  }

  const detected = detectAttachmentPlatformKeysForMismatchRank(attachment);
  if (detected.size === 0) return false;
  return !detected.has(requestedPlatformKey);
}

/** Gallery visibility on a platform-specific game shelf. */
export function shouldShowCoverAttachmentOnShelf(
  attachment: ScoredAttachmentInput,
  requestedPlatformKey?: string | null,
): boolean {
  if (
    !requestedPlatformKey ||
    !isVideoGamePlatformKey(requestedPlatformKey)
  ) {
    return true;
  }

  if (isAttachmentCoverPlatformMismatch(attachment, requestedPlatformKey)) {
    return false;
  }

  if (!attachment.strictShelfPlatformCoverSource) {
    return true;
  }

  const detected = detectAttachmentPlatformKeysForMismatchRank(attachment);
  return detected.has(requestedPlatformKey);
}

function buildAttachmentDisplayScoreDetails(
  attachment: ScoredAttachmentInput,
  imageMetrics?: AttachmentImageMetrics | null,
  options?: AttachmentDisplayScoreOptions,
): AttachmentDisplayScoreDetails {
  let score = DISPLAY_ATTACHMENT_BASE_SCORE[attachment.type] ?? 80;
  const signals: string[] = [];
  const addSignal = (delta: number, label: string) => {
    score += delta;
    signals.push(`${delta >= 0 ? "+" : ""}${delta} ${label}`);
  };

  signals.push(`base ${score} (${attachment.type})`);
  const semantics = attachmentSemantics(attachment);
  const role = (attachment.role || "").toLowerCase();
  const url = (attachment.url || "").toLowerCase();
  const signal = `${role} ${url}`;
  const localeBonus = localeBonusForAttachmentRole(semantics.region);
  if (localeBonus !== 0) {
    addSignal(localeBonus, `locale ${semantics.region || role || "unknown"}`);
  }

  if (isPhysicalNonCoverKind(semantics.kind)) {
    addSignal(-320, `${semantics.kind} media`);
  } else if (isDiscOrSupportCoverCandidate(attachment)) {
    addSignal(-320, "disc/support media");
  }

  if (COVER_FRIENDLY_TYPES.has(attachment.type)) {
    const providerAdjustment = Number.isFinite(
      attachment.providerImageScoreAdjustment,
    )
      ? Math.round(attachment.providerImageScoreAdjustment || 0)
      : 0;
    if (providerAdjustment !== 0) {
      addSignal(providerAdjustment, "provider image source");
    }
    if (semantics.kind === "cover3d") {
      addSignal(-60, "3D cover penalty");
    }
    if (attachment.isFullWrapCoverSource) {
      addSignal(-250, "full wrap cover penalty");
    }
    if (
      isCoverCandidateKind(semantics.kind) &&
      /(front|cover|box[-_\s]?art|box[-_\s]?2d|jaquette|poster|keyart|official)/.test(
        signal,
      )
    ) {
      addSignal(90, "front/cover signal");
    }
    if (
      !isPhysicalNonCoverKind(semantics.kind) &&
      /\b(?:back|rear|verso|spine|disc|inside)\b/.test(signal)
    ) {
      addSignal(-220, "back/disc signal");
    }
    if (/\bmedia\b(?!=)/.test(signal)) {
      addSignal(-220, "back/disc media signal");
    }
    if (
      /(thumb|tiny|small|icon|avatar|capsule|header|banner|preview|sprite)/.test(
        signal,
      )
    ) {
      addSignal(-170, "thumbnail-like signal");
    }
    if (/(full|large|original|highres|hires|1080|1440|2160|4k)/.test(signal)) {
      addSignal(35, "high-resolution hint");
    }
    if (/(background|wallpaper|fanart)/.test(signal)) {
      addSignal(-55, "background-like signal");
    }
    const platformDelta = platformAlignmentScore(
      attachment,
      options?.requestedPlatformKey,
    );
    if (platformDelta !== 0) {
      addSignal(platformDelta, "platform alignment");
    }
    if (
      imageMetrics?.meanLuminance != null &&
      imageMetrics.darkPixelRatio != null
    ) {
      const exposureDelta = exposureScoreAdjustment({
        meanLuminance: imageMetrics.meanLuminance,
        darkPixelRatio: imageMetrics.darkPixelRatio,
      });
      if (exposureDelta !== 0) {
        addSignal(exposureDelta, "underexposed scan");
      }
    }
  } else if (
    attachment.type === "screenshot" ||
    attachment.type === "background"
  ) {
    if (/(thumb|tiny|small|icon)/.test(signal))
      addSignal(-60, "small screenshot");
    if (/(full|large|1080|1440|2160|4k)/.test(signal)) {
      addSignal(20, "large screenshot");
    }
  }

  const width = imageMetrics?.width;
  const height = imageMetrics?.height;
  const format = imageMetrics?.format;
  if (width && height) {
    const area = width * height;
    if (area >= 2_000_000) addSignal(120, ">=2MP");
    else if (area >= 1_000_000) addSignal(80, ">=1MP");
    else if (area >= 500_000) addSignal(45, ">=0.5MP");
    else if (area >= 200_000) addSignal(10, ">=0.2MP");
    else addSignal(-120, "<0.2MP");

    if (Math.min(width, height) < MIN_COVER_SHORTEST_EDGE) {
      addSignal(-140, "small shortest edge");
    }

    const ratio = width / height;
    if (COVER_FRIENDLY_TYPES.has(attachment.type)) {
      const targetRatio = 0.7;
      const ratioDistance = Math.abs(ratio - targetRatio);
      addSignal(
        Math.max(-120, 140 - ratioDistance * 260),
        "cover aspect ratio fit",
      );
      if (height > width) addSignal(25, "portrait orientation");
      else addSignal(-65, "landscape orientation");
    } else if (
      attachment.type === "screenshot" ||
      attachment.type === "background"
    ) {
      const targetRatio = 16 / 9;
      const ratioDistance = Math.abs(ratio - targetRatio);
      addSignal(
        Math.max(-70, 70 - ratioDistance * 90),
        "screenshot aspect ratio fit",
      );
    }
  }

  return {
    score: Math.round(score),
    signals,
    width: width || undefined,
    height: height || undefined,
    aspectRatio:
      width && height ? Number((width / height).toFixed(3)) : undefined,
    format: format || undefined,
  };
}

export function explainAttachmentScoreForDisplay(
  attachment: ScoredAttachmentInput,
  imageMetrics?: AttachmentImageMetrics | null,
  options?: AttachmentDisplayScoreOptions,
): AttachmentDisplayScoreDetails {
  return buildAttachmentDisplayScoreDetails(attachment, imageMetrics, options);
}

export function scoreAttachmentForDisplay(
  attachment: ScoredAttachmentInput,
  imageMetrics?: AttachmentImageMetrics | null,
  options?: AttachmentDisplayScoreOptions,
): number {
  return explainAttachmentScoreForDisplay(
    attachment,
    imageMetrics,
    options,
  ).score;
}

export function rankScoredAttachments<T extends ScoredAttachmentInput>(
  scoredEntries: Array<{ attachment: T; score: number; index: number }>,
): T[] {
  const bestByUrl = new Map<
    string,
    { attachment: T; score: number; index: number; sources: Set<string> }
  >();

  for (const entry of scoredEntries) {
    if (!entry.attachment.url) continue;
    const source = normalizeAttachmentSource(entry.attachment.source);
    const existing = bestByUrl.get(entry.attachment.url);
    if (!existing) {
      bestByUrl.set(entry.attachment.url, {
        attachment: entry.attachment,
        score: entry.score,
        index: entry.index,
        sources: new Set(source ? [source] : []),
      });
    } else {
      const mergedRole = mergeRolesByRegion(
        existing.attachment.role,
        entry.attachment.role,
      );
      const mergedSource =
        existing.attachment.source || entry.attachment.source || null;
      const mergedTitle =
        existing.attachment.title || entry.attachment.title || null;

      const mergedAttachment: T = {
        ...existing.attachment,
        role: mergedRole,
        source: mergedSource,
        title: mergedTitle,
      };

      const keepExisting =
        existing.score > entry.score ||
        (existing.score === entry.score && existing.index < entry.index);

      if (source) existing.sources.add(source);

      bestByUrl.set(entry.attachment.url, {
        attachment: mergedAttachment,
        score: keepExisting ? existing.score : entry.score,
        index: keepExisting ? existing.index : entry.index,
        sources: existing.sources,
      });
    }
  }

  return Array.from(bestByUrl.values())
    .map((entry) => ({
      attachment: entry.attachment,
      index: entry.index,
      score: entry.score + crossSourceConsensusBonus(entry.sources.size),
    }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((entry) => entry.attachment);
}

export function rankAttachmentsForDisplay<T extends ScoredAttachmentInput>(
  attachments: T[],
  imageMetricsByUrl?: Map<string, AttachmentImageMetrics | null>,
  options?: AttachmentDisplayScoreOptions,
): T[] {
  return rankScoredAttachments(
    attachments.map((attachment, index) => ({
      attachment,
      index,
      score: scoreAttachmentForDisplay(
        attachment,
        imageMetricsByUrl?.get(attachment.url),
        options,
      ),
    })),
  );
}

export function pickBestDisplayImageUrl(
  attachments: Array<Pick<ScoredAttachmentInput, "type" | "url">>,
): string | undefined {
  for (const type of DISPLAY_COVER_PRIORITY_ORDER) {
    const candidate = attachments.find(
      (attachment) => attachment.type === type && Boolean(attachment.url),
    );
    if (candidate?.url) return candidate.url;
  }
  return attachments.find((attachment) => Boolean(attachment.url))?.url;
}

// Types that can serve as a wide hero/background. Covers/logos are excluded:
// they are portrait or tiny and look bad stretched behind the page.
const BACKGROUND_CANDIDATE_TYPES = new Set<AttachmentType>([
  "background",
  "artwork",
  "screenshot",
  "image",
]);

// A hero banner is displayed large, so demand a genuinely high-resolution
// source — otherwise leave it empty and let the caller fall back.
const MIN_BACKGROUND_SHORTEST_EDGE = 600;

/**
 * Picks the highest-quality landscape image to use as a hero/background, reusing
 * the existing display scorer (its resolution signals are type-agnostic) but via
 * the landscape aspect branch so wide photos win over portrait covers. Requires
 * known dimensions ≥ {@link MIN_BACKGROUND_SHORTEST_EDGE} so a pixelated source
 * is never promoted; returns null when nothing qualifies.
 */
export function pickBestBackgroundFromAttachments<
  T extends ScoredAttachmentInput,
>(
  attachments: T[],
  imageMetricsByUrl?: Map<string, AttachmentImageMetrics | null>,
): string | null {
  let best: { url: string; score: number } | null = null;
  for (const attachment of attachments) {
    if (!attachment.url) continue;
    if (!BACKGROUND_CANDIDATE_TYPES.has(attachment.type)) continue;
    const { kind } = attachmentSemantics(attachment);
    if (isPhysicalNonCoverKind(kind)) continue; // skip back/disc/spine

    const metrics = imageMetricsByUrl?.get(attachment.url);
    if (
      !metrics?.width ||
      !metrics?.height ||
      Math.min(metrics.width, metrics.height) < MIN_BACKGROUND_SHORTEST_EDGE
    ) {
      continue;
    }

    // Score as a "background" so the landscape (16:9) aspect branch applies
    // while reusing the shared resolution signals.
    const score = scoreAttachmentForDisplay(
      { ...attachment, type: "background" },
      metrics,
    );
    if (!best || score > best.score) {
      best = { url: attachment.url, score };
    }
  }
  return best?.url ?? null;
}

export function rankCoversForDisplay<T extends ScoredAttachmentInput>(
  attachments: T[],
  imageMetricsByUrl?: Map<string, AttachmentImageMetrics | null>,
  options?: AttachmentDisplayScoreOptions,
): T[] {
  const scored = attachments.map((attachment, index) => {
    const semantics = attachmentSemantics(attachment);
    const is3d = semantics.kind === "cover3d";
    const isFullWrap = attachment.isFullWrapCoverSource === true;
    const isFrontCover =
      isCoverCandidateKind(semantics.kind) &&
      !isPhysicalNonCoverKind(semantics.kind);

    let typeRank = 3; // default for non-front covers (back, disc, spine, etc.)
    if (isFrontCover) {
      if (is3d) {
        typeRank = 1; // 3D
      } else if (isFullWrap) {
        typeRank = 2; // full wrap (front+back spread)
      } else {
        typeRank = 0; // 2D Standard
      }
    }

    const metrics = imageMetricsByUrl?.get(attachment.url);
    return {
      attachment,
      index,
      typeRank,
      platformMismatchRank: platformMismatchRank(
        attachment,
        options?.requestedPlatformKey,
      ),
      regionRankValue: regionRank(semantics.region),
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
      regionRankValue: number;
      provenanceRank: number;
      shortestEdge: number;
      sources: Set<string>;
    }
  >();

  for (const entry of scored) {
    if (!entry.attachment.url) continue;
    const source = normalizeAttachmentSource(entry.attachment.source);
    const existing = bestByUrl.get(entry.attachment.url);
    if (!existing) {
      bestByUrl.set(entry.attachment.url, {
        ...entry,
        sources: new Set(source ? [source] : []),
      });
    } else {
      const mergedRole = mergeRolesByRegion(
        existing.attachment.role,
        entry.attachment.role,
      );
      const mergedSource =
        existing.attachment.source || entry.attachment.source || null;
      const mergedTitle =
        existing.attachment.title || entry.attachment.title || null;

      const mergedAttachment: T = {
        ...existing.attachment,
        role: mergedRole,
        source: mergedSource,
        title: mergedTitle,
      };

      const keepExisting =
        existing.typeRank < entry.typeRank ||
        (existing.typeRank === entry.typeRank &&
          existing.platformMismatchRank < entry.platformMismatchRank) ||
        (existing.typeRank === entry.typeRank &&
          existing.platformMismatchRank === entry.platformMismatchRank &&
          (existing.regionRankValue < entry.regionRankValue ||
            (existing.regionRankValue === entry.regionRankValue &&
              (existing.provenanceRank < entry.provenanceRank ||
                (existing.provenanceRank === entry.provenanceRank &&
                  (existing.score > entry.score ||
                    (existing.score === entry.score &&
                      (existing.shortestEdge > entry.shortestEdge ||
                        (existing.shortestEdge === entry.shortestEdge &&
                          existing.index < entry.index)))))))));

      if (source) existing.sources.add(source);

      bestByUrl.set(entry.attachment.url, {
        attachment: mergedAttachment,
        sources: existing.sources,
        score: keepExisting ? existing.score : entry.score,
        index: keepExisting ? existing.index : entry.index,
        typeRank: keepExisting ? existing.typeRank : entry.typeRank,
        platformMismatchRank: keepExisting
          ? existing.platformMismatchRank
          : entry.platformMismatchRank,
        regionRankValue: keepExisting
          ? existing.regionRankValue
          : entry.regionRankValue,
        provenanceRank: keepExisting
          ? existing.provenanceRank
          : entry.provenanceRank,
        shortestEdge: keepExisting ? existing.shortestEdge : entry.shortestEdge,
      });
    }
  }

  return Array.from(bestByUrl.values())
    .map((entry) => ({
      ...entry,
      score: entry.score + crossSourceConsensusBonus(entry.sources.size),
    }))
    .sort(
      (a, b) =>
        a.typeRank - b.typeRank ||
        a.platformMismatchRank - b.platformMismatchRank ||
        a.regionRankValue - b.regionRankValue ||
        a.provenanceRank - b.provenanceRank ||
        b.score - a.score ||
        b.shortestEdge - a.shortestEdge ||
        a.index - b.index,
    )
    .map((entry) => entry.attachment);
}

function isRejectedCoverAsset(
  _attachment: ScoredAttachmentInput | null | undefined,
  metrics?: AttachmentImageMetrics | null,
): boolean {
  if (!metrics) return false;
  return isUnderexposedCoverScan(metrics);
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
    if (isRejectedCoverAsset(attachment, metrics)) continue;

    const semantics = attachmentSemantics(attachment);
    if (isPhysicalNonCoverKind(semantics.kind)) continue;
    if (
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
    ? imageMetricsByUrl?.get(preferred.url) ?? null
    : null;

  if (
    preferred?.url &&
    isCoverResolutionAcceptable(preferredMetrics) &&
    !isRejectedCoverAsset(preferred, preferredMetrics)
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
      attachment.url &&
      !isRejectedCoverAsset(
        attachment,
        imageMetricsByUrl?.get(attachment.url),
      ),
  );
  return fallback?.url ?? preferred?.url ?? null;
}

/** Shared cover ordering for the default picker and gallery UIs. */
export function rankCoverGalleryAttachments<T extends ScoredAttachmentInput>(
  attachments: T[],
  imageMetricsByUrl?: Map<string, AttachmentImageMetrics | null>,
  options?: AttachmentDisplayScoreOptions,
): T[] {
  const coverCandidates = attachments.filter((attachment) => {
    if (!attachment.url) return false;
    const semantics = attachmentSemantics(attachment);
    return (
      isCoverCandidateKind(semantics.kind) &&
      !isPhysicalNonCoverKind(semantics.kind)
    );
  });

  if (coverCandidates.length > 0) {
    return rankCoversForDisplay(coverCandidates, imageMetricsByUrl, options);
  }

  return rankAttachmentsForDisplay(attachments, imageMetricsByUrl, options);
}

const COVER_ATTACHMENT_TYPES = new Set(["cover", "artwork", "image"]);

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

  const rankedCovers = rankCoverGalleryAttachments(
    covers,
    imageMetricsByUrl,
    options,
  );
  return [...rankedCovers, ...nonCovers];
}
