import type { AttachmentType } from "@prisma/client";

import {
  isCoverCandidateKind,
  isPhysicalNonCoverKind,
  resolveAttachmentDisplayRegion,
  resolveAttachmentSemantics,
} from "@/core/enrich/media/attachmentDisplayLabels";
import {
  localeBonusForAttachmentRole,
  regionRank,
  type LocalePreferenceOptions,
} from "@/core/locale/preference";
import {
  coverProvenanceRank,
  resolveCoverProvenance,
} from "@/core/enrich/media/coverProvenance";
import { isCoverEligibleAttachmentType } from "@/core/enrich/media/coverUrl";
import {
  coverUrlExpectsHighResolution,
  isCoverResolutionAcceptable,
  shortestImageEdge,
} from "@/core/enrich/media/coverResolution";
import { exposureScoreAdjustment } from "@/core/enrich/media/coverExposure";
import {
  detectVideoGamePlatformKey,
  getPlatformKeyByScreenScraperSystemId,
  isVideoGamePlatformKey,
  type VideoGamePlatformKey,
} from "@/core/identify/platforms/platforms";

// When the same image is contributed by several sources, it may carry different
// region tags (e.g. "wor" from one, "fr" from another). Keep the most valuable
// region (France > Europe > World > …) so the merged attachment never loses a
// better localisation than the one it happened to be seen with first.
function mergeRolesByRegion(
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

function normalizeAttachmentSource(source?: string | null): string | null {
  if (!source) return null;
  // Image sources are provider ids; drop any "· region" / "/ variant" suffix so
  // the same provider is not double-counted.
  const normalized = source.split(/[·/]/)[0].toLowerCase().trim();
  return normalized || null;
}

/** Prefer catalog provenance over a synthetic honor pin for the same file. */
function preferredDisplaySource(
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
   * Contributor source ids collected when several providers share this URL.
   * Display-only — formatted by `getAttachmentGalleryLabels`.
   */
  sourceNames?: string[] | null;
  /**
   * Provider-declared cover traits, stamped server-side (the scorer is client-safe
   * and cannot read the registry). `isFullWrapCoverSource` marks a full front+back
   * wrap (penalised). See `@/core/catalog/sourceTraits`.
   */
  isFullWrapCoverSource?: boolean;
  strictShelfPlatformCoverSource?: boolean;
  /** Provider-declared game-media gallery source; kept visible on platform shelves. */
  isGameMediaGallerySource?: boolean;
  providerImageScoreAdjustment?: number;
  /**
   * Provider-declared, URL-derived source context of the image
   * (catalog / listing_photo / user_photo). Stamped server-side from
   * `ProviderInfo.coverProvenanceRules`; drives the provenance tier in
   * `rankCoversForDisplay` so a photographed copy ranks below catalog art of the
   * same region. See `@/core/enrich/media/coverProvenance`.
   */
  coverProvenance?: string | null;
  /**
   * Platform this cover belongs to, persisted at enrichment from the provider's
   * original image URL (before localization strips the signal). Read as an
   * authoritative platform signal by the mismatch/alignment detection so a
   * foreign-console cover is recognised even after its URL became a local path.
   * See the `platformKey` column in `prisma/schema.prisma`.
   */
  platformKey?: string | null;
};

import type { Locale } from "@/types/i18n";

export type AttachmentDisplayScoreOptions = LocalePreferenceOptions & {
  /** Shelf / requested game platform — boosts matching covers, penalises mismatches. */
  requestedPlatformKey?: string | null;
  uiLocale?: Locale | null;
  /**
   * Loose game copies: prefer disc / support art as the default cover instead of
   * the box front (display-time only — catalog metadata.imageUrl stays the box).
   */
  preferDiscCover?: boolean;
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

/** True when this attachment is disc / cartouche art (not box back or spine). */
export function isDiscCoverAttachment(
  attachment: ScoredAttachmentInput,
): boolean {
  return attachmentSemantics(attachment).kind === "disc";
}

/**
 * Platform a cover belongs to, derived from its (original, pre-localization)
 * provider URL. Returns a key only when the URL yields exactly one platform, so a
 * noisy path can't mis-tag a cover. Used at enrichment to persist
 * `Attachment.platformKey` while the remote URL still carries the signal
 * (ScreenScraper `systemeid`, hdjv `/PS3/` path segment, …).
 */
export function deriveAttachmentPlatformKeyFromUrl(
  url?: string | null,
): VideoGamePlatformKey | null {
  if (!url) return null;
  let decoded = url;
  try {
    decoded = decodeURIComponent(url);
  } catch {
    decoded = url;
  }
  // Prefer whole-string detection so compound paths like HDJV `/XBox-360/`
  // resolve to xbox360 instead of conflicting with a bare `xbox` segment.
  const direct = detectVideoGamePlatformKey(decoded);
  if (direct) return direct;
  const detected = detectPlatformKeysInText(decoded);
  return detected.size === 1 ? [...detected][0] : null;
}

function isRemoteAttachmentUrl(url?: string | null): boolean {
  return Boolean(url && /^https?:\/\//i.test(url));
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
    attachment.title,
    attachment.role,
    attachment.source,
    // Persisted platform survives localization (the URL no longer carries it).
    attachment.platformKey,
    // Only remote URLs carry trustworthy platform path segments — localized
    // `/uploads/*.jpg` hashes false-positive on substrings like "vita".
    ...(isRemoteAttachmentUrl(attachment.url) ? [attachment.url] : []),
  ]
    .filter(Boolean)
    .join(" ");
  return detectPlatformKeysInText(haystack);
}

function platformAlignmentScore(
  attachment: ScoredAttachmentInput,
  requestedPlatformKey?: string | null,
): number {
  if (!requestedPlatformKey || !isVideoGamePlatformKey(requestedPlatformKey)) {
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
    // Authoritative platform persisted at enrichment — the load-bearing signal
    // once the URL has been localized to a signal-less /uploads path.
    attachment.platformKey,
  ];
  if (
    attachment.strictShelfPlatformCoverSource &&
    isRemoteAttachmentUrl(attachment.url)
  ) {
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

/** Explicit shelf-platform match sorts ahead of ambiguous covers on game shelves. */
function platformMatchRank(
  attachment: ScoredAttachmentInput,
  requestedPlatformKey?: string | null,
): number {
  if (!requestedPlatformKey || !isVideoGamePlatformKey(requestedPlatformKey)) {
    return 0;
  }
  const detected = detectAttachmentPlatformKeysForMismatchRank(attachment);
  return detected.has(requestedPlatformKey) ? 0 : 1;
}

/** True when title/role explicitly names a platform that differs from the shelf. */
export function isAttachmentCoverPlatformMismatch(
  attachment: ScoredAttachmentInput,
  requestedPlatformKey?: string | null,
): boolean {
  if (!requestedPlatformKey || !isVideoGamePlatformKey(requestedPlatformKey)) {
    return false;
  }

  const detected = detectAttachmentPlatformKeysForMismatchRank(attachment);
  if (detected.size === 0) return false;
  return !detected.has(requestedPlatformKey);
}

function isCoverGalleryAttachment(attachment: ScoredAttachmentInput): boolean {
  return COVER_FRIENDLY_TYPES.has(attachment.type);
}

/** True when at least one cover in the list explicitly names the shelf platform. */
export function coverListHasShelfPlatformSignal(
  attachments: ScoredAttachmentInput[],
  requestedPlatformKey: VideoGamePlatformKey,
): boolean {
  return attachments.some(
    (attachment) =>
      isCoverGalleryAttachment(attachment) &&
      detectAttachmentPlatformKeysForMismatchRank(attachment).has(
        requestedPlatformKey,
      ),
  );
}

/** True when a shelf-compatible physical box cover exists in the list. */
export function coverListHasShelfCompatibleBoxCover(
  attachments: ScoredAttachmentInput[],
  requestedPlatformKey: VideoGamePlatformKey,
): boolean {
  return attachments.some((attachment) => {
    if (!isCoverGalleryAttachment(attachment)) return false;
    const semantics = attachmentSemantics(attachment);
    if (
      !isCoverCandidateKind(semantics.kind) ||
      isPhysicalNonCoverKind(semantics.kind)
    ) {
      return false;
    }
    if (
      semantics.kind === "grid" ||
      semantics.kind === "grid3d" ||
      semantics.kind === "artwork"
    ) {
      return false;
    }
    const detected = detectAttachmentPlatformKeysForMismatchRank(attachment);
    if (detected.size === 0) return false;
    return detected.has(requestedPlatformKey);
  });
}

/** Cover with no platform in title/role (and URL when strict) on a platform shelf. */
export function isCoverAmbiguousForShelfPlatform(
  attachment: ScoredAttachmentInput,
  requestedPlatformKey?: string | null,
): boolean {
  if (!requestedPlatformKey || !isVideoGamePlatformKey(requestedPlatformKey)) {
    return false;
  }
  if (isAttachmentCoverPlatformMismatch(attachment, requestedPlatformKey)) {
    return false;
  }
  return detectAttachmentPlatformKeysForMismatchRank(attachment).size === 0;
}

/**
 * Whether a cover is removed (not merely demoted) on a platform-specific shelf.
 *
 * Rule: only a cover *positively identified* on a different console is dropped. A
 * cover whose platform we cannot identify is kept — it sinks via ranking rather
 * than disappearing (see `platformAlignmentScore`). `allCovers` is unused now that
 * an unidentified cover no longer depends on whether the set has shelf-platform box
 * art; it is kept for call-site compatibility.
 */
export function shouldSuppressCoverOnPlatformShelf(
  attachment: ScoredAttachmentInput,
  _allCovers: ScoredAttachmentInput[],
  requestedPlatformKey?: string | null,
): boolean {
  if (!requestedPlatformKey || !isVideoGamePlatformKey(requestedPlatformKey)) {
    return false;
  }
  if (attachment.isGameMediaGallerySource) {
    return false;
  }
  return isAttachmentCoverPlatformMismatch(attachment, requestedPlatformKey);
}

/** Gallery visibility on a platform-specific game shelf. */
export function shouldShowCoverAttachmentOnShelf(
  attachment: ScoredAttachmentInput,
  requestedPlatformKey?: string | null,
  allCovers?: ScoredAttachmentInput[],
): boolean {
  if (!requestedPlatformKey || !isVideoGamePlatformKey(requestedPlatformKey)) {
    return true;
  }

  if (isAttachmentCoverPlatformMismatch(attachment, requestedPlatformKey)) {
    return false;
  }

  if (
    allCovers &&
    shouldSuppressCoverOnPlatformShelf(
      attachment,
      allCovers,
      requestedPlatformKey,
    )
  ) {
    return false;
  }

  return true;
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
      if (!(options?.preferDiscCover && isDiscOrSupportCoverCandidate(attachment))) {
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

function coverDisplayTypeRank(
  semantics: ReturnType<typeof attachmentSemantics>,
  attachment: ScoredAttachmentInput,
  options?: AttachmentDisplayScoreOptions,
): number {
  if (options?.preferDiscCover && semantics.kind === "disc") {
    return 0;
  }
  const isFrontCover =
    isCoverCandidateKind(semantics.kind) &&
    !isPhysicalNonCoverKind(semantics.kind);
  if (!isFrontCover) {
    return 5;
  }
  // Box fronts rank after disc art when showing a loose copy.
  if (options?.preferDiscCover) {
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

function compareCoverDisplayRank<
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
