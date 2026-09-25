import type { AttachmentType } from "@/generated/prisma/browser";
import {
  isCoverCandidateKind,
  isPhysicalNonCoverKind,
  resolveAttachmentDisplayRegion,
} from "@/core/enrich/media/attachmentDisplayLabels";
import {
  localeBonusForAttachmentRole,
  regionRank,
} from "@/core/locale/preference";
import { exposureScoreAdjustment } from "@/core/enrich/media/coverExposure";
import {
  attachmentSemantics,
  COVER_FRIENDLY_TYPES,
  DISPLAY_ATTACHMENT_BASE_SCORE,
  DISPLAY_COVER_PRIORITY_ORDER,
  type AttachmentDisplayScoreDetails,
  type AttachmentDisplayScoreOptions,
  type AttachmentImageMetrics,
  type ScoredAttachmentInput,
} from "@/core/enrich/media/attachmentDisplayTypes";
import {
  isDiscOrSupportCoverCandidate,
  platformAlignmentScore,
} from "@/core/enrich/media/attachmentPlatformGate";

export function mergeRolesByRegion(
  a?: string | null,
  b?: string | null,
  options?: AttachmentDisplayScoreOptions,
): string | null {
  if (!a) return b ?? null;
  if (!b) return a ?? null;
  const rankA = regionRank(
    resolveAttachmentDisplayRegion({ type: "image", role: a }),
    options,
  );
  const rankB = regionRank(
    resolveAttachmentDisplayRegion({ type: "image", role: b }),
    options,
  );
  return rankA <= rankB ? a : b;
}

// When the very same image URL is contributed by several independent sources,
// that agreement is a strong signal it really depicts the product, so it earns
// a display-ranking bonus. Counted per distinct source and capped so it breaks
// ties between comparable images without overriding type/quality semantics.
const CROSS_SOURCE_CONSENSUS_BONUS = 40;
const MAX_CONSENSUS_SOURCES = 4;

export function normalizeAttachmentSource(
  source?: string | null,
): string | null {
  if (!source) return null;
  // Image sources are provider ids; drop any "· region" / "/ variant" suffix so
  // the same provider is not double-counted.
  const normalized = source.split(/[·/]/)[0].toLowerCase().trim();
  return normalized || null;
}

/** Prefer catalog provenance over a synthetic honor pin for the same file. */
export function preferredDisplaySource(
  ...candidates: Array<string | null | undefined>
): string | null {
  for (const candidate of candidates) {
    const normalized = normalizeAttachmentSource(candidate);
    if (normalized && normalized !== "user") return candidate ?? null;
  }
  for (const candidate of candidates) {
    if (candidate?.trim()) return candidate;
  }
  return null;
}

export function crossSourceConsensusBonus(distinctSourceCount: number): number {
  if (distinctSourceCount <= 1) return 0;
  const extraSources = Math.min(distinctSourceCount, MAX_CONSENSUS_SOURCES) - 1;
  return extraSources * CROSS_SOURCE_CONSENSUS_BONUS;
}

export function buildAttachmentDisplayScoreDetails(
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
  const localeBonus = localeBonusForAttachmentRole(semantics.region, options);
  if (localeBonus !== 0) {
    addSignal(localeBonus, `locale ${semantics.region || role || "unknown"}`);
  }

  if (isPhysicalNonCoverKind(semantics.kind)) {
    if (options?.preferDiscCover && semantics.kind === "disc") {
      addSignal(280, "loose prefers disc");
    } else {
      addSignal(-320, `${semantics.kind} media`);
    }
  } else if (isDiscOrSupportCoverCandidate(attachment)) {
    if (options?.preferDiscCover) {
      addSignal(280, "loose prefers disc/support");
    } else {
      addSignal(-320, "disc/support media");
    }
  }

  if (options?.preferSystemOnlyCover) {
    const title = (attachment.title || "").toLowerCase();
    if (/\bsystem\s*only\b/.test(title) || /^loose$/.test(title.trim())) {
      addSignal(280, "loose prefers system-only");
    } else if (/\bconsole\b/.test(title) && !/\bbox\b/.test(title)) {
      addSignal(200, "loose prefers console shot");
    } else if (
      isCoverCandidateKind(semantics.kind) &&
      /(front|cover|box[-_\s]?art|box\s*view|main\s*image|jaquette)/.test(
        `${title} ${signal}`,
      )
    ) {
      addSignal(-40, "box front demoted for loose hardware");
    }
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
      if (options?.preferDiscCover) {
        addSignal(-40, "box front demoted for loose");
      } else {
        addSignal(90, "front/cover signal");
      }
    }
    if (
      !isPhysicalNonCoverKind(semantics.kind) &&
      /\b(?:back|rear|verso|spine|disc|inside)\b/.test(signal)
    ) {
      if (!(options?.preferDiscCover && /\bdisc\b/.test(signal))) {
        addSignal(-220, "back/disc signal");
      }
    }
    if (/\bmedia\b(?!=)/.test(signal)) {
      if (!(
        options?.preferDiscCover && isDiscOrSupportCoverCandidate(attachment)
      )) {
        addSignal(-220, "back/disc media signal");
      }
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
  return explainAttachmentScoreForDisplay(attachment, imageMetrics, options)
    .score;
}

export function rankScoredAttachments<T extends ScoredAttachmentInput>(
  scoredEntries: Array<{ attachment: T; score: number; index: number }>,
  options?: AttachmentDisplayScoreOptions,
): T[] {
  const bestByUrl = new Map<
    string,
    {
      attachment: T;
      score: number;
      index: number;
      sources: Set<string>;
      sourceLabels: Set<string>;
    }
  >();

  const rememberSource = (
    bucket: { sources: Set<string>; sourceLabels: Set<string> },
    attachment: T,
    source: string | null,
  ) => {
    if (!source) return;
    bucket.sources.add(source);
    // Honor pins are not a visual provenance — omit "Perso" when a real
    // provider also contributed this same file.
    if (source === "user") return;
    const label = attachment.providerLabel?.trim();
    if (label) bucket.sourceLabels.add(label);
    else bucket.sourceLabels.add(source);
  };

  for (const entry of scoredEntries) {
    if (!entry.attachment.url) continue;
    const source = normalizeAttachmentSource(entry.attachment.source);
    const existing = bestByUrl.get(entry.attachment.url);
    if (!existing) {
      const sources = new Set<string>();
      const sourceLabels = new Set<string>();
      rememberSource({ sources, sourceLabels }, entry.attachment, source);
      bestByUrl.set(entry.attachment.url, {
        attachment: entry.attachment,
        score: entry.score,
        index: entry.index,
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
        !preferIncomingProvider &&
        (existing.score > entry.score ||
          (existing.score === entry.score && existing.index < entry.index));

      rememberSource(existing, entry.attachment, source);

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
        score: keepExisting ? existing.score : entry.score,
        index: keepExisting ? existing.index : entry.index,
        sources: existing.sources,
        sourceLabels: existing.sourceLabels,
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
        attachment,
        index: entry.index,
        score: entry.score + crossSourceConsensusBonus(entry.sources.size),
      };
    })
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
    options,
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
