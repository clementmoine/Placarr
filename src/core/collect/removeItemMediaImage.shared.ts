/**
 * Client-safe helpers for gallery image removal — no Prisma / Node builtins.
 * The server mutation lives in {@link ./removeItemMediaImage}.
 */
import { pickBestCoverFromAttachments } from "@/core/enrich/media/coverDisplayRank";
import { urlsReferToSameLocalizedImage } from "@/core/enrich/media/coverUrl";
import type { Attachment } from "@/generated/prisma/browser";

const COVER_TYPES = new Set(["cover", "artwork", "image"]);

export function mediaUrlMatchesTarget(
  candidate: string | null | undefined,
  target: string,
): boolean {
  const left = candidate?.trim();
  const right = target.trim();
  if (!left || !right) return false;
  return urlsReferToSameLocalizedImage(left, right);
}

export function filterAttachmentsRemovingUrl<
  T extends { url?: string | null },
>(attachments: readonly T[], targetUrl: string): T[] {
  return attachments.filter(
    (attachment) => !mediaUrlMatchesTarget(attachment.url, targetUrl),
  );
}

export function nextCoverUrlAfterRemoval(
  remaining: readonly Attachment[],
  requestedPlatformKey?: string | null,
): string | null {
  const coverPool = remaining.filter(
    (attachment) =>
      attachment.url?.trim() && COVER_TYPES.has(attachment.type),
  );
  if (coverPool.length === 0) return null;
  return pickBestCoverFromAttachments(coverPool, undefined, {
    requestedPlatformKey: requestedPlatformKey ?? undefined,
  });
}
