import {
  isCoverCandidateKind,
  isPhysicalNonCoverKind,
} from "@/core/enrich/media/attachmentDisplayLabels";
import {
  detectVideoGamePlatformKey,
  getPlatformKeyByScreenScraperSystemId,
  isVideoGamePlatformKey,
  type VideoGamePlatformKey,
} from "@/core/identify/platforms/platforms";
import {
  attachmentSemantics,
  COVER_FRIENDLY_TYPES,
  type ScoredAttachmentInput,
} from "@/core/enrich/media/attachmentDisplayTypes";

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

export function isRemoteAttachmentUrl(url?: string | null): boolean {
  return Boolean(url && /^https?:\/\//i.test(url));
}

export function detectPlatformKeysInText(
  text: string,
): Set<VideoGamePlatformKey> {
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

export function detectAttachmentPlatformKeys(
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

export function platformAlignmentScore(
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

export function detectAttachmentPlatformKeysForMismatchRank(
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

export function platformMismatchRank(
  attachment: ScoredAttachmentInput,
  requestedPlatformKey?: string | null,
): number {
  return isAttachmentCoverPlatformMismatch(attachment, requestedPlatformKey)
    ? 1
    : 0;
}

/** Explicit shelf-platform match sorts ahead of ambiguous covers on game shelves. */
export function platformMatchRank(
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

export function isCoverGalleryAttachment(
  attachment: ScoredAttachmentInput,
): boolean {
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
